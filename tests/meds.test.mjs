import test from 'node:test';
import assert from 'node:assert/strict';
import { recentItems, suggest, canonical } from '../js/memory.js';

const used = (name, ms, kind = 'med') => ({ type: 'headache', ms, episodeId: 'E', kind: 'update', meds: kind === 'med' ? [{ name, at: ms }] : undefined, relief: kind === 'relief' ? [name] : undefined });

test('canonical trims and collapses spaces but keeps the person\'s wording', () => {
  assert.equal(canonical('  Panadol   Osteo '), 'Panadol Osteo');
});

test('recentItems returns the last 5 distinct items, newest first, no presets', () => {
  const ev = ['A', 'B', 'C', 'B', 'D', 'E', 'F'].map((n, i) => used(n, i + 1));
  assert.deepEqual(recentItems(ev, 'meds'), ['F', 'E', 'D', 'B', 'C']);
  assert.deepEqual(recentItems([], 'meds'), []);
});

test('items match case-insensitively and keep the first spelling', () => {
  const ev = [used('Panadol', 1), used('panadol', 2)];
  assert.deepEqual(recentItems(ev, 'meds'), ['panadol']);
});

test('suggest finds everything ever used that starts with or contains the text', () => {
  const ev = ['Panadol', 'Nurofen', 'Panadol Osteo', 'Voltaren', 'Strepsils'].map((n, i) => used(n, i + 1));
  assert.deepEqual(suggest(ev, 'meds', 'pan'), ['Panadol Osteo', 'Panadol']);
  assert.deepEqual(suggest(ev, 'meds', 'en'), ['Voltaren', 'Nurofen']); // contains, newest first
  assert.deepEqual(suggest(ev, 'meds', 'ren'), ['Voltaren']);
  assert.deepEqual(suggest(ev, 'meds', ''), []);
});

test('relief items are remembered separately from medications', () => {
  const ev = [used('Panadol', 1), used('Ice pack', 2, 'relief')];
  assert.deepEqual(recentItems(ev, 'meds'), ['Panadol']);
  assert.deepEqual(recentItems(ev, 'relief'), ['Ice pack']);
});

test('deleted entries are forgotten', () => {
  const e = used('Mistake', 1); e.deleted = true;
  assert.deepEqual(recentItems([e], 'meds'), []);
});
