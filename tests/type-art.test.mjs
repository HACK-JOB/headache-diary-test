import test from 'node:test';
import assert from 'node:assert/strict';
import { typeArtMarkup, ART_KEYS } from '../js/type-art.js';
import { TYPES } from '../js/episodes.js';

test('there is original artwork for every headache type except Other', () => {
  const want = Object.keys(TYPES).filter((k) => k !== 'other');
  assert.deepEqual([...ART_KEYS].sort(), want.sort());
});

test('artwork is self-contained: no external links, images, scripts or fonts', () => {
  for (const k of ART_KEYS) {
    const svg = typeArtMarkup(k);
    assert.ok(svg.startsWith('<svg'), k);
    assert.ok(!/https?:|href=|<image|<script|font-family|@import|url\((?!#)/i.test(svg.replace('xmlns="http://www.w3.org/2000/svg"', '')), k);
  }
});

test('artwork takes its colours from the theme, so it follows dark mode', () => {
  for (const k of ART_KEYS) {
    const svg = typeArtMarkup(k);
    assert.ok(svg.includes('var(--head-fill)') && svg.includes('var(--pain)'), k);
    assert.ok(!/#[0-9a-f]{3,6}\b/i.test(svg), `${k} has a hard-coded colour`);
  }
});

test('each type marks pain somewhere different', () => {
  const pains = ART_KEYS.map((k) => (typeArtMarkup(k).match(/<g class="pain"[^>]*>[\s\S]*?<\/g>/) || [''])[0]);
  assert.equal(new Set(pains).size, ART_KEYS.length);
  assert.ok(pains.every((p) => p.length > 20));
});

test('unknown type gives nothing rather than crashing', () => {
  assert.equal(typeArtMarkup('bogus'), '');
});

import { STYLES } from '../js/type-art.js';

test('three styles exist and each works for every type with theme colours only', () => {
  assert.deepEqual(Object.keys(STYLES), ['line', 'solid', 'soft']);
  for (const st of Object.keys(STYLES)) for (const k of ART_KEYS) {
    const svg = typeArtMarkup(k, st);
    assert.ok(svg.includes(`art-${st}`), `${st}/${k}`);
    assert.ok(!/#[0-9a-f]{3,6}\b/i.test(svg.replace(/url\(#[^)]*\)/g, '')), `${st}/${k} hard-coded colour`);
    assert.ok(!/https?:|href=|<image|<script/i.test(svg.replace('xmlns="http://www.w3.org/2000/svg"', '')), `${st}/${k}`);
  }
});

test('an unknown style falls back to the line style', () => {
  assert.ok(typeArtMarkup('cluster', 'bogus').includes('art-line'));
});

test('the pain placements are identical in every style', () => {
  const pain = (svg) => svg.match(/<g class="pain"[^>]*>([\s\S]*?)<\/g>/)[1];
  for (const k of ART_KEYS) {
    assert.equal(pain(typeArtMarkup(k, 'solid')), pain(typeArtMarkup(k, 'line')));
    assert.equal(pain(typeArtMarkup(k, 'soft')), pain(typeArtMarkup(k, 'line')));
  }
});

test('every style rule is scoped to its own svg so styles cannot leak between pictures', () => {
  for (const st of Object.keys(STYLES)) {
    const css = typeArtMarkup('cluster', st).match(/<style>([\s\S]*?)<\/style>/)[1];
    const rules = css.split('\n').map((l) => l.trim()).filter(Boolean);
    assert.ok(rules.length >= 5, st);
    for (const r of rules) assert.ok(r.startsWith(`.art-${st} `), `${st}: unscoped rule: ${r}`);
  }
});
