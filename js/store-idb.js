// IndexedDB store. Same interface as store-memory.js.
const DB_NAME = 'headache-diary';
const DB_VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('events', { keyPath: 'id' });
      const h = db.createObjectStore('history', { autoIncrement: true });
      h.createIndex('eventId', 'eventId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function createIdbStore() {
  const db = await open();
  const tx = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
  return {
    putEvent: (e) => wrap(tx('events', 'readwrite').put(e)),
    getEvent: (id) => wrap(tx('events').get(id)),
    allEvents: () => wrap(tx('events').getAll()),
    /** One transaction: both records are saved, or neither is. */
    putWithHistory(e, h) {
      return new Promise((res, rej) => {
        const t = db.transaction(['events', 'history'], 'readwrite');
        t.objectStore('events').put(e); t.objectStore('history').add(h);
        t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    },
    addHistory: (h) => wrap(tx('history', 'readwrite').add(h)),
    clearAll: () => Promise.all([wrap(tx('events', 'readwrite').clear()), wrap(tx('history', 'readwrite').clear())]).then(() => undefined),
    async purgeEvents(ids) {
      const gone = new Set(ids);
      const t = db.transaction(['events', 'history'], 'readwrite');
      const ev = t.objectStore('events'), hs = t.objectStore('history');
      for (const id of gone) ev.delete(id);
      await new Promise((res, rej) => {
        const cur = hs.openCursor();
        cur.onsuccess = () => { const c = cur.result; if (!c) return res(); if (gone.has(c.value.eventId)) c.delete(); c.continue(); };
        cur.onerror = () => rej(cur.error);
      });
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    },
    allHistory: () => wrap(tx('history').getAll()),
    historyFor: (id) => wrap(tx('history').index('eventId').getAll(id)),
  };
}
