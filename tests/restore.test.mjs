import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, restoreGroups, planRestore, applyRestore, backupFile } from '../js/reset.js';
import { createEventLog } from '../js/events.js';
import { createMemoryStore } from '../js/store-memory.js';

const mk = async (rows) => {
  const log = createEventLog(createMemoryStore());
  for (const r of rows) await log.add(r.f, r.ms);
  return log;
};
const fileOf = async (log) => backupFile({ events: await log.all(), history: await log.allHistory() }, { 'hd.settings': '{"theme":"mist"}' }, 5000);

test('parseBackup accepts a real backup and refuses anything else', async () => {
  const log = await mk([{ f: { type: 'water', ml: 500 }, ms: 1000 }]);
  const file = await fileOf(log);
  assert.equal(parseBackup(JSON.stringify(file)).ok, true);
  for (const bad of ['', 'not json', '{}', JSON.stringify({ app: 'other', version: 1, events: [] }), JSON.stringify({ app: 'headache-diary', version: 9, events: [] }), JSON.stringify({ app: 'headache-diary', version: 1, events: 'x' })]) {
    const r = parseBackup(bad);
    assert.equal(r.ok, false, bad);
    assert.ok(r.message);
  }
});

test('restoreGroups lists what the file holds, with counts, and skips empty groups', async () => {
  const log = await mk([{ f: { type: 'water', ml: 500 }, ms: 1 }, { f: { type: 'water', ml: 250 }, ms: 2 }, { f: { type: 'intake', name: 'Toast' }, ms: 3 }, { f: { type: 'measure', kind: 'glucose', mmol: 6 }, ms: 4 }]);
  const g = restoreGroups((await fileOf(log)));
  const by = Object.fromEntries(g.map((x) => [x.key, x.count]));
  assert.equal(by.water, 2); assert.equal(by.food, 1); assert.equal(by.measures, 1);
  assert.equal('headaches' in by, false);
  assert.ok(g.every((x) => x.label));
});

test('planRestore (merge): only chosen groups, and entries already here are not doubled', async () => {
  const a = await mk([{ f: { type: 'water', ml: 500 }, ms: 1 }, { f: { type: 'intake', name: 'Toast' }, ms: 2 }]);
  const file = await fileOf(a);
  const b = createEventLog(createMemoryStore());
  const existing = await b.add({ type: 'water', ml: 500 }, 1);
  const have = await b.all();
  const ids = (await a.all()).map((e) => e.id);
  // same entry id already on the tablet
  const clash = { ...file, events: file.events.map((e, i) => (i === 0 ? { ...e, id: existing.id } : e)) };
  const plan = planRestore(clash, have, { mode: 'merge', groups: ['water', 'food'] });
  assert.equal(plan.add.length, 1);
  assert.equal(plan.add[0].type, 'intake');
  assert.equal(plan.skipped, 1);
  assert.equal(planRestore(clash, have, { mode: 'merge', groups: ['food'] }).add.length, 1);
  assert.equal(planRestore(clash, have, { mode: 'merge', groups: [] }).add.length, 0);
  assert.ok(ids.length === 2);
});

test('applyRestore full: replaces everything on the tablet with the file', async () => {
  const src = await mk([{ f: { type: 'water', ml: 500 }, ms: 1 }, { f: { type: 'intake', name: 'Toast' }, ms: 2 }]);
  const file = await fileOf(src);
  const dst = await mk([{ f: { type: 'headache' }, ms: 9 }, { f: { type: 'water', ml: 100 }, ms: 8 }]);
  const store = { removed: [] };
  const n = await applyRestore(file, dst, { mode: 'full', storage: { setItem: (k, v) => { store[k] = v; }, getItem: () => null } });
  assert.deepEqual((await dst.all()).map((e) => e.type).sort(), ['intake', 'water']);
  assert.equal(n, 2);
  assert.equal(store['hd.settings'], '{"theme":"mist"}');
});

test('applyRestore merge: keeps what is here, adds the chosen groups, keeps their change history', async () => {
  const src = await mk([{ f: { type: 'water', ml: 500 }, ms: 1 }, { f: { type: 'intake', name: 'Toast' }, ms: 2 }]);
  const toast = (await src.all()).find((e) => e.type === 'intake');
  await src.edit(toast.id, { name: 'Toast and egg' }, 'typo', 5);
  const file = await fileOf(src);
  const dst = await mk([{ f: { type: 'headache' }, ms: 9 }]);
  const n = await applyRestore(file, dst, { mode: 'merge', groups: ['food'] });
  const types = (await dst.all()).map((e) => e.type).sort();
  assert.deepEqual(types, ['headache', 'intake']);
  assert.equal(n, 1);
  assert.equal((await dst.history(toast.id)).length, 1);
});

test('merge never touches PINs or doctor accounts unless the doctor group is chosen', async () => {
  const src = await mk([{ f: { type: 'doctor', kind: 'add', doctorId: 'd1', name: 'Dr Lee', role: 'GP', pin: { hash: 'x' } }, ms: 1 }, { f: { type: 'water', ml: 1 }, ms: 2 }]);
  const file = await fileOf(src);
  const g = restoreGroups(file).map((x) => x.key);
  assert.ok(g.includes('doctors'));
  const dst = await mk([]);
  await applyRestore(file, dst, { mode: 'merge', groups: ['water'] });
  assert.deepEqual((await dst.all()).map((e) => e.type), ['water']);
});
