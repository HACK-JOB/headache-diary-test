import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWeight, validateGlucose, GLUCOSE_TAGS, weightsByDay, needsWeight, weightToday, weightNeedsCheck, weightAverage, glucoseToday, glucoseStatus, weightShown, weightShownEvent, WEIGHT_CHECK_KG } from '../js/measures.js';

const bne = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 10, mi);
let n = 0;
const wake = (ms) => ({ id: 'w' + ++n, type: 'day', kind: 'wake', ms, seq: n });
const kg = (ms, v) => ({ id: 'k' + ++n, type: 'measure', kind: 'weight', kg: v, ms, seq: n });
const skip = (ms) => ({ id: 's' + ++n, type: 'measure', kind: 'weight-skip', ms, seq: n });
const glu = (ms, mmol, tag = null) => ({ id: 'g' + ++n, type: 'measure', kind: 'glucose', mmol, tag, ms, seq: n });
const D8 = '2026-10-08';

test('validateWeight: a number of kilograms, comma allowed, rounded to 0.1, with a sensible range', () => {
  assert.deepEqual(validateWeight('61.44'), { errors: [], kg: 61.4 });
  assert.deepEqual(validateWeight(' 61,5 '), { errors: [], kg: 61.5 });
  assert.deepEqual(validateWeight('').errors, ['kg']);
  assert.deepEqual(validateWeight('abc').errors, ['kg']);
  assert.deepEqual(validateWeight('5').errors, ['kg']);
  assert.deepEqual(validateWeight('700').errors, ['kg']);
});

test('validateGlucose: mmol/L between 0.5 and 40, one decimal, optional known tag only', () => {
  assert.deepEqual(validateGlucose('6.84', null), { errors: [], mmol: 6.8, tag: null });
  assert.deepEqual(validateGlucose('7,2', 'fasting'), { errors: [], mmol: 7.2, tag: 'fasting' });
  assert.deepEqual(validateGlucose('', null).errors, ['mmol']);
  assert.deepEqual(validateGlucose('0.2', null).errors, ['mmol']);
  assert.deepEqual(validateGlucose('55', null).errors, ['mmol']);
  assert.deepEqual(validateGlucose('6', 'lunchtime').errors, ['tag']);
  assert.deepEqual(GLUCOSE_TAGS.map((t) => t.key), ['fasting', 'before', 'after']);
});

test('needsWeight: only after WOKE UP today, only once, and a skip counts as an answer', () => {
  const t = bne(2026, 10, 8, 7);
  assert.equal(needsWeight([], D8), false);
  assert.equal(needsWeight([wake(t)], D8), true);
  assert.equal(needsWeight([wake(t), kg(t + 6e4, 61.4)], D8), false);
  assert.equal(needsWeight([wake(t), skip(t + 6e4)], D8), false);
  assert.equal(needsWeight([wake(bne(2026, 10, 7, 7))], D8), false);
  assert.equal(needsWeight([wake(t), kg(bne(2026, 10, 7, 7), 60)], D8), true);
});

test('weightToday returns the latest entry for that day, or null', () => {
  const t = bne(2026, 10, 8, 7);
  assert.equal(weightToday([wake(t)], D8), null);
  assert.equal(weightToday([kg(t, 61), kg(t + 1e5, 61.6)], D8).kg, 61.6);
});

test('weightNeedsCheck: a big jump from her last readings asks for a re-check; first readings never do', () => {
  const prior = [kg(bne(2026, 10, 5, 7), 70), kg(bne(2026, 10, 6, 7), 70.4), kg(bne(2026, 10, 7, 7), 69.8)];
  assert.equal(weightNeedsCheck(prior, 70.5, D8), false);
  assert.equal(weightNeedsCheck(prior, 70 + WEIGHT_CHECK_KG + 0.5, D8), true);
  assert.equal(weightNeedsCheck(prior, 70 - WEIGHT_CHECK_KG - 0.5, D8), true);
  assert.equal(weightNeedsCheck([], 120, D8), false);
  assert.equal(weightNeedsCheck([kg(bne(2026, 10, 7, 7), 70)], 120, D8), false);
});

test('weightsByDay and weightAverage: rolling 7 days ending on that day, count shown, no guessing', () => {
  const evs = [];
  for (let d = 1; d <= 7; d += 1) evs.push(kg(bne(2026, 10, d, 7), 70 + d));       // 71..77
  evs.push(kg(bne(2026, 9, 20, 7), 99));                                           // too old
  assert.deepEqual(weightsByDay(evs).slice(-2).map((x) => [x.key, x.kg]), [['2026-10-06', 76], ['2026-10-07', 77]]);
  const a = weightAverage(evs, '2026-10-07');
  assert.equal(a.count, 7);
  assert.equal(a.average, 74);
  assert.equal(weightAverage(evs, '2026-10-09').count, 5);
  assert.equal(weightAverage([], D8).average, null);
});

test('weightsByDay keeps only the latest reading per day', () => {
  const evs = [kg(bne(2026, 10, 7, 7), 70), kg(bne(2026, 10, 7, 9), 70.6)];
  assert.deepEqual(weightsByDay(evs).map((x) => x.kg), [70.6]);
});

test('glucoseToday: newest first, only that day, removed ones dropped', () => {
  const a = glu(bne(2026, 10, 8, 7), 6.1, 'fasting'); const b = glu(bne(2026, 10, 8, 12), 8.4);
  const gone = { ...glu(bne(2026, 10, 8, 13), 9), deleted: true };
  const other = glu(bne(2026, 10, 7, 12), 5);
  assert.deepEqual(glucoseToday([a, b, gone, other], D8).map((x) => x.mmol), [8.4, 6.1]);
});

test('glucoseStatus: a single reading uses both limits; no target = no status', () => {
  const t = { min: 4, max: 10, margin: 20 };
  assert.equal(glucoseStatus(7, t).status, 'in');
  assert.equal(glucoseStatus(9.5, t).status, 'near');
  assert.equal(glucoseStatus(11, t).status, 'over');
  assert.equal(glucoseStatus(3.5, t).status, 'under');
  assert.equal(glucoseStatus(7, undefined).status, 'none');
  assert.ok(glucoseStatus(11, t).word && glucoseStatus(11, t).mark);
});

test('weightShown: on by default, and the latest switch wins', () => {
  assert.equal(weightShown([]), true);
  const off = { id: 'c1', type: 'config', ...weightShownEvent(false), ms: 5, seq: 1 };
  const on = { id: 'c2', type: 'config', ...weightShownEvent(true), ms: 6, seq: 2 };
  assert.equal(weightShown([off]), false);
  assert.equal(weightShown([off, on]), true);
});
