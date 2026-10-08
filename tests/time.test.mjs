import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, msUntilNextMidnight, formatLongDate, formatTime } from '../js/time.js';

// Brisbane is UTC+10 all year (no daylight saving).
const brisbane = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h - 10, mi, s);

test('dayKey returns the Brisbane calendar day, not the UTC day', () => {
  // 08:00 Brisbane on 9 Oct is still 8 Oct in UTC
  assert.equal(dayKey(brisbane(2026, 10, 9, 8, 0)), '2026-10-09');
});

test('dayKey rolls over exactly at Brisbane midnight', () => {
  assert.equal(dayKey(brisbane(2026, 10, 8, 23, 59, 59)), '2026-10-08');
  assert.equal(dayKey(brisbane(2026, 10, 9, 0, 0, 0)), '2026-10-09');
});

test('dayKey handles month and year ends', () => {
  assert.equal(dayKey(brisbane(2026, 12, 31, 23, 59, 59)), '2026-12-31');
  assert.equal(dayKey(brisbane(2027, 1, 1, 0, 0, 0)), '2027-01-01');
});

test('msUntilNextMidnight counts down to Brisbane midnight', () => {
  assert.equal(msUntilNextMidnight(brisbane(2026, 10, 8, 23, 59, 59)), 1000);
  assert.equal(msUntilNextMidnight(brisbane(2026, 10, 9, 0, 0, 0)), 86400000);
});

test('formatLongDate reads like a diary heading', () => {
  assert.equal(formatLongDate(brisbane(2026, 10, 8, 9, 0)), 'Thursday 8 October');
});

test('formatTime uses 12 hour time with lowercase am/pm', () => {
  assert.equal(formatTime(brisbane(2026, 10, 8, 14, 5)), '2:05 pm');
  assert.equal(formatTime(brisbane(2026, 10, 8, 0, 7)), '12:07 am');
});

test('formatTime can show 24 hour time', () => {
  assert.equal(formatTime(brisbane(2026, 10, 8, 14, 5), '24'), '14:05');
  assert.equal(formatTime(brisbane(2026, 10, 8, 0, 7), '24'), '00:07');
});

import { msFromClock, clockValue } from '../js/time.js';

test('msFromClock turns a typed HH:MM into Brisbane time on that day', () => {
  assert.equal(msFromClock('2026-10-08', '09:30'), brisbane(2026, 10, 8, 9, 30));
  assert.equal(msFromClock('2026-10-08', '00:00'), brisbane(2026, 10, 8, 0, 0));
});

test('msFromClock rejects rubbish', () => {
  assert.equal(msFromClock('2026-10-08', ''), null);
  assert.equal(msFromClock('2026-10-08', '25:00'), null);
  assert.equal(msFromClock('2026-10-08', 'ab:cd'), null);
});

test('a time later than now is taken as yesterday (she forgot to log earlier)', () => {
  const now = brisbane(2026, 10, 8, 9, 0);
  assert.equal(msFromClock('2026-10-08', '23:30', now), brisbane(2026, 10, 7, 23, 30));
  assert.equal(msFromClock('2026-10-08', '08:15', now), brisbane(2026, 10, 8, 8, 15));
});

test('clockValue gives the HH:MM for a time input', () => {
  assert.equal(clockValue(brisbane(2026, 10, 8, 7, 5)), '07:05');
});

import { splitClock, joinClock } from '../js/time.js';

test('splitClock: 24-hour shows the hour as it is', () => {
  assert.deepEqual(splitClock('15:05', '24'), { h: 15, m: 5, ap: null });
  assert.deepEqual(splitClock('00:30', '24'), { h: 0, m: 30, ap: null });
});

test('splitClock: 12-hour maps midnight to 12 am and noon to 12 pm', () => {
  assert.deepEqual(splitClock('00:30', '12'), { h: 12, m: 30, ap: 'am' });
  assert.deepEqual(splitClock('12:00', '12'), { h: 12, m: 0, ap: 'pm' });
  assert.deepEqual(splitClock('15:05', '12'), { h: 3, m: 5, ap: 'pm' });
  assert.deepEqual(splitClock('09:45', '12'), { h: 9, m: 45, ap: 'am' });
});

test('joinClock is the exact reverse for every minute of the day, in both clocks', () => {
  for (const clock of ['12', '24']) {
    for (let t = 0; t < 1440; t += 1) {
      const hhmm = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      assert.equal(joinClock(splitClock(hhmm, clock), clock), hhmm);
    }
  }
});

test('joinClock copes with an empty or odd value by giving back nothing', () => {
  assert.equal(joinClock({ h: null, m: 5, ap: 'am' }, '12'), '');
  assert.equal(splitClock('', '24'), null);
  assert.equal(splitClock('nonsense', '12'), null);
});
