import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_STEPS, layoutCallouts, pageFrom, estimateHeight, overlaps } from '../js/help.js';

const vp = { w: 1280, h: 800 };
const box = (x, y, w, h) => ({ x, y, w, h });
const tgt = (id, x, y, w, h, text = 'Short text here.') => ({ id, rect: box(x, y, w, h), text });

test('MAIN_STEPS: every step has an id, a selector list and a short impersonal sentence', () => {
  assert.ok(MAIN_STEPS.length >= 8);
  const ids = new Set();
  for (const s of MAIN_STEPS) {
    assert.ok(s.id && !ids.has(s.id), 'unique id ' + s.id); ids.add(s.id);
    assert.ok(Array.isArray(s.selectors) && s.selectors.length > 0);
    assert.ok(s.text.length > 10 && s.text.length <= 170, `${s.id} text length ${s.text.length}`);
    assert.ok(!/\b(you|your|she|her)\b/i.test(s.text), `${s.id} must be impersonal`);
  }
});

test('overlaps: touching edges do not count, a shared area does', () => {
  assert.equal(overlaps(box(0, 0, 10, 10), box(10, 0, 10, 10)), false);
  assert.equal(overlaps(box(0, 0, 10, 10), box(9, 9, 10, 10)), true);
});

test('estimateHeight grows with text length and with a narrower box', () => {
  assert.ok(estimateHeight('x'.repeat(120), 260, 20) > estimateHeight('x'.repeat(30), 260, 20));
  assert.ok(estimateHeight('x'.repeat(80), 180, 20) > estimateHeight('x'.repeat(80), 320, 20));
});

test('layoutCallouts: one target gets a callout beside it, inside the screen, with an arrow end on the target', () => {
  const r = layoutCallouts([tgt('a', 100, 200, 200, 60)], vp, { fontPx: 20 });
  assert.equal(r.failed.length, 0);
  const c = r.placed[0];
  assert.ok(c.box.x >= 8 && c.box.y >= 8 && c.box.x + c.box.w <= vp.w - 8 && c.box.y + c.box.h <= vp.h - 8);
  assert.equal(overlaps(c.box, box(100, 200, 200, 60)), false);
  assert.ok(c.arrow.to.x >= 100 && c.arrow.to.x <= 300 && c.arrow.to.y >= 200 && c.arrow.to.y <= 260);
  assert.equal(c.n, 1);
});

test('layoutCallouts: callouts never overlap each other or any target, however many', () => {
  const ts = [tgt('a', 40, 20, 200, 56), tgt('b', 40, 120, 600, 120), tgt('c', 700, 120, 400, 120), tgt('d', 40, 300, 300, 80), tgt('e', 400, 300, 300, 80)];
  const r = layoutCallouts(ts, vp, { fontPx: 20 });
  assert.equal(r.failed.length, 0);
  for (let i = 0; i < r.placed.length; i += 1) {
    for (const t of ts) assert.equal(overlaps(r.placed[i].box, t.rect), false, `callout ${i} covers target ${t.id}`);
    for (let j = i + 1; j < r.placed.length; j += 1) assert.equal(overlaps(r.placed[i].box, r.placed[j].box), false, `callouts ${i} and ${j} overlap`);
  }
  assert.deepEqual(r.placed.map((p) => p.n), [1, 2, 3, 4, 5]);
});

test('layoutCallouts: a target that fills the whole screen cannot get a callout and is reported as failed', () => {
  const r = layoutCallouts([tgt('big', 0, 0, 1280, 800)], vp, { fontPx: 20 });
  assert.equal(r.placed.length, 0);
  assert.deepEqual(r.failed.map((f) => f.id), ['big']);
});

test('layoutCallouts: a narrow portrait screen with large text can fail, and says which ones', () => {
  const ts = Array.from({ length: 6 }, (_, i) => tgt('t' + i, 10, 10 + i * 100, 340, 90, 'x'.repeat(150)));
  const r = layoutCallouts(ts, { w: 360, h: 640 }, { fontPx: 30 });
  assert.ok(r.failed.length > 0);
  assert.equal(r.placed.length + r.failed.length, 6);
});

test('pageFrom: takes the steps that fit on screen when the first one is scrolled to the top, max 5, in order', () => {
  const rects = [box(0, 10, 100, 50), box(0, 100, 100, 50), box(0, 300, 100, 50), box(0, 500, 100, 50), box(0, 700, 100, 50), box(0, 760, 100, 60), box(0, 1000, 100, 50)];
  assert.deepEqual(pageFrom(rects, 0, 800, 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(pageFrom(rects, 5, 800, 5), [5, 6]);       // the window starts at step 5, so step 6 fits too
  assert.deepEqual(pageFrom(rects, 6, 800, 5), [6]);
  assert.deepEqual(pageFrom(rects, 7, 800, 5), []);
});

test('pageFrom: a step taller than the screen still gets its own page', () => {
  const rects = [box(0, 0, 100, 3000), box(0, 3010, 100, 50)];
  assert.deepEqual(pageFrom(rects, 0, 800, 5), [0]);
});
