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

/* ---------- step 2: sizes, minimums, per-panel text size ---------- */
import { MIN_REM, PANEL_TEXT, textFor, setText, zoomFor, minPx, minSpan, effectiveSpans, setSpan, setRows, snapSpan, snapRows, panelWidth, setTall, snapTall, GRIPS } from '../js/layout.js';

test('every panel has a minimum width in rem for every text size, never below 9 rem', () => {
  for (const t of ['big', 'medium', 'small']) for (const id of ALL) assert.ok(MIN_REM[t][id] >= 9, `${t} ${id}`);
  assert.ok(MIN_REM.big.intake > MIN_REM.big.water && MIN_REM.big.meds > MIN_REM.big.day);
});

test('per-panel text size: "same" by default, absolute choices otherwise, junk ignored', () => {
  assert.deepEqual(PANEL_TEXT, ['same', 'big', 'medium', 'small']);
  assert.equal(textFor(defaultLayout(), 'water'), 'same');
  const l = setText(defaultLayout(), 'water', 'small');
  assert.equal(textFor(l, 'water'), 'small');
  assert.equal(textFor(setText(l, 'water', 'same'), 'water'), 'same');
  const d0 = defaultLayout();
  assert.equal(setText(d0, 'water', 'huge'), d0);                                   // not a size: nothing changes
  assert.equal(textFor(setText(defaultLayout(), 'nope', 'small'), 'water'), 'same');
  assert.equal(textFor(normaliseLayout({ text: { water: 'medium', meds: 'giant', bogus: 'big' } }), 'water'), 'medium');
  assert.equal(textFor(normaliseLayout({ text: { water: 'medium', meds: 'giant', bogus: 'big' } }), 'meds'), 'same');
  assert.deepEqual(Object.keys(normaliseLayout({ text: { bogus: 'big' } }).text), []);
  assert.equal(setText(defaultLayout(), 'water', 'small').portrait.order.length, 9);          // other parts survive
});

test('zoomFor scales a panel from the global size to its own', () => {
  assert.equal(zoomFor('same', 'big'), 1);
  assert.equal(zoomFor('big', 'big'), 1);
  assert.equal(zoomFor('small', 'big'), 14 / 20);
  assert.equal(zoomFor('big', 'small'), 20 / 14);
  assert.equal(zoomFor('medium', 'small'), 17 / 14);
});

test('minimum width in pixels follows the panel\'s own text size', () => {
  assert.equal(minPx('water', 'big'), MIN_REM.big.water * 20);
  assert.equal(minPx('water', 'small'), MIN_REM.small.water * 14);
  assert.ok(minPx('meds', 'small') < minPx('meds', 'big'));
});

test('minSpan: the fewest of the 6 columns whose width holds the minimum', () => {
  // 6 columns of 100px with 20px gaps: a span of n is 100n + 20(n-1)
  assert.equal(minSpan({ minPx: 100, gridWidth: 700, gap: 20 }), 1);
  assert.equal(minSpan({ minPx: 220, gridWidth: 700, gap: 20 }), 2);
  assert.equal(minSpan({ minPx: 221, gridWidth: 700, gap: 20 }), 3);
  assert.equal(minSpan({ minPx: 99999, gridWidth: 700, gap: 20 }), 6);
  assert.equal(minSpan({ minPx: 1, gridWidth: 0, gap: 20 }), 6);                  // not laid out yet: be safe
  assert.equal(panelWidth(3, 700, 20), 3 * 100 + 2 * 20);
});

test('effectiveSpans widens a panel that is saved too narrow for its content, without changing what is saved', () => {
  const l = setSpan(defaultLayout(), 'portrait', 'water', 1, 1);
  const mins = { water: 3, headache: 2 };
  const eff = effectiveSpans(l, 'portrait', mins);
  assert.equal(eff.portrait.span.water, 3);
  assert.equal(eff.portrait.span.headache, 3);
  assert.equal(l.portrait.span.water, 1);
});

test('setSpan and setRows clamp to what is allowed and never change the input', () => {
  const l = defaultLayout();
  assert.equal(setSpan(l, 'portrait', 'water', 2, 3).portrait.span.water, 3);       // below the minimum
  assert.equal(setSpan(l, 'portrait', 'water', 9, 3).portrait.span.water, 6);       // above 6
  assert.equal(setSpan(l, 'portrait', 'water', 4, 3).portrait.span.water, 4);
  assert.equal(setSpan(l, 'portrait', 'water', 3, 3), l);                           // no change returns the same object
  assert.equal(setSpan(l, 'portrait', 'nope', 3, 1), l);
  assert.equal(setRows(l, 'portrait', 'water', 2).portrait.rows.water, 2);
  assert.equal(setRows(l, 'portrait', 'water', 0).portrait.rows.water, 1);
  assert.equal(setRows(l, 'portrait', 'water', 99).portrait.rows.water, 6);
  assert.equal(l.portrait.span.water, 3);
  assert.equal(setSpan(l, 'landscape', 'water', 4, 3).portrait.span.water, 3);       // orientations are separate
});

test('snapSpan: dragging the right edge by whole columns, left edge the other way, clamped', () => {
  const base = { startSpan: 3, colW: 100, gap: 20, min: 2 };
  assert.equal(snapSpan({ ...base, dxPx: 0, sign: 1 }), 3);
  assert.equal(snapSpan({ ...base, dxPx: 50, sign: 1 }), 3);                         // under half a column step (60 px): no change
  assert.equal(snapSpan({ ...base, dxPx: 70, sign: 1 }), 4);                         // past half a column: snaps
  assert.equal(snapSpan({ ...base, dxPx: 400, sign: 1 }), 6);                        // capped at 6
  assert.equal(snapSpan({ ...base, dxPx: -130, sign: 1 }), 2);
  assert.equal(snapSpan({ ...base, dxPx: -900, sign: 1 }), 2);                       // floored at the minimum
  assert.equal(snapSpan({ ...base, dxPx: -130, sign: -1 }), 4);                      // left edge: dragging left widens
});

test('snapRows: whole rows, floored at 1, capped at 6', () => {
  const base = { startRows: 3, unit: 100 };
  assert.equal(snapRows({ ...base, dyPx: 40, sign: 1 }), 3);
  assert.equal(snapRows({ ...base, dyPx: 60, sign: 1 }), 4);
  assert.equal(snapRows({ ...base, dyPx: -250, sign: 1 }), 1);
  assert.equal(snapRows({ ...base, dyPx: 900, sign: 1 }), 6);
  assert.equal(snapRows({ ...base, dyPx: -150, sign: -1 }), 5);                     // top edge: dragging up makes it taller
  assert.equal(snapRows({ startRows: 1, unit: 0, dyPx: 50, sign: 1 }), 1);
});

test('tall: extra height steps, 0 to 8, saved per orientation, repaired when odd', () => {
  assert.equal(defaultLayout().portrait.tall.water, 0);
  const l = setTall(defaultLayout(), 'portrait', 'meds', 3);
  assert.equal(l.portrait.tall.meds, 3);
  assert.equal(l.landscape.tall.meds, 0);
  assert.equal(setTall(l, 'portrait', 'meds', 99).portrait.tall.meds, 8);
  assert.equal(setTall(l, 'portrait', 'meds', -4).portrait.tall.meds, 0);
  const d = defaultLayout();
  assert.equal(setTall(d, 'portrait', 'meds', 0), d);
  assert.equal(setTall(d, 'portrait', 'nope', 2), d);
  assert.equal(normaliseLayout({ portrait: { tall: { meds: 2, water: 'x', day: 99 } } }).portrait.tall.meds, 2);
  assert.equal(normaliseLayout({ portrait: { tall: { meds: 2, water: 'x', day: 99 } } }).portrait.tall.water, 0);
  assert.equal(normaliseLayout({ portrait: { tall: { meds: 2, water: 'x', day: 99 } } }).portrait.tall.day, 0);
});

test('snapTall: whole steps, floored at 0, capped at 8, top edge works the other way', () => {
  const base = { startTall: 2, unit: 80 };
  assert.equal(snapTall({ ...base, dyPx: 30, sign: 1 }), 2);
  assert.equal(snapTall({ ...base, dyPx: 50, sign: 1 }), 3);
  assert.equal(snapTall({ ...base, dyPx: -999, sign: 1 }), 0);
  assert.equal(snapTall({ ...base, dyPx: 9999, sign: 1 }), 8);
  assert.equal(snapTall({ ...base, dyPx: -100, sign: -1 }), 3);
  assert.equal(snapTall({ startTall: 1, unit: 0, dyPx: 90, sign: 1 }), 1);
});

test('the grips: four edges and four corners, each with its own direction', () => {
  assert.deepEqual(GRIPS.map((g) => g.key), ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']);
  const e = GRIPS.find((g) => g.key === 'e'), w = GRIPS.find((g) => g.key === 'w'), s = GRIPS.find((g) => g.key === 's'), n = GRIPS.find((g) => g.key === 'n'), se = GRIPS.find((g) => g.key === 'se'), nw = GRIPS.find((g) => g.key === 'nw');
  assert.deepEqual([e.x, e.y, w.x, w.y], [1, 0, -1, 0]);
  assert.deepEqual([s.x, s.y, n.x, n.y], [0, 1, 0, -1]);
  assert.deepEqual([se.x, se.y, nw.x, nw.y], [1, 1, -1, -1]);
});

import { heightBy } from '../js/layout.js';
test('heightBy: shorter removes extra height first, then the built-in rows; taller restores rows first, then adds height', () => {
  const d = defaultLayout();
  assert.equal(d.portrait.rows.water, 3);
  const a = heightBy(d, 'portrait', 'water', -1);
  assert.equal(a.portrait.rows.water, 2);
  assert.equal(heightBy(d, 'portrait', 'water', -9).portrait.rows.water, 1);
  assert.equal(heightBy(d, 'portrait', 'water', -9).portrait.tall.water, 0);
  assert.equal(heightBy(a, 'portrait', 'water', 1).portrait.rows.water, 3);
  const t = heightBy(d, 'portrait', 'water', 2);
  assert.equal(t.portrait.rows.water, 3);
  assert.equal(t.portrait.tall.water, 2);
  assert.equal(heightBy(t, 'portrait', 'water', -3).portrait.tall.water, 0);
  assert.equal(heightBy(t, 'portrait', 'water', -3).portrait.rows.water, 2);
  assert.equal(heightBy(d, 'portrait', 'water', 0), d);
  assert.equal(heightBy(d, 'portrait', 'nope', 1), d);
  assert.equal(heightBy(d, 'landscape', 'water', -1).portrait.rows.water, 3);
  assert.equal(heightBy(d, 'portrait', 'day', -1), d);                              // already one row, no extra: nothing to remove
});

import { setFree, isFree } from '../js/layout.js';
test('free flow: off by default, saved per orientation, repaired when odd', () => {
  const d = defaultLayout();
  assert.equal(isFree(d, 'portrait'), false);
  const f = setFree(d, 'landscape', true);
  assert.equal(isFree(f, 'landscape'), true);
  assert.equal(isFree(f, 'portrait'), false);
  assert.equal(setFree(d, 'portrait', false), d);
  assert.equal(isFree(normaliseLayout({ landscape: { free: true } }), 'landscape'), true);
  assert.equal(isFree(normaliseLayout({ landscape: { free: 'yes' } }), 'landscape'), false);
  assert.equal(isFree(normaliseLayout(JSON.parse(JSON.stringify(f))), 'landscape'), true);
});

test('free flow ignores built-in rows: a panel is as tall as its content plus its own extra steps', () => {
  const f = setFree(defaultLayout(), 'portrait', true);
  assert.equal(rowsFor(f, 'portrait', 'water', ALL), 1);                       // snapped would give 3
  assert.equal(rowsFor(defaultLayout(), 'portrait', 'water', ALL), 3);
});

test('free flow: Shorter and Taller only change the extra steps, never the built-in rows', () => {
  const f = setFree(defaultLayout(), 'portrait', true);
  const t = heightBy(f, 'portrait', 'water', 2);
  assert.equal(t.portrait.tall.water, 2);
  assert.equal(t.portrait.rows.water, 3);
  const s = heightBy(t, 'portrait', 'water', -5);
  assert.equal(s.portrait.tall.water, 0);
  assert.equal(s.portrait.rows.water, 3);
  assert.equal(heightBy(f, 'portrait', 'water', -1), f);                       // nothing to remove
});

import { masonrySpan } from '../js/layout.js';
test('masonrySpan: whole small rows that hold the panel and the gap, at least 1', () => {
  assert.equal(masonrySpan({ heightPx: 100, gapPx: 20, unitPx: 4 }), 30);
  assert.equal(masonrySpan({ heightPx: 101, gapPx: 20, unitPx: 4 }), 31);
  assert.equal(masonrySpan({ heightPx: 0, gapPx: 0, unitPx: 4 }), 1);
  assert.equal(masonrySpan({ heightPx: 50, gapPx: 10, unitPx: 0 }), 1);
});

import { isLoose, setLoose, anyLoose, levelHeights } from '../js/layout.js';
test('per-panel snapping: every panel snaps by default, loose is saved per panel and orientation', () => {
  const d = defaultLayout();
  assert.equal(isLoose(d, 'portrait', 'water'), false);
  assert.equal(anyLoose(d, 'portrait'), false);
  const l = setLoose(d, 'portrait', 'day', true);
  assert.equal(isLoose(l, 'portrait', 'day'), true);
  assert.equal(isLoose(l, 'portrait', 'water'), false);
  assert.equal(isLoose(l, 'landscape', 'day'), false);
  assert.equal(anyLoose(l, 'portrait'), true);
  assert.equal(setLoose(d, 'portrait', 'day', false), d);
  assert.equal(setLoose(d, 'portrait', 'nope', true), d);
  assert.equal(isLoose(normaliseLayout(JSON.parse(JSON.stringify(l))), 'portrait', 'day'), true);
  assert.equal(isLoose(normaliseLayout({ portrait: { loose: { day: 'yes', water: true } } }), 'portrait', 'day'), false);
  assert.equal(isLoose(normaliseLayout({ portrait: { loose: { day: 'yes', water: true } } }), 'portrait', 'water'), true);
});

test('Free flow / Snapped rows buttons set every panel at once', () => {
  const f = setFree(defaultLayout(), 'portrait', true);
  assert.ok(ALL.every((id) => isLoose(f, 'portrait', id)));
  assert.equal(isFree(f, 'portrait'), true);
  assert.equal(isFree(setLoose(f, 'portrait', 'day', false), 'portrait'), false);
  assert.ok(ALL.every((id) => !isLoose(setFree(f, 'portrait', false), 'portrait', id)));
});

test('once any panel is loose, built-in rows are ignored for every panel', () => {
  const l = setLoose(defaultLayout(), 'portrait', 'day', true);
  assert.equal(rowsFor(l, 'portrait', 'water', ALL), 1);
  assert.equal(rowsFor(defaultLayout(), 'portrait', 'water', ALL), 3);
  assert.equal(heightBy(l, 'portrait', 'water', -1), l);
});

test('levelHeights: snapped panels that start on the same line share the tallest height; loose ones keep their own', () => {
  const items = [
    { id: 'a', snap: true, top: 0, h: 100 }, { id: 'b', snap: true, top: 1, h: 160 },
    { id: 'c', snap: false, top: 0, h: 90 },
    { id: 'd', snap: true, top: 300, h: 80 }, { id: 'e', snap: true, top: 300, h: 70 },
    { id: 'f', snap: true, top: 500, h: 60 },
  ];
  assert.deepEqual(levelHeights(items, 4), { a: 160, b: 160, c: 90, d: 80, e: 80, f: 60 });
  assert.deepEqual(levelHeights([], 4), {});
});

import { isLocked, setLocked, blocksOf, planHeights, growBlocked } from '../js/layout.js';
test('lock size: off by default, saved per panel and orientation, repaired when odd', () => {
  const d = defaultLayout();
  assert.equal(isLocked(d, 'portrait', 'day'), false);
  const l = setLocked(d, 'portrait', 'day', true);
  assert.equal(isLocked(l, 'portrait', 'day'), true);
  assert.equal(isLocked(l, 'landscape', 'day'), false);
  assert.equal(setLocked(d, 'portrait', 'day', false), d);
  assert.equal(setLocked(d, 'portrait', 'nope', true), d);
  assert.equal(isLocked(normaliseLayout(JSON.parse(JSON.stringify(l))), 'portrait', 'day'), true);
  assert.equal(isLocked(normaliseLayout({ portrait: { locked: { day: 1, water: true } } }), 'portrait', 'day'), false);
});

// The picture: Water full width on top. Left: Blood glucose. Right stack: Day, Today so far, Eaten today. Headache under the stack.
const pic = (over = {}) => {
  const base = [
    { id: 'water', snap: false, locked: false, c0: 0, c1: 6, top: 0, bottom: 100 },
    { id: 'glucose', snap: false, locked: false, c0: 0, c1: 3, top: 120, bottom: 620 },
    { id: 'day', snap: false, locked: false, c0: 3, c1: 6, top: 120, bottom: 220 },
    { id: 'today', snap: false, locked: false, c0: 3, c1: 6, top: 240, bottom: 340 },
    { id: 'eaten', snap: false, locked: false, c0: 3, c1: 6, top: 360, bottom: 420 },
    { id: 'headache', snap: false, locked: false, c0: 3, c1: 6, top: 640, bottom: 740 },
  ];
  return base.map((i) => ({ ...i, ...(over[i.id] || {}) }));
};
const sorted = (a) => a.map((b) => [...b].sort());

test('blocks: a snapped panel is tied to every panel it touches at the side; nothing else', () => {
  assert.deepEqual(blocksOf(pic()), []);                                                       // nothing snapped: no blocks
  const b = blocksOf(pic({ glucose: { snap: true } }));
  assert.deepEqual(sorted(b), [['day', 'eaten', 'glucose', 'today']]);                         // not Water (above) and not Headache (below)
  const d = blocksOf(pic({ day: { snap: true } }));
  assert.deepEqual(sorted(d), [['day', 'glucose']]);                                           // Today so far is only below Day
});

test('Blood glucose snapped and taller: the right stack grows to match, Headache is left to move down', () => {
  const h = planHeights(pic({ glucose: { snap: true } }));
  assert.equal(h.glucose, 500);
  assert.equal(h.day, 100);
  assert.equal(h.today, 100);
  assert.equal(h.eaten, 60 + 200);                                       // right stack is 300 tall in a block 500 tall: the lowest panel takes the 200
  assert.equal(h.headache, 100);                                         // not in the block
  assert.equal(h.water, 100);
});

test('Day snapped: it levels up with the one beside it, and Today so far and Eaten are left to move down', () => {
  const h = planHeights(pic({ day: { snap: true } }));
  assert.equal(h.day, 500);
  assert.equal(h.glucose, 500);
  assert.equal(h.today, 100);
});

test('lock size: the locked panel keeps its height and the next unlocked one up takes the growth', () => {
  const h = planHeights(pic({ glucose: { snap: true }, eaten: { locked: true } }));
  assert.equal(h.eaten, 60);
  assert.equal(h.today, 100 + 200);
  const all = planHeights(pic({ glucose: { snap: true }, day: { locked: true }, today: { locked: true }, eaten: { locked: true } }));
  assert.equal(all.eaten, 60);                                           // nothing can take it: a gap is left
});

test('growBlocked: growing a panel is refused when everything beside it is size-locked', () => {
  const items = pic({ glucose: { snap: true }, day: { locked: true }, today: { locked: true }, eaten: { locked: true } });
  assert.equal(growBlocked(items, 'glucose'), true);
  assert.equal(growBlocked(pic({ glucose: { snap: true }, day: { locked: true } }), 'glucose'), false);
  assert.equal(growBlocked(pic(), 'glucose'), false);                    // not in a block
  assert.equal(growBlocked(items, 'water'), false);
});

test('a second snapped pair on its own line is a separate block', () => {
  const items = [
    { id: 'a', snap: true, locked: false, c0: 0, c1: 3, top: 0, bottom: 200 },
    { id: 'b', snap: true, locked: false, c0: 3, c1: 6, top: 0, bottom: 100 },
    { id: 'c', snap: true, locked: false, c0: 0, c1: 3, top: 300, bottom: 350 },
    { id: 'd', snap: true, locked: false, c0: 3, c1: 6, top: 300, bottom: 400 },
  ];
  const h = planHeights(items);
  assert.deepEqual([h.a, h.b, h.c, h.d], [200, 200, 100, 100]);
});

test('a sliver of overlap is not touching: the shared side must be a real stretch of both panels', () => {
  // Left: glucose tall, then today. Right: headache tall, then eaten starting just 20px above today's bottom edge.
  const items = [
    { id: 'glucose', snap: true, locked: false, c0: 0, c1: 3, top: 0, bottom: 800 },
    { id: 'today', snap: true, locked: false, c0: 0, c1: 3, top: 820, bottom: 1000 },
    { id: 'headache', snap: true, locked: false, c0: 3, c1: 6, top: 0, bottom: 980 },
    { id: 'eaten', snap: true, locked: false, c0: 3, c1: 6, top: 980 + 0, bottom: 1100 },
  ];
  assert.deepEqual(blocksOf(items).map((b) => [...b].sort()), [['glucose', 'headache', 'today']]);       // eaten overlaps today by 20px only: not tied
  const near = items.map((i) => (i.id === 'eaten' ? { ...i, top: 900 } : i));
  assert.deepEqual(blocksOf(near).map((b) => [...b].sort()), [['eaten', 'glucose', 'headache', 'today']]);    // 100px of shared side: tied
});

test('a short panel beside a tall one counts when most of it is alongside', () => {
  const items = [
    { id: 'a', snap: true, locked: false, c0: 0, c1: 3, top: 0, bottom: 500 },
    { id: 'b', snap: false, locked: false, c0: 3, c1: 6, top: 450, bottom: 520 },
  ];
  assert.equal(blocksOf(items).length, 1);                                                             // 50px shared, over 24px and over 20% of the shorter one
  const edge = items.map((i) => (i.id === 'b' ? { ...i, top: 490, bottom: 560 } : i));
  assert.equal(blocksOf(edge).length, 0);                                                              // 10px shared: no
});
