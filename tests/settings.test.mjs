import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalise, activeTheme, toggleDark } from '../js/settings.js';

test('defaults are warm paper, normal text, 12 hour clock, saved cue on', () => {
  assert.equal(DEFAULTS.theme, 'paper');
  assert.equal(DEFAULTS.text, 'normal');
  assert.equal(DEFAULTS.clock, '12');
  assert.equal(DEFAULTS.savedCue, true);
  assert.equal(DEFAULTS.followSystem, false);
});

test('normalise fills gaps and throws away unknown values', () => {
  const s = normalise({ theme: 'neon', text: 'huge', clock: '99', savedCue: 'yes', junk: 1 });
  assert.deepEqual(s, DEFAULTS);
  assert.equal(normalise(null).theme, 'paper');
  assert.equal(normalise({ theme: 'dark', lightTheme: 'bright' }).lightTheme, 'bright');
});

test('activeTheme uses the chosen theme when not following the tablet', () => {
  assert.equal(activeTheme({ ...DEFAULTS, theme: 'bright' }, true), 'bright');
});

test('activeTheme follows the tablet only when switched on', () => {
  const on = { ...DEFAULTS, theme: 'bright', lightTheme: 'bright', followSystem: true };
  assert.equal(activeTheme(on, true), 'dark');
  assert.equal(activeTheme(on, false), 'bright');
});

test('toggleDark flips to dark and remembers the light theme', () => {
  const s = toggleDark({ ...DEFAULTS, theme: 'bright', lightTheme: 'bright' }, false);
  assert.equal(s.theme, 'dark');
  assert.equal(s.lightTheme, 'bright');
});

test('toggleDark flips back to the remembered light theme', () => {
  const s = toggleDark({ ...DEFAULTS, theme: 'dark', lightTheme: 'bright' }, false);
  assert.equal(s.theme, 'bright');
});

test('toggleDark while following the tablet takes manual control', () => {
  const s = toggleDark({ ...DEFAULTS, followSystem: true }, true); // tablet is dark now
  assert.equal(s.followSystem, false);
  assert.equal(s.theme, 'paper'); // toggled away from dark
});
