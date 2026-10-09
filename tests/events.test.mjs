import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventLog } from '../js/events.js';
import { createMemoryStore } from '../js/store-memory.js';

const mk = () => createEventLog(createMemoryStore());

test('add stores an event and gives it an id and a created time', async () => {
  const log = mk();
  const e = await log.add({ type: 'water', ml: 600 }, 1000);
  assert.ok(e.id);
  assert.equal(e.ml, 600);
  assert.equal(e.ms, 1000);
  assert.equal((await log.all()).length, 1);
});

test('events come back oldest first', async () => {
  const log = mk();
  await log.add({ type: 'water', ml: 1 }, 3000);
  await log.add({ type: 'water', ml: 2 }, 1000);
  await log.add({ type: 'water', ml: 3 }, 2000);
  assert.deepEqual((await log.all()).map((e) => e.ml), [2, 3, 1]);
});

test('edit keeps the old version in history and needs a reason', async () => {
  const log = mk();
  const e = await log.add({ type: 'water', ml: 600 }, 1000);
  await assert.rejects(() => log.edit(e.id, { ml: 500 }, '', 2000), /reason/i);
  await log.edit(e.id, { ml: 500 }, 'typo', 2000);
  const now = (await log.all()).find((x) => x.id === e.id);
  assert.equal(now.ml, 500);
  const hist = await log.history(e.id);
  assert.equal(hist.length, 1);
  assert.equal(hist[0].before.ml, 600);
  assert.equal(hist[0].after.ml, 500);
  assert.equal(hist[0].reason, 'typo');
  assert.equal(hist[0].at, 2000);
});

test('remove marks an entry deleted, keeps it, and needs a reason', async () => {
  const log = mk();
  const e = await log.add({ type: 'water', ml: 600 }, 1000);
  await assert.rejects(() => log.remove(e.id, '   ', 2000), /reason/i);
  await log.remove(e.id, 'added by mistake', 2000);
  const now = (await log.all()).find((x) => x.id === e.id);
  assert.equal(now.deleted, true);
  assert.equal((await log.history(e.id))[0].action, 'delete');
});

test('editing an unknown id fails clearly', async () => {
  const log = mk();
  await assert.rejects(() => log.edit('nope', { ml: 1 }, 'x', 1), /not found/i);
});

test('byDay returns only that day, excluding deleted entries', async () => {
  const log = mk();
  const brisbane = (d, h) => Date.UTC(2026, 9, d, h - 10);
  await log.add({ type: 'water', ml: 1 }, brisbane(8, 9));
  const gone = await log.add({ type: 'water', ml: 2 }, brisbane(8, 10));
  await log.add({ type: 'water', ml: 3 }, brisbane(9, 1));
  await log.remove(gone.id, 'oops', brisbane(8, 11));
  assert.deepEqual((await log.byDay('2026-10-08')).map((e) => e.ml), [1]);
});

test('events with the same time come back in the order they were added', async () => {
  const log = mk();
  const a = await log.add({ type: 'x', n: 1 }, 5000);
  const b = await log.add({ type: 'x', n: 2 }, 5000);
  const c = await log.add({ type: 'x', n: 3 }, 5000);
  assert.deepEqual((await log.all()).map((e) => e.n), [1, 2, 3]);
  assert.ok(a.seq < b.seq && b.seq < c.seq);
});

/* ---------- atomic saves: an edit and its history record land together or not at all ---------- */
test('edit and remove use one combined write (putWithHistory) when the store has it', async () => {
  const calls = [];
  const inner = createMemoryStore();
  const store = { ...inner, async putWithHistory(e, h) { calls.push('both'); await inner.putEvent(e); await inner.addHistory(h); }, putEvent: async (e) => { calls.push('put'); return inner.putEvent(e); }, addHistory: async (h) => { calls.push('hist'); return inner.addHistory(h); } };
  const log = createEventLog(store);
  const a = await log.add({ type: 'water', ml: 1 }, 1);
  await log.edit(a.id, { ml: 2 }, 'typo', 2);
  await log.remove(a.id, 'mistake', 3);
  assert.deepEqual(calls, ['put', 'both', 'both']);
});

test('a failed combined write changes nothing: no edit without its history', async () => {
  const inner = createMemoryStore();
  const store = { ...inner, async putWithHistory() { throw new Error('interrupted'); } };
  const log = createEventLog(store);
  const a = await log.add({ type: 'water', ml: 1 }, 1);
  await assert.rejects(() => log.edit(a.id, { ml: 2 }, 'typo', 2), /interrupted/);
  assert.equal((await log.all())[0].ml, 1);
  assert.deepEqual(await log.history(a.id), []);
});

test('the memory store also has putWithHistory, so tests and the app behave the same', async () => {
  const s = createMemoryStore();
  await s.putWithHistory({ id: 'x', ms: 1 }, { eventId: 'x', action: 'edit' });
  assert.equal((await s.allEvents()).length, 1);
  assert.equal((await s.historyFor('x')).length, 1);
});
