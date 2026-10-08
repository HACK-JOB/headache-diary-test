import test from 'node:test';
import assert from 'node:assert/strict';
import { activeNudges, validTimes, SIT_CHOICES } from '../js/nudges.js';
import { normalise, DEFAULTS } from '../js/settings.js';

const at = (key, hhmm) => { const [y, mo, d] = key.split('-').map(Number); const [h, m] = hhmm.split(':').map(Number); return Date.UTC(y, mo - 1, d, h - 10, m); };
const DAY = '2026-10-08';
const MIN = 60000;
let seq = 0;
const ev = (e) => ({ id: 'e' + (++seq), deleted: false, ...e });
const wake = (hhmm) => ev({ type: 'day', kind: 'wake', ms: at(DAY, hhmm) });
const end = (hhmm) => ev({ type: 'day', kind: 'end', ms: at(DAY, hhmm) });
const act = (hhmm, position = 'Sitting') => ev({ type: 'activity', activity: 'TV', location: 'House', position, ms: at(DAY, hhmm) });
const glu = (hhmm) => ev({ type: 'measure', kind: 'glucose', mmol: 6.1, ms: at(DAY, hhmm) });
const S = (o = {}) => ({ nag: 'normal', wakeOn: false, wakeAt: '09:00', glucoseOn: false, glucoseTimes: ['07:30'], sitOn: false, sitMins: 60, ...o });

test('all three are off by default and bad values fall back', () => {
  assert.equal(DEFAULTS.wakeOn, false); assert.equal(DEFAULTS.glucoseOn, false); assert.equal(DEFAULTS.sitOn, false);
  assert.equal(normalise({}).wakeAt, '09:00');
  assert.equal(normalise({ wakeAt: '25:99' }).wakeAt, '09:00');
  assert.deepEqual(normalise({ glucoseTimes: ['08:00', 'x', '06:30', '08:00'] }).glucoseTimes, ['06:30', '08:00']);
  assert.deepEqual(normalise({ glucoseTimes: ['01:00', '02:00', '03:00', '04:00'] }).glucoseTimes.length, 3);
  assert.equal(normalise({ sitMins: 7 }).sitMins, 60);
  assert.equal(normalise({ sitMins: 30, sitOn: true }).sitMins, 30);
  assert.deepEqual(validTimes(['09:00', '9:5']), ['09:00']);
  assert.ok(SIT_CHOICES.includes(60));
});

test('nothing shows when everything is off', () => {
  assert.deepEqual(activeNudges([act('06:00')], DAY, at(DAY, '12:00'), S()), []);
});

test('wake reminder: shows at its time if WOKE UP has not been tapped, is the one that works while asleep, and clears when she wakes', () => {
  const s = S({ wakeOn: true });
  assert.deepEqual(activeNudges([], DAY, at(DAY, '08:59'), s), []);
  const n = activeNudges([], DAY, at(DAY, '09:00'), s);
  assert.equal(n.length, 1);
  assert.equal(n[0].kind, 'wake');
  assert.deepEqual(activeNudges([wake('09:10')], DAY, at(DAY, '09:11'), s), []);
  assert.deepEqual(activeNudges([wake('05:00')], DAY, at(DAY, '09:11'), s), []);   // already woke earlier
  assert.deepEqual(activeNudges([], DAY, at(DAY, '10:05'), s), []);                // gives up after an hour
});

test('glucose reminder: only after WOKE UP, at each chosen time, cleared by a reading made at or after it', () => {
  const s = S({ glucoseOn: true, glucoseTimes: ['07:30', '17:00'] });
  assert.deepEqual(activeNudges([], DAY, at(DAY, '07:31'), s), []);                // asleep
  assert.equal(activeNudges([wake('06:00')], DAY, at(DAY, '07:30'), s)[0].kind, 'glucose');
  assert.deepEqual(activeNudges([wake('06:00'), glu('07:35')], DAY, at(DAY, '07:36'), s), []);
  assert.equal(activeNudges([wake('06:00'), glu('07:00')], DAY, at(DAY, '07:36'), s).length, 1);   // an earlier reading does not count
  assert.equal(activeNudges([wake('06:00'), glu('07:35')], DAY, at(DAY, '17:00'), s).length, 1);    // second time still due
  assert.deepEqual(activeNudges([wake('06:00')], DAY, at(DAY, '08:31'), s), []);                    // gives up after an hour
  assert.deepEqual(activeNudges([wake('06:00'), end('07:20')], DAY, at(DAY, '07:31'), s), []);      // day ended
});

test('sitting nudge: after the chosen minutes in Sitting; not for other positions; resets when the position changes', () => {
  const s = S({ sitOn: true, sitMins: 45 });
  const base = [wake('06:00'), act('08:00')];
  assert.deepEqual(activeNudges(base, DAY, at(DAY, '08:44'), s), []);
  const n = activeNudges(base, DAY, at(DAY, '08:45'), s);
  assert.equal(n.length, 1); assert.equal(n[0].kind, 'sitting');
  assert.match(n[0].title, /45 minutes/);
  assert.deepEqual(activeNudges([wake('06:00'), act('08:00', 'Standing')], DAY, at(DAY, '10:00'), s), []);
  assert.deepEqual(activeNudges([...base, act('08:40', 'Walking')], DAY, at(DAY, '08:50'), s), []);
  assert.deepEqual(activeNudges([...base, act('08:40', 'Standing'), act('08:50', 'Sitting')], DAY, at(DAY, '09:00'), s), []);
  assert.deepEqual(activeNudges(base, DAY, at(DAY, '09:20'), s), []);                 // gives up half an hour after the first nudge
});

test('her nag level sets the repeats; "OK" hides this one until the next', () => {
  const dismissed = new Map();
  const s = S({ glucoseOn: true, nag: 'normal' });
  const evs = [wake('06:00')];
  const first = activeNudges(evs, DAY, at(DAY, '07:30'), s, dismissed)[0];
  assert.equal(first.hasMore, true);
  dismissed.set(first.id, at(DAY, '07:30'));
  assert.deepEqual(activeNudges(evs, DAY, at(DAY, '07:39'), s, dismissed), []);
  assert.equal(activeNudges(evs, DAY, at(DAY, '07:40'), s, dismissed).length, 1);
  const gentle = activeNudges(evs, DAY, at(DAY, '07:30'), S({ glucoseOn: true, nag: 'gentle' }))[0];
  assert.equal(gentle.hasMore, false);
});

test('wording is impersonal and gives no advice', () => {
  const t = [
    ...activeNudges([], DAY, at(DAY, '09:00'), S({ wakeOn: true })),
    ...activeNudges([wake('06:00')], DAY, at(DAY, '07:30'), S({ glucoseOn: true })),
    ...activeNudges([wake('06:00'), act('08:00')], DAY, at(DAY, '09:00'), S({ sitOn: true })),
  ].map((n) => n.title);
  assert.equal(t.length, 3);
  for (const x of t) assert.ok(!/\b(you|your|she|her|should|must|need to|healthy|bad)\b/i.test(x), x);
});
