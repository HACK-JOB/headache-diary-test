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
