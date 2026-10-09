// Append-only event log. Entries are never physically deleted: edits and deletes
// keep the old version in a history list (visible to doctors, hidden from the patient).
import { dayKey } from './time.js';

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function needReason(reason) {
  if (!reason || !String(reason).trim()) throw new Error('A reason is required');
}

// Strictly increasing counter so two entries made in the same minute keep their order.
let lastSeq = 0;
const nextSeq = () => { lastSeq = Math.max(lastSeq + 1, Date.now() * 1000); return lastSeq; };

export const byTime = (a, b) => a.ms - b.ms || (a.seq ?? 0) - (b.seq ?? 0);

export function createEventLog(store) {
  /** The entry and its history record are saved together, so an interruption cannot leave one without the other. */
  const write = async (e, h) => { if (store.putWithHistory) await store.putWithHistory(e, h); else { await store.putEvent(e); await store.addHistory(h); } };
  return {
    async add(fields, ms = Date.now()) {
      const e = { id: newId(), ms, createdAt: Date.now(), seq: nextSeq(), ...fields };
      await store.putEvent(e);
      return e;
    },
    async all() {
      return (await store.allEvents()).sort(byTime);
    },
    async byDay(key) {
      return (await this.all()).filter((e) => !e.deleted && dayKey(e.ms) === key);
    },
    async edit(id, changes, reason, at = Date.now()) {
      needReason(reason);
      const before = await store.getEvent(id);
      if (!before) throw new Error(`Entry ${id} not found`);
      const after = { ...before, ...changes, id, editedAt: at };
      await write(after, { eventId: id, action: 'edit', before, after, reason: String(reason).trim(), at });
      return after;
    },
    async remove(id, reason, at = Date.now()) {
      needReason(reason);
      const before = await store.getEvent(id);
      if (!before) throw new Error(`Entry ${id} not found`);
      const after = { ...before, deleted: true, editedAt: at };
      await write(after, { eventId: id, action: 'delete', before, after, reason: String(reason).trim(), at });
    },
    /** Master reset: remove every entry and every history record. */
    async clearAll() { await store.clearAll(); },
    /** Physically remove every entry the test accepts, with its change history. Used only by the Admin reset screens. */
    async purge(test) { const ids = (await store.allEvents()).filter(test).map((e) => e.id); await store.purgeEvents(ids); return ids.length; },
    /** Put entries and their change history back exactly as saved (used by Restore). Entries already here are left alone. */
    async restoreRaw(events, history) {
      const have = new Set((await store.allEvents()).map((e) => e.id));
      let n = 0;
      for (const e of events) if (!have.has(e.id)) { await store.putEvent(e); n++; }
      const ids = new Set(events.map((e) => e.id));
      for (const h of history) if (ids.has(h.eventId) && !have.has(h.eventId)) await store.addHistory(h);
      return n;
    },
    async allHistory() { return store.allHistory(); },
    async history(id) {
      return store.historyFor(id);
    },
  };
}
