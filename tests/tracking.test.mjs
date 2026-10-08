import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGS, LEVELS, trackEvent, setting, resolve, trackedMap, lockMessage, userCanChange } from '../js/tracking.js';
import { normalise, DEFAULTS } from '../js/settings.js';

let ms = 1000;
const adminEv = (log, value) => ({ id: `a${ms}`, ms: ms++, ...trackEvent('admin', log, value) });
const docEv = (log, value, by = 'd1') => ({ id: `c${ms}`, ms: ms++, ...trackEvent('doctor', log, value, by) });
const dr = { id: 'd1', ms: 1, type: 'doctor', kind: 'add', doctorId: 'd1', name: 'Dr Lee', role: 'GP' };
const dr2 = { id: 'd2', ms: 2, type: 'doctor', kind: 'add', doctorId: 'd2', name: 'Dr Wong', role: 'Dietitian' };

test('the logs offered, and the three levels in priority order', () => {
  assert.deepEqual(LOGS.map((l) => l.key), ['water', 'headache', 'day', 'intake', 'weight', 'glucose', 'meds']);
  assert.deepEqual(LEVELS.map((l) => l.key), ['admin', 'doctor', 'user']);
  for (const l of LOGS) assert.ok(l.label && l.what, l.key);
});

test('everything is tracked until someone says otherwise', () => {
  const m = trackedMap([], {});
  for (const l of LOGS) assert.equal(m[l.key], true, l.key);
  assert.equal(resolve([], {}, 'glucose').source, 'default');
});

test('the user level decides when nobody above has set anything', () => {
  assert.equal(resolve([], { glucose: 'off' }, 'glucose').tracked, false);
  assert.equal(resolve([], { glucose: 'off' }, 'glucose').source, 'user');
  assert.equal(resolve([], { glucose: 'on' }, 'glucose').tracked, true);
});

test('a doctor setting beats the user, and an admin setting beats the doctor', () => {
  const ev = [dr, docEv('glucose', 'off')];
  assert.deepEqual([resolve(ev, { glucose: 'on' }, 'glucose').tracked, resolve(ev, { glucose: 'on' }, 'glucose').source], [false, 'doctor']);
  const ev2 = [...ev, adminEv('glucose', 'on')];
  assert.deepEqual([resolve(ev2, { glucose: 'off' }, 'glucose').tracked, resolve(ev2, { glucose: 'off' }, 'glucose').source], [true, 'admin']);
});

test('"not set" hands the decision back down a level', () => {
  const ev = [dr, docEv('weight', 'off'), adminEv('weight', 'on'), adminEv('weight', 'unset')];
  assert.equal(resolve(ev, {}, 'weight').source, 'doctor');
  const ev2 = [...ev, docEv('weight', 'unset')];
  assert.equal(resolve(ev2, { weight: 'off' }, 'weight').source, 'user');
});

test('the latest setting at a level wins, and other logs are not affected', () => {
  const ev = [adminEv('water', 'off'), adminEv('water', 'on')];
  assert.equal(setting(ev, 'admin', 'water').value, 'on');
  assert.equal(setting(ev, 'admin', 'meds'), null);
  assert.equal(resolve([adminEv('water', 'off')], {}, 'meds').tracked, true);
});

test('deleted events are ignored, and an unknown value or log is not recorded', () => {
  const e = adminEv('water', 'off'); e.deleted = true;
  assert.equal(setting([e], 'admin', 'water'), null);
  assert.equal(trackEvent('admin', 'nope', 'off'), null);
  assert.equal(trackEvent('admin', 'water', 'maybe'), null);
  assert.equal(trackEvent('user', 'water', 'off'), null);       // the user level lives in settings, not the log
});

test('locks list who has set it, with the one in force first', () => {
  const ev = [dr, docEv('glucose', 'off'), adminEv('glucose', 'on')];
  const r = resolve(ev, { glucose: 'off' }, 'glucose');
  assert.deepEqual(r.locks.map((l) => [l.level, l.value]), [['admin', 'on'], ['doctor', 'off']]);
  assert.equal(r.locks[1].name, 'Dr Lee (GP)');
  assert.equal(userCanChange(r), false);
  assert.equal(userCanChange(resolve([], {}, 'glucose')), true);
});

test('lockMessage names who locked it and the setting, in impersonal wording', () => {
  const ev = [dr, docEv('glucose', 'off')];
  assert.equal(lockMessage(resolve(ev, {}, 'glucose')), 'Locked by Dr Lee (GP): off.');
  const both = [dr, docEv('glucose', 'off'), adminEv('glucose', 'on')];
  assert.equal(lockMessage(resolve(both, {}, 'glucose')), 'Locked by Admin: on. Also set by Dr Lee (GP): off, which Admin overrides.');
  assert.equal(lockMessage(resolve([], {}, 'glucose')), '');
});

test('two doctors: the most recent doctor setting is the one in force and is named', () => {
  const ev = [dr, dr2, docEv('meds', 'on', 'd1'), docEv('meds', 'off', 'd2')];
  const r = resolve(ev, {}, 'meds');
  assert.deepEqual([r.tracked, r.locks[0].name], [false, 'Dr Wong (Dietitian)']);
});

test('a removed doctor still shows by name, never as blank', () => {
  const ev = [dr, docEv('meds', 'off'), { id: 'r', ms: 99999, type: 'doctor', kind: 'remove', doctorId: 'd1' }];
  assert.match(lockMessage(resolve(ev, {}, 'meds')), /Locked by (Dr Lee \(GP\)|A doctor)/);
});

test('settings keep only valid user choices, and default to none', () => {
  assert.deepEqual(DEFAULTS.track, {});
  assert.deepEqual(normalise({ track: { glucose: 'off', water: 'on', bogus: 'off', meds: 'maybe' } }).track, { glucose: 'off', water: 'on' });
  assert.deepEqual(normalise({ track: 'x' }).track, {});
  assert.deepEqual(normalise({}).track, {});
});

test('a Doctors-tab setting made while no doctor is signed in is named for the tab, not "A doctor"', () => {
  const ev = [dr, { id: 'x1', ms: 5000, ...trackEvent('doctor', 'weight', 'off', 'open') }];
  assert.equal(lockMessage(resolve(ev, {}, 'weight')), 'Locked by Doctors tab: off.');
  assert.equal(resolve(ev, {}, 'weight').locks[0].name, 'Doctors tab');
});
