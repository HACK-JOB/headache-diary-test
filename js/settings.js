import { STYLES } from './type-art.js';

// Personal preferences (not health settings). Pure logic, stored in localStorage by app.js.
/** Text sizes. Biggest is the old Normal (20px); the old Large and Largest were too big and are gone. */
export const TEXT_SIZES = [
  { key: 'big', label: 'Biggest', px: 20 },
  { key: 'medium', label: 'Medium', px: 17 },
  { key: 'small', label: 'Small', px: 14 },
];
export const THEMES = { paper: 'Warm paper', bright: 'Bright', dark: 'Calm dark' };
import { validTimes } from './nudges.js';
const LIGHT = ['paper', 'bright'];

export const DEFAULTS = Object.freeze({
  theme: 'paper', lightTheme: 'paper', followSystem: false,
  text: 'big', clock: '12', savedCue: true, artStyle: 'frontOutline', nag: 'normal', chime: true,
  wakeOn: false, wakeAt: '09:00', glucoseOn: false, glucoseTimes: ['07:30'], sitOn: false, sitMins: 60,
});

export function normalise(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const pick = (v, ok, d) => (ok.includes(v) ? v : d);
  return {
    theme: pick(r.theme, Object.keys(THEMES), DEFAULTS.theme),
    lightTheme: pick(r.lightTheme, LIGHT, DEFAULTS.lightTheme),
    followSystem: r.followSystem === true,
    text: pick(r.text, TEXT_SIZES.map((t) => t.key), DEFAULTS.text),
    clock: pick(r.clock, ['12', '24'], DEFAULTS.clock),
    artStyle: pick(r.artStyle, Object.keys(STYLES), DEFAULTS.artStyle),
    savedCue: typeof r.savedCue === 'boolean' ? r.savedCue : DEFAULTS.savedCue,
    nag: pick(r.nag, ['gentle', 'normal', 'persistent'], DEFAULTS.nag),
    chime: typeof r.chime === 'boolean' ? r.chime : DEFAULTS.chime,
    wakeOn: r.wakeOn === true,
    wakeAt: typeof r.wakeAt === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.wakeAt) ? r.wakeAt : DEFAULTS.wakeAt,
    glucoseOn: r.glucoseOn === true,
    glucoseTimes: Array.isArray(r.glucoseTimes) ? validTimes(r.glucoseTimes) : DEFAULTS.glucoseTimes,
    sitOn: r.sitOn === true,
    sitMins: [15, 30, 45, 60, 90, 120].includes(r.sitMins) ? r.sitMins : DEFAULTS.sitMins,
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
