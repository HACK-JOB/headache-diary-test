// Personal preferences (not health settings). Pure logic, stored in localStorage by app.js.
export const THEMES = { paper: 'Warm paper', bright: 'Bright', dark: 'Calm dark' };
const LIGHT = ['paper', 'bright'];

export const DEFAULTS = Object.freeze({
  theme: 'paper', lightTheme: 'paper', followSystem: false,
  text: 'normal', clock: '12', savedCue: true,
});

export function normalise(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const pick = (v, ok, d) => (ok.includes(v) ? v : d);
  return {
    theme: pick(r.theme, Object.keys(THEMES), DEFAULTS.theme),
    lightTheme: pick(r.lightTheme, LIGHT, DEFAULTS.lightTheme),
    followSystem: r.followSystem === true,
    text: pick(r.text, ['normal', 'large', 'largest'], DEFAULTS.text),
    clock: pick(r.clock, ['12', '24'], DEFAULTS.clock),
    savedCue: typeof r.savedCue === 'boolean' ? r.savedCue : DEFAULTS.savedCue,
  };
}

/** The theme actually shown right now. */
export function activeTheme(s, systemPrefersDark) {
  if (s.followSystem) return systemPrefersDark ? 'dark' : s.lightTheme;
  return s.theme;
}

/** One-tap dark/light switch. Taking manual control turns off "follow the tablet". */
export function toggleDark(s, systemPrefersDark) {
  const showing = activeTheme(s, systemPrefersDark);
  if (showing === 'dark') return { ...s, followSystem: false, theme: s.lightTheme };
  return { ...s, followSystem: false, theme: 'dark', lightTheme: LIGHT.includes(showing) ? showing : s.lightTheme };
}
