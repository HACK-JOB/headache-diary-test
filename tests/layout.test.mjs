import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, PANELS, defaultLayout, normaliseLayout, orderFor, moveStep, moveTo, rowsFor, spanFor, orientationOf } from '../js/layout.js';

const ALL = PANELS.map((p) => p.id);

test('the grid has 6 columns and the panels are the ones on the main page', () => {
  assert.equal(COLS, 6);
  assert.deepEqual(ALL, ['water', 'headache', 'day', 'glucose', 'weight', 'meds', 'today', 'intake', 'eaten']);
  for (const p of PANELS) assert.ok(p.label && p.track, p.id);
  assert.deepEqual(PANELS.filter((p) => p.track === 'day').map((p) => p.id), ['day', 'today']);
});

test('the default is the approved layout: water left, headache/day/glucose stacked right, the rest full width', () => {
  const d = defaultLayout();
  for (const o of ['portrait', 'landscape']) {
    assert.deepEqual(d[o].order, ALL);
    assert.deepEqual(['water', 'headache', 'day', 'glucose'].map((id) => d[o].span[id]), [3, 3, 3, 3]);
    assert.deepEqual(['weight', 'meds', 'today', 'intake', 'eaten'].map((id) => d[o].span[id]), [6, 6, 6, 6, 6]);
    assert.equal(d[o].rows.water, 3);
  }
});

test('normaliseLayout repairs anything odd and never loses or doubles a panel', () => {
  assert.deepEqual(normaliseLayout(null), defaultLayout());
  assert.deepEqual(normaliseLayout('x'), defaultLayout());
  const n = normaliseLayout({ portrait: { order: ['meds', 'nope', 'meds', 'water'], span: { water: 9, meds: 2, glucose: 'a' }, rows: { water: 0, meds: 2.5 } } });
  assert.deepEqual(n.portrait.order, ['meds', 'water', 'headache', 'day', 'glucose', 'weight', 'today', 'intake', 'eaten']);
  assert.equal(n.portrait.span.meds, 2);
  assert.equal(n.portrait.span.water, 3);      // 9 is not a column count: back to the default
  assert.equal(n.portrait.span.glucose, 3);
  assert.equal(n.portrait.rows.water, 3);      // 0 is not valid
  assert.equal(n.portrait.rows.meds, 1);
  assert.deepEqual(n.landscape, defaultLayout().landscape);
});

test('orderFor lists only the panels that are showing, in the saved order', () => {
  const l = normaliseLayout({ portrait: { order: ['meds', 'water', 'headache'] } });
  assert.deepEqual(orderFor(l, 'portrait', ['water', 'meds', 'headache']), ['meds', 'water', 'headache']);
  assert.deepEqual(orderFor(l, 'portrait', ['headache', 'water']), ['water', 'headache']);
  assert.deepEqual(orderFor(defaultLayout(), 'landscape', []), []);
});

test('moveStep swaps with the neighbour that is showing, skipping hidden panels, and stops at the ends', () => {
  const l = defaultLayout();
  const vis = ['water', 'headache', 'glucose', 'weight'];                  // day is hidden
  const a = moveStep(l, 'portrait', 'glucose', -1, vis);
  assert.deepEqual(orderFor(a, 'portrait', vis), ['water', 'glucose', 'headache', 'weight']);
  assert.equal(moveStep(l, 'portrait', 'water', -1, vis), l);              // first: nothing to do
  assert.equal(moveStep(l, 'portrait', 'weight', 1, vis), l);              // last: nothing to do
  const b = moveStep(l, 'portrait', 'headache', 1, vis);
  assert.deepEqual(orderFor(b, 'portrait', vis), ['water', 'glucose', 'headache', 'weight']);
  assert.deepEqual(l, defaultLayout());                                    // the input is never changed
});

test('moveTo drops a panel before or after another', () => {
  const l = defaultLayout();
  assert.deepEqual(moveTo(l, 'portrait', 'eaten', 'water', false).portrait.order.slice(0, 3), ['eaten', 'water', 'headache']);
  assert.deepEqual(moveTo(l, 'portrait', 'water', 'weight', true).portrait.order.slice(0, 5), ['headache', 'day', 'glucose', 'weight', 'water']);
  assert.equal(moveTo(l, 'portrait', 'water', 'water', true), l);
  assert.equal(moveTo(l, 'portrait', 'water', 'nope', true), l);
});

test('portrait and landscape layouts are separate', () => {
  const l = moveStep(defaultLayout(), 'portrait', 'headache', 1, ALL);
  assert.deepEqual(l.landscape.order, ALL);
  assert.notDeepEqual(l.portrait.order, ALL);
});

test('rows: a tall panel only spans as many rows as there are panels to sit beside it', () => {
  const l = defaultLayout();
  assert.equal(rowsFor(l, 'portrait', 'water', ALL), 3);
  assert.equal(rowsFor(l, 'portrait', 'water', ALL.filter((x) => x !== 'glucose')), 2);
  assert.equal(rowsFor(l, 'portrait', 'water', ['water', 'weight', 'meds']), 1);
  assert.equal(rowsFor(l, 'portrait', 'weight', ALL), 1);
  const wide = normaliseLayout({ portrait: { span: { headache: 6 } } });
  assert.equal(rowsFor(wide, 'portrait', 'water', ALL), 1);                // nothing fits beside it any more
});

test('spanFor gives the saved span, or the full width for a panel that is not in the layout', () => {
  assert.equal(spanFor(defaultLayout(), 'portrait', 'water'), 3);
  assert.equal(spanFor(defaultLayout(), 'portrait', 'weight'), 6);
  assert.equal(spanFor(defaultLayout(), 'portrait', 'nope'), 6);
});

test('orientationOf', () => {
  assert.equal(orientationOf(800, 1280), 'portrait');
  assert.equal(orientationOf(1280, 800), 'landscape');
  assert.equal(orientationOf(800, 800), 'landscape');
});
