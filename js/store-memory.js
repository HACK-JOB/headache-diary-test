// In-memory store with the same interface as the IndexedDB store. Used for tests.
export function createMemoryStore() {
  const events = new Map();
  const history = [];
  return {
    async putEvent(e) { events.set(e.id, structuredClone(e)); },
    async getEvent(id) { const e = events.get(id); return e ? structuredClone(e) : undefined; },
    async allEvents() { return [...events.values()].map((e) => structuredClone(e)); },
    async addHistory(h) { history.push(structuredClone(h)); },
    async clearAll() { events.clear(); history.length = 0; },
    async allHistory() { return history.map((h) => structuredClone(h)); },
    async historyFor(id) { return history.filter((h) => h.eventId === id).map((h) => structuredClone(h)); },
  };
}
