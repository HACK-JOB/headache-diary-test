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
