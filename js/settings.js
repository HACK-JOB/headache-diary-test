import { STYLES } from './type-art.js';

// Personal preferences (not health settings). Pure logic, stored in localStorage by app.js.
/** Text sizes. Biggest is the old Normal (20px); the old Large and Largest were too big and are gone. */
export const TEXT_SIZES = [
  { key: 'big', label: 'Biggest', px: 20 },
  { key: 'medium', label: 'Medium', px: 17 },
  { key: 'small', label: 'Small', px: 14 },
];
export const THEMES = {
  paper: 'Warm paper', bright: 'Bright', mist: 'Soft grey',
  dark: 'Calm dark', graphite: 'Black and grey', ember: 'Warm dark',
};
export const LIGHT_THEMES = ['paper', 'bright', 'mist'];
export const DARK_THEMES = ['dark', 'graphite', 'ember'];
export const isDark = (key) => DARK_THEMES.includes(key);
import { validTimes } from './nudges.js';
const LIGHT = LIGHT_THEMES;
const TRACK_KEYS = ['water', 'headache', 'day', 'intake', 'weight', 'glucose', 'meds'];

export const DEFAULTS = Object.freeze({
  theme: 'paper', lightTheme: 'paper', darkTheme: 'dark', followSystem: false,
  text: 'big', clock: '12', savedCue: true, artStyle: 'frontOutline', nag: 'normal', chime: true,
  track: {},
  wakeOn: false, wakeAt: '09:00', glucoseOn: false, glucoseTimes: ['07:30'], sitOn: false, sitMins: 60,
});

export function normalise(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const pick = (v, ok, d) => (ok.includes(v) ? v : d);
  return {
    theme: pick(r.theme, Object.keys(THEMES), DEFAULTS.theme),
    lightTheme: pick(r.lightTheme, LIGHT, DEFAULTS.lightTheme),
    darkTheme: pick(r.darkTheme, DARK_THEMES, DEFAULTS.darkTheme),
    followSystem: r.followSystem === true,
    text: pick(r.text, TEXT_SIZES.map((t) => t.key), DEFAULTS.text),
    clock: pick(r.clock, ['12', '24'], DEFAULTS.clock),
    artStyle: pick(r.artStyle, Object.keys(STYLES), DEFAULTS.artStyle),
    savedCue: typeof r.savedCue === 'boolean' ? r.savedCue : DEFAULTS.savedCue,
    nag: pick(r.nag, ['gentle', 'normal', 'persistent'], DEFAULTS.nag),
    chime: typeof r.chime === 'boolean' ? r.chime : DEFAULTS.chime,
    track: Object.fromEntries(Object.entries(r.track && typeof r.track === 'object' ? r.track : {}).filter(([k, v]) => TRACK_KEYS.includes(k) && (v === 'on' || v === 'off'))),
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
  if (s.followSystem) return systemPrefersDark ? s.darkTheme : s.lightTheme;
  return s.theme;
}

/** One-tap dark/light switch. Goes to the dark or light theme last used. Taking manual control turns off "follow the tablet". */
export function toggleDark(s, systemPrefersDark) {
  const showing = activeTheme(s, systemPrefersDark);
  if (isDark(showing)) return { ...s, followSystem: false, theme: s.lightTheme, darkTheme: showing };
  return { ...s, followSystem: false, theme: s.darkTheme, lightTheme: LIGHT.includes(showing) ? showing : s.lightTheme };
}

/** Pick a theme from the colour list. It is remembered in its own group (light or dark) for the moon/sun button. */
export function chooseTheme(s, key) {
  if (!THEMES[key]) return s;
  return isDark(key) ? { ...s, theme: key, darkTheme: key } : { ...s, theme: key, lightTheme: key };
}
