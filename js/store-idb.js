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
    addHistory: (h) => wrap(tx('history', 'readwrite').add(h)),
    historyFor: (id) => wrap(tx('history').index('eventId').getAll(id)),
  };
}
