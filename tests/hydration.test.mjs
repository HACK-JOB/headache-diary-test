import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVolume, dayWaterTotal, recentSizes, addSizeToRecent } from '../js/hydration.js';

const brisbane = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 10, mi);

test('parseVolume accepts ml and litres', () => {
  assert.equal(parseVolume('600', 'ml'), 600);
  assert.equal(parseVolume('1.5', 'L'), 1500);
  assert.equal(parseVolume('0.75', 'l'), 750);
});

test('parseVolume rejects nonsense, zero, negatives and absurd sizes', () => {
  assert.equal(parseVolume('', 'ml'), null);
  assert.equal(parseVolume('abc', 'ml'), null);
  assert.equal(parseVolume('0', 'ml'), null);
  assert.equal(parseVolume('-5', 'ml'), null);
  assert.equal(parseVolume('50', 'L'), null); // 50 L is a typo, not a drink
});

test('dayWaterTotal sums only water entries for that Brisbane day', () => {
  const events = [
    { type: 'water', ms: brisbane(2026, 10, 8, 7, 0), ml: 600 },
    { type: 'water', ms: brisbane(2026, 10, 8, 13, 0), ml: 600 },
    { type: 'water', ms: brisbane(2026, 10, 7, 23, 59), ml: 999 },   // yesterday
    { type: 'beverage', ms: brisbane(2026, 10, 8, 9, 0), ml: 250 },  // other fluids, not water
  ];
  assert.equal(dayWaterTotal(events, '2026-10-08'), 1200);
});

test('dayWaterTotal ignores deleted entries', () => {
  const events = [
    { id: 1, type: 'water', ms: brisbane(2026, 10, 8, 7, 0), ml: 600 },
    { id: 2, type: 'water', ms: brisbane(2026, 10, 8, 8, 0), ml: 500, deleted: true },
  ];
  assert.equal(dayWaterTotal(events, '2026-10-08'), 600);
});

test('recentSizes returns the last 5 distinct sizes, most recent first', () => {
  const events = [100, 200, 300, 200, 400, 500, 600, 700].map((ml, i) => ({
    type: 'water', ms: i * 1000, ml,
  }));
  assert.deepEqual(recentSizes(events), [700, 600, 500, 400, 200]);
});

test('recentSizes falls back to starter sizes when there is no history', () => {
  assert.deepEqual(recentSizes([]), [250, 500, 600, 750, 1000]);
});

test('recentSizes pads with starter sizes when history is short', () => {
  const events = [{ type: 'water', ms: 1, ml: 333 }];
  assert.deepEqual(recentSizes(events), [333, 250, 500, 600, 750]);
});

test('addSizeToRecent moves a re-used size to the front without duplicating', () => {
  assert.deepEqual(addSizeToRecent([700, 600, 500, 400, 200], 500), [500, 700, 600, 400, 200]);
  assert.deepEqual(addSizeToRecent([700, 600, 500, 400, 200], 900), [900, 700, 600, 500, 400]);
});
