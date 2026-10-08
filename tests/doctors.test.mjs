import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDoctor, doctors, validateTarget, targets, statusFor, reliefFor, urgentGlucose, fasting, notes, changeLog, TARGET_KEYS, DEFAULT_MARGIN } from '../js/doctors.js';

let n = 0;
const ev = (fields, ms = 1000 + n) => ({ id: 'e' + ++n, ms, seq: n, ...fields });
const add = (id, name, role, ms) => ev({ type: 'doctor', kind: 'add', doctorId: id, name, role, pin: { v: 1, iter: 1, salt: 's', hash: 'h' + id }, by: 'setup' }, ms);
const tgt = (key, min, max, margin, by, ms) => ev({ type: 'clinical', kind: 'target', key, min, max, margin, by }, ms);

test('a doctor needs a name and a role', () => {
  assert.deepEqual(validateDoctor({}), ['name', 'role']);
  assert.deepEqual(validateDoctor({ name: ' Dr Lee ', role: '' }), ['role']);
  assert.deepEqual(validateDoctor({ name: 'Dr Lee', role: 'GP' }), []);
});

test('doctors(): add, change PIN, remove', () => {
  const evs = [add('a', 'Dr Lee', 'GP', 1), add('b', 'Sam', 'Dietitian', 2)];
  assert.deepEqual(doctors(evs).map((d) => [d.id, d.name, d.role]), [['a', 'Dr Lee', 'GP'], ['b', 'Sam', 'Dietitian']]);
  const newPin = { v: 1, iter: 1, salt: 's2', hash: 'new' };
  const changed = [...evs, ev({ type: 'doctor', kind: 'pin', doctorId: 'a', pin: newPin, by: 'a' }, 3)];
  assert.equal(doctors(changed)[0].pin.hash, 'new');
  const removed = [...changed, ev({ type: 'doctor', kind: 'remove', doctorId: 'b', by: 'admin' }, 4)];
  assert.deepEqual(doctors(removed).map((d) => d.id), ['a']);
});

test('validateTarget: numbers only, min not above max, margin 0 to 50, blank is allowed', () => {
  assert.deepEqual(validateTarget({ min: '', max: '', margin: '' }).value, { min: null, max: null, margin: DEFAULT_MARGIN });
  const ok = validateTarget({ min: '1500', max: '2500', margin: '10' });
  assert.deepEqual(ok.value, { min: 1500, max: 2500, margin: 10 });
  assert.deepEqual(validateTarget({ min: '2000', max: '1000' }).errors, ['max']);
  assert.deepEqual(validateTarget({ min: 'abc' }).errors, ['min']);
  assert.deepEqual(validateTarget({ max: '-5' }).errors, ['max']);
  assert.deepEqual(validateTarget({ max: '10', margin: '80' }).errors, ['margin']);
  assert.deepEqual(validateTarget({ max: '10,5' }).value.max, 10.5);
});

test('targets(): latest per item wins; blank min and max clears it', () => {
  const evs = [tgt('iron', 8, 18, 20, 'a', 1), tgt('iron', 10, 20, 20, 'a', 2), tgt('fluid', null, 2500, 20, 'a', 3), tgt('fluid', null, null, 20, 'a', 4)];
  const t = targets(evs);
  assert.deepEqual([t.iron.min, t.iron.max], [10, 20]);
  assert.equal(t.fluid, undefined);
});

test('statusFor: no target means no colour and no word', () => {
  assert.deepEqual(statusFor(99, undefined), { status: 'none', word: '' });
  assert.deepEqual(statusFor(99, { min: null, max: null }), { status: 'none', word: '' });
});

test('statusFor with a maximum: in range, near the limit (within the margin), over', () => {
  const t = { min: null, max: 100, margin: 20 };
  assert.equal(statusFor(50, t).status, 'in');
  assert.equal(statusFor(79, t).status, 'in');
  assert.equal(statusFor(80, t).status, 'near');
  assert.equal(statusFor(100, t).status, 'near');
  assert.equal(statusFor(101, t).status, 'over');
  assert.equal(statusFor(101, t).word, 'Over the limit');
  assert.equal(statusFor(50, t).word, 'In range');
});

test('statusFor: the margin is per target', () => {
  assert.equal(statusFor(95, { max: 100, margin: 0 }).status, 'in');
  assert.equal(statusFor(95, { max: 100, margin: 10 }).status, 'near');
});

test('statusFor while the day is still running never says "under" and ignores a minimum alone', () => {
  assert.equal(statusFor(10, { min: 100, max: null, margin: 20 }, { running: true }).status, 'none');
  assert.equal(statusFor(10, { min: 100, max: 200, margin: 20 }, { running: true }).status, 'in');
});

test('statusFor for a finished day uses the minimum too', () => {
  const t = { min: 100, max: 200, margin: 20 };
  assert.equal(statusFor(50, t, { running: false }).status, 'under');
  assert.equal(statusFor(110, t, { running: false }).status, 'near');
  assert.equal(statusFor(150, t, { running: false }).status, 'in');
  assert.equal(statusFor(180, t, { running: false }).status, 'near');
  assert.equal(statusFor(250, t, { running: false }).status, 'over');
});

test('reliefFor: doctor-written text per type, labelled with who wrote it; empty text removes it', () => {
  const evs = [add('a', 'Dr Lee', 'GP', 1), ev({ type: 'clinical', kind: 'relief', headacheType: 'tension', text: 'Rest in a dark room', by: 'a' }, 2)];
  const r = reliefFor(evs, 'tension');
  assert.equal(r.text, 'Rest in a dark room');
  assert.equal(r.byName, 'Dr Lee');
  assert.equal(reliefFor(evs, 'cluster'), null);
  const cleared = [...evs, ev({ type: 'clinical', kind: 'relief', headacheType: 'tension', text: '  ', by: 'a' }, 3)];
  assert.equal(reliefFor(cleared, 'tension'), null);
});

test('urgent glucose wording and the fasting-tag switch', () => {
  assert.equal(urgentGlucose([]), null);
  assert.equal(fasting([]), false);
  const evs = [ev({ type: 'clinical', kind: 'urgent', threshold: 4, text: 'Follow your low-sugar plan', by: 'a' }, 1), ev({ type: 'clinical', kind: 'fasting', on: true, by: 'a' }, 2)];
  assert.deepEqual(urgentGlucose(evs), { threshold: 4, text: 'Follow your low-sugar plan', by: 'a', ms: 1 });
  assert.equal(fasting(evs), true);
});

test('notes: newest first, with the author', () => {
  const evs = [add('a', 'Dr Lee', 'GP', 1), ev({ type: 'clinical', kind: 'note', text: 'first', by: 'a' }, 2), ev({ type: 'clinical', kind: 'note', text: 'second', by: 'a' }, 3)];
  assert.deepEqual(notes(evs).map((x) => [x.text, x.byName]), [['second', 'Dr Lee'], ['first', 'Dr Lee']]);
});

test('changeLog: who, what, from and to, newest first, and it never contains a PIN', () => {
  const evs = [
    add('a', 'Dr Lee', 'GP', 1),
    tgt('iron', 8, 18, 20, 'a', 2),
    tgt('iron', 10, 18, 20, 'a', 3),
    ev({ type: 'clinical', kind: 'relief', headacheType: 'tension', text: 'Rest', by: 'a' }, 4),
    ev({ type: 'doctor', kind: 'pin', doctorId: 'a', pin: { hash: 'SECRET' }, by: 'a' }, 5),
  ];
  const log = changeLog(evs);
  assert.equal(log.length, 5);
  assert.match(log[0].what, /PIN/);
  const ironChange = log.find((x) => /Iron/.test(x.what) && x.from !== 'not set');
  assert.equal(ironChange.from, '8 to 18 mg (margin 20%)');
  assert.equal(ironChange.to, '10 to 18 mg (margin 20%)');
  assert.equal(ironChange.byName, 'Dr Lee');
  assert.ok(!JSON.stringify(log).includes('SECRET'));
  assert.ok(!JSON.stringify(log).includes('"hash"'));
});

test('there is a target for fluid and for each of the eleven nutrients', () => {
  assert.deepEqual(TARGET_KEYS.map((k) => k.key), ['fluid', 'calories', 'carbs', 'sugar', 'fibre', 'protein', 'fat', 'satFat', 'transFat', 'sodium', 'iron', 'caffeine']);
});

import { needsLogin } from '../js/doctors.js';

test('open until a PIN exists: needsLogin is false with no doctors, or only doctors without a PIN', () => {
  assert.equal(needsLogin([]), false);
  const noPin = ev({ type: 'doctor', kind: 'add', doctorId: 'x', name: 'Dr Open', role: 'GP', pin: null, by: 'open' }, 1);
  assert.equal(needsLogin([noPin]), false);
  assert.equal(doctors([noPin])[0].pin, null);
  assert.equal(needsLogin([noPin, add('a', 'Dr Lee', 'GP', 2)]), true);
});

test('setting a PIN later turns login on; removing the only PIN holder turns it off again', () => {
  const noPin = ev({ type: 'doctor', kind: 'add', doctorId: 'x', name: 'Dr Open', role: 'GP', pin: null, by: 'open' }, 1);
  const withPin = [noPin, ev({ type: 'doctor', kind: 'pin', doctorId: 'x', pin: { v: 1, iter: 1, salt: 's', hash: 'h' }, by: 'open' }, 2)];
  assert.equal(needsLogin(withPin), true);
  assert.equal(needsLogin([...withPin, ev({ type: 'doctor', kind: 'remove', doctorId: 'x', by: 'admin' }, 3)]), false);
});

test('changes made while open are labelled as open access, and a no-PIN add says so', () => {
  const evs = [ev({ type: 'doctor', kind: 'add', doctorId: 'x', name: 'Dr Open', role: 'GP', pin: null, by: 'open' }, 1),
    ev({ type: 'clinical', kind: 'note', text: 'hello', by: 'open' }, 2)];
  assert.equal(changeLog(evs)[0].byName, 'Open access (no PIN set)');
  assert.equal(notes(evs)[0].byName, 'Open access (no PIN set)');
});
