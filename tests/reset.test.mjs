import test from 'node:test';
import assert from 'node:assert/strict';
import { RESET_WORD, confirmsReset, diaryKeys } from '../js/reset.js';
import { createEventLog } from '../js/events.js';
import { createMemoryStore } from '../js/store-memory.js';

test('only the exact word DELETE confirms a reset', () => {
  assert.equal(RESET_WORD, 'DELETE');
  assert.equal(confirmsReset('DELETE'), true);
  assert.equal(confirmsReset('  DELETE '), true);        // stray spaces from a keyboard are fine
  for (const bad of ['delete', 'Delete', 'DELET', 'DELETE ME', '', '   ', null, undefined, 42]) assert.equal(confirmsReset(bad), false, String(bad));
});

test('diaryKeys picks only this app\'s saved settings, nothing else on the tablet', () => {
  const keys = ['hd.settings', 'hd.adminPin', 'hd.adminTries', 'hd.selected', 'hd.doctorTries', 'other.thing', 'hdx', 'theme'];
  assert.deepEqual(diaryKeys(keys), ['hd.settings', 'hd.adminPin', 'hd.adminTries', 'hd.selected', 'hd.doctorTries']);
  assert.deepEqual(diaryKeys([]), []);
});

test('clearAll removes every event and every history record', async () => {
  const log = createEventLog(createMemoryStore());
  const a = await log.add({ type: 'water', ml: 500 }, 1000);
  await log.add({ type: 'water', ml: 250 }, 2000);
  await log.edit(a.id, { ml: 400 }, 'typo', 3000);
  assert.equal((await log.all()).length, 2);
  assert.equal((await log.history(a.id)).length, 1);
  await log.clearAll();
  assert.deepEqual(await log.all(), []);
  assert.deepEqual(await log.history(a.id), []);
  await log.add({ type: 'water', ml: 100 }, 4000);          // and it keeps working afterwards
  assert.equal((await log.all()).length, 1);
});

import { backupFile, backupName } from '../js/reset.js';

test('a backup file holds every entry and its history, with a version and date, and no PIN', async () => {
  const log = createEventLog(createMemoryStore());
  const a = await log.add({ type: 'water', ml: 500 }, 1000);
  await log.edit(a.id, { ml: 400 }, 'typo', 3000);
  const keys = { 'hd.settings': '{"text":"big"}', 'hd.adminPin': '{"hash":"secret"}', 'hd.doctorPins': 'x', 'other': 'nope' };
  const file = backupFile({ events: await log.all(), history: await log.history(a.id) }, keys, 1791460000000);
  assert.equal(file.app, 'headache-diary');
  assert.equal(file.version, 1);
  assert.equal(file.events.length, 1);
  assert.equal(file.history.length, 1);
  assert.deepEqual(Object.keys(file.settings), ['hd.settings']);        // only display settings; PINs and other keys never go in
  assert.ok(!JSON.stringify(file).includes('secret'));
  assert.match(backupName(1791460000000), /^headache-diary-backup-2026-10-08\.json$/);
});

test('allHistory returns every history record, across entries', async () => {
  const log = createEventLog(createMemoryStore());
  const a = await log.add({ type: 'water', ml: 500 }, 1000);
  const b = await log.add({ type: 'water', ml: 300 }, 2000);
  await log.edit(a.id, { ml: 400 }, 'typo', 3000);
  await log.remove(b.id, 'wrong', 4000);
  assert.equal((await log.allHistory()).length, 2);
});

/* ---------- individual resets ---------- */
import { SCOPES, scopeByKey, countScope, applyScope, scopeAllowed, resetNote } from '../js/reset.js';
import { forgottenAt } from '../js/forget.js';
import { myFoods, topFoods, dayIntake } from '../js/intake.js';
import { recentItems } from '../js/memory.js';

const mkStorage = (o) => { const d = { ...o }; return { removeItem: (k) => { delete d[k]; }, getItem: (k) => d[k] ?? null, data: d }; };
async function seeded() {
  const log = createEventLog(createMemoryStore());
  const t = Date.UTC(2026, 9, 8, 2);
  await log.add({ type: 'water', ml: 500 }, t);
  await log.add({ type: 'water', ml: 250 }, t + 1);
  await log.add({ type: 'intake', mealType: 'Breakfast', kind: 'food', name: 'Toast', servings: 1, nutrition: { calories: 100 } }, t + 2);
  await log.add({ type: 'headache', kind: 'start', severity: 3, meds: [{ name: 'Panadol' }], phrases: ['felt dizzy'], relief: ['rest'] }, t + 3);
  await log.add({ type: 'day', kind: 'wake' }, t + 4);
  await log.add({ type: 'activity', activity: 'Walk', location: 'Outside', position: 'Standing' }, t + 5);
  await log.add({ type: 'measure', kind: 'weight', kg: 80 }, t + 6);
  await log.add({ type: 'measure', kind: 'glucose', mmol: 6 }, t + 7);
  await log.add({ type: 'dose', rxId: 'r1', slot: 0, forDay: '2026-10-08', action: 'taken' }, t + 8);
  await log.add({ type: 'doctor', kind: 'add', name: 'Dr Lee', role: 'GP' }, t + 9);
  await log.add({ type: 'clinical', kind: 'note', text: 'hello', by: 'x' }, t + 10);
  await log.add({ type: 'clinical', kind: 'rx', rxId: 'r1', name: 'Testol', by: 'x' }, t + 11);
  await log.add({ type: 'config', kind: 'visibility', item: 'iron', shown: false }, t + 12);
  return log;
}
const types = async (log) => [...new Set((await log.all()).map((e) => e.type))].sort();

test('the scopes are the ones offered on screen, each with plain wording and a unique key', () => {
  assert.deepEqual(SCOPES.map((s) => s.key), ['water', 'food', 'saved', 'headaches', 'days', 'measures', 'doses', 'tester', 'display', 'doctors']);
  assert.equal(new Set(SCOPES.map((s) => s.key)).size, SCOPES.length);
  for (const s of SCOPES) { assert.ok(s.label && s.what && s.keeps, s.key); assert.ok(!/\b(you|your)\b/i.test(`${s.what} ${s.keeps}`), s.key); }
  assert.equal(scopeByKey('water').label, 'Water');
  assert.equal(scopeByKey('nope'), undefined);
});

test('each scope removes only its own entries, and nothing else', async () => {
  const cases = { water: ['water'], food: ['intake'], headaches: ['headache'], days: ['activity', 'day'], measures: ['measure'], doses: ['dose'], doctors: ['clinical', 'doctor'] };
  for (const [key, gone] of Object.entries(cases)) {
    const log = await seeded();
    const before = await types(log);
    await applyScope(scopeByKey(key), { log, storage: mkStorage({}), now: 9e12 });
    const after = (await types(log)).filter((t) => t !== 'config');
    assert.deepEqual(after, before.filter((t) => !gone.includes(t) && t !== 'config'), key);
    assert.ok((await log.all()).some((e) => e.type === 'config' && e.kind === 'visibility'), `${key}: other settings survive`);
  }
});

test('removing entries also removes their change history', async () => {
  const log = await seeded();
  const w = (await log.all()).find((e) => e.type === 'water');
  await log.edit(w.id, { ml: 400 }, 'typo');
  assert.equal((await log.history(w.id)).length, 1);
  await applyScope(scopeByKey('water'), { log, storage: mkStorage({}) });
  assert.deepEqual(await log.history(w.id), []);
});

test('count says how many entries a reset would remove', async () => {
  const log = await seeded();
  const ev = await log.all();
  assert.equal(countScope(ev, scopeByKey('water'), mkStorage({})), 2);
  assert.equal(countScope(ev, scopeByKey('days'), mkStorage({})), 2);
  assert.equal(countScope(ev, scopeByKey('measures'), mkStorage({})), 2);
  assert.equal(countScope(ev, scopeByKey('doctors'), mkStorage({})), 3);
  assert.equal(countScope(ev, scopeByKey('tester'), mkStorage({ 'hd.tester': '{}' })), 1);
  assert.equal(countScope(ev, scopeByKey('tester'), mkStorage({})), 0);
});

test('every reset leaves a small record that it happened, with how many were removed', async () => {
  const log = await seeded();
  await applyScope(scopeByKey('water'), { log, storage: mkStorage({}), now: 5e12 });
  const rec = (await log.all()).filter((e) => e.type === 'config' && e.kind === 'reset');
  assert.equal(rec.length, 1);
  assert.deepEqual([rec[0].scope, rec[0].count], ['water', 2]);
  assert.equal(resetNote(rec[0]), 'Water reset: 2 entries removed');
  assert.equal(resetNote({ scope: 'saved', count: 1, kind: 'reset' }), 'Saved foods and notes reset: forgotten');
});

test('forgetting saved foods and notes clears the chips but keeps the meal log and totals', async () => {
  const log = await seeded();
  const key = '2026-10-08';
  assert.equal(myFoods(await log.all()).length, 1);
  assert.equal(recentItems(await log.all(), 'meds').length, 1);
  await applyScope(scopeByKey('saved'), { log, storage: mkStorage({}), now: Date.now() + 1000 });
  const ev = await log.all();
  assert.deepEqual(myFoods(ev), []);
  assert.deepEqual(topFoods(ev), []);
  assert.deepEqual(recentItems(ev, 'meds'), []);
  assert.deepEqual(recentItems(ev, 'phrases'), []);
  assert.equal(ev.filter((e) => e.type === 'intake').length, 1);                 // the log is untouched
  assert.equal(dayIntake(ev, key).items.length, 1);
  assert.equal(dayIntake(ev, key).totals.calories.value, 100);
  // logging the food again later brings it back
  await log.add({ type: 'intake', mealType: 'Breakfast', kind: 'food', name: 'Toast', servings: 1, nutrition: {} }, Date.now() + 5000);
  assert.deepEqual(myFoods(await log.all()).map((f) => f.name), ['Toast']);
});

test('forgottenAt reads the latest forget marker per list', () => {
  const ev = [{ type: 'config', kind: 'forget', what: 'foods', ms: 10 }, { type: 'config', kind: 'forget', what: 'foods', ms: 30 }, { type: 'config', kind: 'forget', what: 'notes', ms: 20 }];
  assert.equal(forgottenAt(ev, 'foods'), 30);
  assert.equal(forgottenAt(ev, 'notes'), 20);
  assert.equal(forgottenAt([], 'foods'), 0);
});

test('tester notes and display settings live on the tablet and are removed from storage', async () => {
  const log = await seeded();
  const storage = mkStorage({ 'hd.tester': '{"x":1}', 'hd.settings': '{"theme":"dark"}', 'hd.selected': '500', 'hd.adminPin': 'keep' });
  await applyScope(scopeByKey('tester'), { log, storage });
  assert.deepEqual(Object.keys(storage.data).sort(), ['hd.adminPin', 'hd.selected', 'hd.settings']);
  await applyScope(scopeByKey('display'), { log, storage });
  assert.deepEqual(Object.keys(storage.data), ['hd.adminPin']);
});

test('doctor data is only offered when no doctor has a PIN, or when a doctor is signed in', () => {
  const d = scopeByKey('doctors'), w = scopeByKey('water');
  assert.equal(scopeAllowed(w, { pinHolders: 3, doctorSignedIn: false }), true);
  assert.equal(scopeAllowed(d, { pinHolders: 0, doctorSignedIn: false }), true);
  assert.equal(scopeAllowed(d, { pinHolders: 2, doctorSignedIn: false }), false);
  assert.equal(scopeAllowed(d, { pinHolders: 2, doctorSignedIn: true }), true);
});

test('resetting doctor data also clears the doctor PIN lockout counter', async () => {
  const log = await seeded();
  const storage = mkStorage({ 'hd.doctorTries': '{"n":3}', 'hd.adminTries': '{"n":1}' });
  await applyScope(scopeByKey('doctors'), { log, storage });
  assert.deepEqual(Object.keys(storage.data), ['hd.adminTries']);
});
