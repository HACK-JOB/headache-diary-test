import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES, LIGHT_THEMES, DARK_THEMES, isDark } from '../js/settings.js';

const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');

/** Variables of one theme, read from css/app.css. Paper is also the :root default. */
function vars(key) {
  const re = key === 'paper' ? /:root, html\[data-theme="paper"\] \{([^}]*)\}/ : new RegExp(`html\\[data-theme="${key}"\\] \\{([^}]*)\\}`);
  const m = re.exec(css);
  assert.ok(m, `no colour block for ${key}`);
  return Object.fromEntries([...m[1].matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
}
const rgb = (hex) => { const h = hex.replace('#', ''); const f = h.length === 3 ? h.replace(/./g, '$&$&') : h; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('every theme is named, and sorted into light or dark', () => {
  assert.deepEqual(Object.keys(THEMES).sort(), [...LIGHT_THEMES, ...DARK_THEMES].sort());
  assert.ok(LIGHT_THEMES.length >= 3 && DARK_THEMES.length >= 3);
  for (const k of LIGHT_THEMES) assert.equal(isDark(k), false);
  for (const k of DARK_THEMES) assert.equal(isDark(k), true);
  assert.equal(isDark('nope'), false);
});

test('every theme defines exactly the same colour variables as Warm paper', () => {
  const base = Object.keys(vars('paper')).filter((k) => !['radius', 'gap'].includes(k));
  for (const k of Object.keys(THEMES)) {
    const have = Object.keys(vars(k));
    // dark themes may add --alert-text (the lighter text colour of the alert red)
    const missing = base.filter((v) => !have.includes(v));
    assert.deepEqual(missing, [], `${k} is missing ${missing.join(', ')}`);
  }
});

const PAIRS = [
  ['ink', 'bg'], ['ink', 'card'], ['ink', 'field'], ['muted', 'bg'], ['muted', 'card'],
  ['on-teal', 'teal'], ['teal-dark', 'teal-soft'], ['ink', 'teal-soft'],
  ['on-red', 'red'], ['on-alert', 'alert'], ['on-amber', 'amber'],
  ['was-ink', 'was-bg'], ['changed-ink', 'changed-bg'], ['update-ink', 'update-bg'], ['toast-ink', 'toast-bg'],
];
test('every theme keeps 4.5:1 contrast on every text and background pair', () => {
  for (const k of Object.keys(THEMES)) {
    const v = vars(k);
    for (const [fg, bg] of PAIRS) {
      if (!v[fg] || !v[bg]) continue;
      assert.ok(ratio(v[fg], v[bg]) >= 4.5, `${k}: ${fg} on ${bg} is ${ratio(v[fg], v[bg]).toFixed(2)}`);
    }
    // Alert text sits on cards (.active-card h2); error text (--red) sits on the page and on cards. Dark themes use a lighter --alert-text for both.
    const onCard = v['alert-text'] ?? v.alert, onPage = v['alert-text'] ?? v.red;
    assert.ok(ratio(onCard, v.card) >= 4.5, `${k}: alert text on card is ${ratio(onCard, v.card).toFixed(2)}`);
    assert.ok(ratio(onPage, v.bg) >= 4.5, `${k}: error text on bg is ${ratio(onPage, v.bg).toFixed(2)}`);
    assert.ok(ratio(onPage, v.card) >= 4.5, `${k}: error text on card is ${ratio(onPage, v.card).toFixed(2)}`);
    assert.ok(ratio(v.teal, v.bg) >= 3, `${k}: the accent outline on bg is ${ratio(v.teal, v.bg).toFixed(2)}`);
    assert.ok(ratio(v.teal, v.card) >= 3, `${k}: the accent outline on card is ${ratio(v.teal, v.card).toFixed(2)}`);
    assert.ok(ratio(v.line, v.bg) >= 1.15, `${k}: card lines are invisible against bg`);
  }
});

test('the black-and-grey dark theme is neutral: no colour cast in its backgrounds and text', () => {
  const v = vars('graphite');
  for (const k of ['bg', 'card', 'ink', 'muted', 'field', 'line']) {
    const [r, g, b] = rgb(v[k]);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 6, `${k} ${v[k]} is not grey`);
  }
  assert.ok(lum(rgb(v.bg)) < 0.02);
});

test('each theme has a colour-scheme, a swatch and a browser bar colour', () => {
  for (const k of Object.keys(THEMES)) {
    assert.match(css, new RegExp(`\\.swatch\\[data-t="${k}"\\] i`), `${k} swatch`);
    if (isDark(k)) assert.match(css, new RegExp(`html\\[data-theme="${k}"\\]`), `${k} colour-scheme`);
  }
  assert.match(css, /color-scheme: dark/);
});
