import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutCallouts, pagesFor, MAIN_STEPS, TOURS } from '../js/tour.js';

const vp = { w: 1280, h: 800, top: 70 };
const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
const card = (p, it) => ({ x: p.x, y: p.y, w: it.cw, h: it.ch });
const item = (id, x, y, w = 160, h = 56) => ({ id, rect: { x, y, w, h }, cw: 260, ch: 90 });

test('a target with room on the right gets its callout on the right', () => {
  const r = layoutCallouts([item('a', 100, 200)], vp);
  assert.equal(r.placed.length, 1);
  assert.equal(r.placed[0].side, 'right');
  assert.equal(r.overflow.length, 0);
});

test('a target at the right edge gets its callout on the left, below or above instead', () => {
  const r = layoutCallouts([item('a', 1100, 300)], vp);
  assert.equal(r.placed.length, 1);
  assert.notEqual(r.placed[0].side, 'right');
});

test('callouts never overlap each other or any target, and stay on screen', () => {
  const items = [item('a', 100, 120), item('b', 100, 190), item('c', 100, 260), item('d', 800, 120), item('e', 800, 200), item('f', 500, 400)];
  const r = layoutCallouts(items, vp);
  const cards = r.placed.map((p) => card(p, items.find((i) => i.id === p.id)));
  for (let i = 0; i < cards.length; i++) {
    assert.ok(cards[i].x >= 0 && cards[i].x + cards[i].w <= vp.w, 'inside width');
    assert.ok(cards[i].y >= vp.top && cards[i].y + cards[i].h <= vp.h, 'inside height');
    for (let j = i + 1; j < cards.length; j++) assert.ok(!hit(cards[i], cards[j]), `cards ${i},${j}`);
    for (const it of items) assert.ok(!hit(cards[i], it.rect), `card ${i} covers target ${it.id}`);
  }
  assert.equal(r.placed.length + r.overflow.length, items.length);
});

test('items that cannot fit are returned as overflow, not dropped', () => {
  const items = Array.from({ length: 14 }, (_, i) => item('n' + i, 20 + (i % 7) * 175, 90 + Math.floor(i / 7) * 60, 160, 50));
  const r = layoutCallouts(items, vp);
  assert.equal(r.placed.length + r.overflow.length, 14);
  assert.ok(r.overflow.length > 0);
});

test('pagesFor splits a tall page into scroll stops', () => {
  assert.equal(pagesFor(2900, 800, 70), Math.ceil((2900 - 800) / (800 - 70 - 40)) + 1);
  assert.equal(pagesFor(700, 800, 70), 1);
});

test('every main-page step has a selector list, a short plain sentence and no personal pronouns', () => {
  assert.ok(MAIN_STEPS.length >= 8);
  for (const s of MAIN_STEPS) {
    assert.ok(Array.isArray(s.sel) && s.sel.length >= 1);
    assert.ok(s.text.length > 8 && s.text.length <= 110, s.text);
    assert.ok(!/\b(you|your|she|her|my)\b/i.test(s.text), s.text);
  }
});

test('there is a tour for the main page and each form, all short, plain and impersonal', () => {
  assert.deepEqual(Object.keys(TOURS).sort(), ['activity', 'headache', 'intake', 'main']);
  assert.equal(TOURS.main, MAIN_STEPS);
  for (const [name, steps] of Object.entries(TOURS)) {
    assert.ok(steps.length >= 4, name);
    for (const st of steps) {
      assert.ok(Array.isArray(st.sel) && st.sel.length >= 1, name);
      assert.ok(st.text.length > 8 && st.text.length <= 110, st.text);
      assert.ok(!/\b(you|your|she|her|my)\b/i.test(st.text), st.text);
    }
  }
});

test('callouts avoid obstacles when there is free space, but are still placed when there is not', () => {
  const free = layoutCallouts([item('a', 100, 200)], vp, [{ x: 270, y: 150, w: 300, h: 200 }]);
  assert.equal(free.placed.length, 1);
  assert.ok(!hit({ x: free.placed[0].x, y: free.placed[0].y, w: 260, h: 90 }, { x: 270, y: 150, w: 300, h: 200 }, 0));
  const wall = layoutCallouts([item('a', 100, 200)], vp, [{ x: 0, y: 0, w: 1280, h: 800 }]);
  assert.equal(wall.placed.length, 1);
  assert.equal(wall.overflow.length, 0);
});
