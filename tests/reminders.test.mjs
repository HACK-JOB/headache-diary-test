import test from 'node:test';
import assert from 'node:assert/strict';
import { fireTimes, activeReminders } from '../js/reminders.js';
import { normalise, DEFAULTS } from '../js/settings.js';

const at = (key, hhmm) => { const [y, mo, d] = key.split('-').map(Number); const [h, m] = hhmm.split(':').map(Number); return Date.UTC(y, mo - 1, d, h - 10, m); };
const DAY = '2026-10-08';
const MIN = 60000;
let seq = 0;
const ev = (e) => ({ id: 'e' + (++seq), ms: at(DAY, '04:00') + seq, deleted: false, ...e });
const wake = (hhmm = '06:00') => ev({ type: 'day', kind: 'wake', ms: at(DAY, hhmm) });
const rx = (over = {}, rxId = 'r1') => ev({ type: 'clinical', kind: 'rx', rxId, status: 'active', by: 'open', name: 'Metformin', dose: '500 mg', food: '', days: 'daily', slots: [{ mode: 'range', start: '08:00', end: '10:00' }], instructions: '', nag: '', ms: at('2026-10-06', '09:00'), ...over });
const ans = (action, hhmm, rxId = 'r1', slot = 0) => ev({ type: 'dose', rxId, slot, forDay: DAY, action, ms: at(DAY, hhmm) });
const dose = (start, end, nag = '') => ({ startMs: at(DAY, start), endMs: at(DAY, end), nag });

test('gentle reminds once; normal reminds at the start and 3 more times, 10 minutes apart', () => {
  assert.deepEqual(fireTimes(dose('08:00', '10:00'), 'gentle'), [at(DAY, '08:00')]);
  assert.deepEqual(fireTimes(dose('08:00', '10:00'), 'normal'), [0, 10, 20, 30].map((m) => at(DAY, '08:00') + m * MIN));
});

test('persistent repeats every 5 minutes until the window closes, never past it', () => {
  const f = fireTimes(dose('08:00', '08:20'), 'persistent');
  assert.deepEqual(f, [0, 5, 10, 15, 20].map((m) => at(DAY, '08:00') + m * MIN));
});

test('normal stops early when the window is shorter than its repeats', () => {
  assert.deepEqual(fireTimes(dose('08:00', '08:15'), 'normal'), [0, 10].map((m) => at(DAY, '08:00') + m * MIN));
});

test('no reminders before WOKE UP; they appear when she wakes', () => {
  const evs = [rx()];
  assert.deepEqual(activeReminders(evs, DAY, at(DAY, '08:05'), { herNag: 'normal' }), []);
  const r = activeReminders([...evs, wake('08:03')], DAY, at(DAY, '08:05'), { herNag: 'normal' });
  assert.equal(r.length, 1);
  assert.equal(r[0].dose.name, 'Metformin');
});

test('nothing before the dose opens, none once answered, none once Overdue', () => {
  const evs = [rx(), wake()];
  assert.deepEqual(activeReminders(evs, DAY, at(DAY, '07:59'), { herNag: 'normal' }), []);
  assert.equal(activeReminders(evs, DAY, at(DAY, '08:00'), { herNag: 'normal' }).length, 1);
  assert.deepEqual(activeReminders([...evs, ans('taken', '08:01')], DAY, at(DAY, '08:02'), { herNag: 'normal' }), []);
  assert.deepEqual(activeReminders([...evs, ans('skipped', '08:01')], DAY, at(DAY, '08:02'), { herNag: 'normal' }), []);
  assert.deepEqual(activeReminders(evs, DAY, at(DAY, '10:05'), { herNag: 'persistent' }), []);
});

test('Remind me later hides it until the next scheduled reminder; the last reminder has nothing after it', () => {
  const evs = [rx(), wake()];
  const dismissed = new Map();
  const first = activeReminders(evs, DAY, at(DAY, '08:00'), { herNag: 'normal', dismissed })[0];
  assert.equal(first.hasMore, true);
  dismissed.set(first.id, at(DAY, '08:00'));
  assert.deepEqual(activeReminders(evs, DAY, at(DAY, '08:09'), { herNag: 'normal', dismissed }), []);
  const second = activeReminders(evs, DAY, at(DAY, '08:10'), { herNag: 'normal', dismissed })[0];
  assert.ok(second);
  assert.notEqual(second.fireMs, first.fireMs);
  dismissed.set(second.id, at(DAY, '08:12'));
  const last = activeReminders(evs, DAY, at(DAY, '08:30'), { herNag: 'normal', dismissed })[0];
  assert.equal(last.hasMore, false);
  dismissed.set(last.id, at(DAY, '08:31'));
  assert.deepEqual(activeReminders(evs, DAY, at(DAY, '09:30'), { herNag: 'normal', dismissed }), []);
});

test('her nag level applies unless the doctor fixed one for that medicine', () => {
  const mine = [rx(), wake()];
  assert.equal(activeReminders(mine, DAY, at(DAY, '08:00'), { herNag: 'gentle' })[0].nag, 'gentle');
  const fixed = [rx({ nag: 'persistent' }), wake()];
  const r = activeReminders(fixed, DAY, at(DAY, '08:00'), { herNag: 'gentle' })[0];
  assert.equal(r.nag, 'persistent');
  assert.equal(r.fixed, true);
  assert.equal(activeReminders(mine, DAY, at(DAY, '08:00'), { herNag: 'gentle' })[0].fixed, false);
});

test('an exact time reminds from that minute', () => {
  const evs = [rx({ slots: [{ mode: 'exact', at: '08:30' }] }), wake()];
  assert.deepEqual(activeReminders(evs, DAY, at(DAY, '08:29'), { herNag: 'normal' }), []);
  assert.equal(activeReminders(evs, DAY, at(DAY, '08:30'), { herNag: 'normal' }).length, 1);
});

test('paused or ended medicines never remind; two doses give two reminders, soonest first', () => {
  const evs = [rx(), rx({ name: 'B', slots: [{ mode: 'range', start: '08:00', end: '10:00' }] }, 'r2'), wake()];
  const two = activeReminders(evs, DAY, at(DAY, '08:01'), { herNag: 'normal' });
  assert.equal(two.length, 2);
  const paused = [...evs, rx({ status: 'paused' }, 'r1')];
  assert.equal(activeReminders(paused, DAY, at(DAY, '08:01'), { herNag: 'normal' }).length, 1);
});

test('settings keep a nag level (default normal) and a chime switch (default on); bad values fall back', () => {
  assert.equal(DEFAULTS.nag, 'normal');
  assert.equal(DEFAULTS.chime, true);
  assert.equal(normalise({ nag: 'persistent', chime: false }).nag, 'persistent');
  assert.equal(normalise({ nag: 'loud', chime: 'yes' }).nag, 'normal');
  assert.equal(normalise({ nag: 'loud', chime: 'yes' }).chime, true);
});
