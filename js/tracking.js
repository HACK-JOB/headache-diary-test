// Which logs are tracked. Three levels decide, highest first: Admin, then Doctor, then the user.
// A level can set a log "on" or "off", or leave it "unset" so the next level down decides. Nothing is ever deleted by turning a log off.
import { doctors } from './doctors.js';

export const LOGS = [
  { key: 'water', label: 'Water', what: 'The water card and refills.' },
  { key: 'headache', label: 'Headaches', what: 'The headache card and its form.' },
  { key: 'day', label: 'Day and activities', what: 'WOKE UP, activities, END THE DAY and Today so far.' },
  { key: 'intake', label: 'Food and drink', what: 'Meals, drinks and the Eaten today list.' },
  { key: 'weight', label: 'Weight', what: 'The weight card.' },
  { key: 'glucose', label: 'Blood glucose', what: 'The glucose card and its reminders.' },
  { key: 'meds', label: 'Medicines', what: 'The Medicines card and dose reminders.' },
];
export const LEVELS = [
  { key: 'admin', label: 'Admin' },
  { key: 'doctor', label: 'Doctor' },
  { key: 'user', label: 'User' },
];
const LOGKEYS = new Set(LOGS.map((l) => l.key));
const VALUES = ['on', 'off', 'unset'];

/** An entry for the diary log. Only Admin and Doctor settings live there; the user's choices live in settings. */
export function trackEvent(level, log, value, by) {
  if (!LOGKEYS.has(log) || !VALUES.includes(value)) return null;
  if (level === 'admin') return { type: 'config', kind: 'track', level: 'admin', log, value };
  if (level === 'doctor') return { type: 'clinical', kind: 'track', level: 'doctor', log, value, by };
  return null;
}

/** The latest Admin or Doctor setting for a log, or null if none or "unset". */
export function setting(events, level, log) {
  let last = null;
  for (const e of events) {
    if (e.deleted || e.kind !== 'track' || e.level !== level || e.log !== log) continue;
    if (!last || e.ms >= last.ms) last = e;
  }
  return last && last.value !== 'unset' ? { value: last.value, by: last.by, ms: last.ms } : null;
}

const doctorName = (events, id) => {
  if (id === 'open' || id === 'setup') return 'Doctors tab';   // set while no doctor was signed in (the tab is open until a PIN exists)
  const d = doctors(events).find((x) => x.id === id);
  if (d) return `${d.name} (${d.role})`;
  let name = null;
  for (const e of events) if (!e.deleted && e.type === 'doctor' && e.kind === 'add' && e.doctorId === id) name = `${String(e.name).trim()} (${String(e.role).trim()})`;
  return name ?? 'A doctor';
};

/** Is this log tracked, who decided, and who has it locked (highest first). `user` is settings.track. */
export function resolve(events, user, log) {
  const locks = [];
  const a = setting(events, 'admin', log);
  if (a) locks.push({ level: 'admin', label: 'Admin', name: 'Admin', value: a.value });
  const d = setting(events, 'doctor', log);
  if (d) locks.push({ level: 'doctor', label: 'Doctor', name: doctorName(events, d.by), value: d.value });
  const u = user?.[log];
  const top = locks[0];
  if (top) return { tracked: top.value === 'on', source: top.level, locks };
  if (u === 'on' || u === 'off') return { tracked: u === 'on', source: 'user', locks };
  return { tracked: true, source: 'default', locks };
}

export const trackedMap = (events, user) => Object.fromEntries(LOGS.map((l) => [l.key, resolve(events, user, l.key).tracked]));
export const userCanChange = (r) => r.locks.length === 0;

/** "Locked by Admin: on. Also set by Dr Lee (GP): off, which Admin overrides." Empty when nobody has it locked. */
export function lockMessage(r) {
  if (!r.locks.length) return '';
  const [first, ...rest] = r.locks;
  let t = `Locked by ${first.name}: ${first.value}.`;
  for (const o of rest) t += ` Also set by ${o.name}: ${o.value}${o.value !== first.value ? `, which ${first.name} overrides` : ''}.`;
  return t;
}
