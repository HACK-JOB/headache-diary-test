import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalise, activeTheme, toggleDark, chooseTheme, TEXT_SIZES } from '../js/settings.js';

test('defaults are warm paper, biggest text, 12 hour clock, saved cue on', () => {
  assert.equal(DEFAULTS.theme, 'paper');
  assert.equal(DEFAULTS.text, 'big');
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


test('head picture style defaults to the front outline and survives normalise', () => {
  assert.equal(DEFAULTS.artStyle, 'frontOutline');
  assert.equal(normalise({ artStyle: 'frontHeat' }).artStyle, 'frontHeat');
  assert.equal(normalise({ artStyle: 'neon' }).artStyle, 'frontOutline');
  assert.equal(normalise(null).artStyle, 'frontOutline');
});

test('text sizes: Biggest (the old Normal), Medium and Small; old saved sizes map to Biggest', () => {
  assert.deepEqual(TEXT_SIZES.map((t) => t.key), ['big', 'medium', 'small']);
  assert.deepEqual(TEXT_SIZES.map((t) => t.label), ['Biggest', 'Medium', 'Small']);
  assert.equal(normalise({ text: 'medium' }).text, 'medium');
  assert.equal(normalise({ text: 'small' }).text, 'small');
  for (const old of ['normal', 'large', 'largest']) assert.equal(normalise({ text: old }).text, 'big', old);
  assert.equal(normalise({ text: 'huge' }).text, 'big');
  assert.ok(TEXT_SIZES[0].px > TEXT_SIZES[1].px && TEXT_SIZES[1].px > TEXT_SIZES[2].px);
  assert.equal(TEXT_SIZES[0].px, 20);          // the old Normal size is now the biggest
});

import { LIGHT_THEMES, DARK_THEMES, isDark } from '../js/settings.js';
test('a remembered dark theme: default is Calm dark, junk is repaired', () => {
  assert.equal(DEFAULTS.darkTheme, 'dark');
  assert.equal(normalise({ darkTheme: 'graphite' }).darkTheme, 'graphite');
  assert.equal(normalise({ darkTheme: 'paper' }).darkTheme, 'dark');          // a light theme is not a dark one
  assert.equal(normalise({ darkTheme: 'neon' }).darkTheme, 'dark');
  assert.equal(normalise({ lightTheme: 'mist' }).lightTheme, 'mist');
  assert.equal(normalise({ lightTheme: 'graphite' }).lightTheme, 'paper');
  assert.equal(normalise({ theme: 'graphite' }).theme, 'graphite');
});

test('toggleDark goes to the remembered dark theme and back to the remembered light one', () => {
  const s = { ...DEFAULTS, theme: 'mist', lightTheme: 'mist', darkTheme: 'graphite' };
  const on = toggleDark(s, false);
  assert.equal(on.theme, 'graphite');
  assert.equal(on.lightTheme, 'mist');
  assert.equal(toggleDark(on, false).theme, 'mist');
  const from = toggleDark({ ...DEFAULTS, theme: 'ember', lightTheme: 'bright', darkTheme: 'ember' }, false);
  assert.equal(from.theme, 'bright');
});

test('choosing a theme sets the pick for its own group; the screen only changes if that group is showing', () => {
  const inDark = chooseTheme({ ...DEFAULTS, theme: 'dark' }, 'mist');          // showing dark, picks a light one
  assert.equal(inDark.lightTheme, 'mist'); assert.equal(inDark.theme, 'dark'); assert.equal(inDark.darkTheme, 'dark');
  const inLight = chooseTheme({ ...DEFAULTS }, 'ember');                        // showing light, picks a dark one
  assert.equal(inLight.darkTheme, 'ember'); assert.equal(inLight.theme, 'paper'); assert.equal(inLight.lightTheme, 'paper');
  const same = chooseTheme({ ...DEFAULTS, theme: 'paper' }, 'bright');          // light on screen, picks another light
  assert.equal(same.theme, 'bright'); assert.equal(same.lightTheme, 'bright');
  const sameDark = chooseTheme({ ...DEFAULTS, theme: 'dark' }, 'graphite');
  assert.equal(sameDark.theme, 'graphite'); assert.equal(sameDark.darkTheme, 'graphite');
  assert.equal(chooseTheme(DEFAULTS, 'neon'), DEFAULTS);
});

test('with "follow the device" on, picking only sets the pair; the device decides which shows', () => {
  const s = chooseTheme({ ...DEFAULTS, followSystem: true }, 'graphite');
  assert.equal(s.darkTheme, 'graphite');
  assert.equal(activeTheme(s, true), 'graphite');
  assert.equal(activeTheme(s, false), 'paper');
});

test('following the tablet uses the remembered dark and light themes', () => {
  const s = { ...DEFAULTS, followSystem: true, lightTheme: 'mist', darkTheme: 'graphite' };
  assert.equal(activeTheme(s, true), 'graphite');
  assert.equal(activeTheme(s, false), 'mist');
  assert.equal(toggleDark(s, true).theme, 'mist');                                // tablet is dark: toggling goes to the light theme
});
