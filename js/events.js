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
      await store.putEvent(after);
      await store.addHistory({ eventId: id, action: 'edit', before, after, reason: String(reason).trim(), at });
      return after;
    },
    async remove(id, reason, at = Date.now()) {
      needReason(reason);
      const before = await store.getEvent(id);
      if (!before) throw new Error(`Entry ${id} not found`);
      const after = { ...before, deleted: true, editedAt: at };
      await store.putEvent(after);
      await store.addHistory({ eventId: id, action: 'delete', before, after, reason: String(reason).trim(), at });
    },
    /** Master reset: remove every entry and every history record. */
    async clearAll() { await store.clearAll(); },
    async allHistory() { return store.allHistory(); },
    async history(id) {
      return store.historyFor(id);
    },
  };
}
