// Measures: body weight (once a day after WOKE UP) and finger-prick blood glucose (mmol/L).
//   { type:'measure', kind:'weight', kg }        { type:'measure', kind:'weight-skip' }
//   { type:'measure', kind:'glucose', mmol, tag: 'fasting'|'before'|'after'|null }
//   { type:'config',  kind:'weight-shown', shown }   whether HER screens show today's weight back to her
// The app only records and displays. It gives no advice about either number.
import { dayKey } from './time.js';
import { byTime } from './events.js';
import { statusFor, STATUS_MARK } from './doctors.js';

export const WEIGHT_CHECK_KG = 3;       // a jump this big from her recent readings asks "is that right?" again
export const GLUCOSE_TAGS = [
  { key: 'fasting', label: 'Fasting' },
  { key: 'before', label: 'Before a meal' },
  { key: 'after', label: 'After a meal' },
];
const live = (events, type) => events.filter((e) => e.type === type && !e.deleted).sort(byTime);
const toNum = (text) => {
  const t = String(text ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};

export function validateWeight(text) {
  const v = toNum(text);
  if (v === null || Number.isNaN(v) || v < 20 || v > 400) return { errors: ['kg'], kg: null };
  return { errors: [], kg: Math.round(v * 10) / 10 };
}

export function validateGlucose(text, tag) {
  const errors = [];
  const v = toNum(text);
  let mmol = null;
  if (v === null || Number.isNaN(v) || v < 0.5 || v > 40) errors.push('mmol'); else mmol = Math.round(v * 10) / 10;
  if (tag != null && !GLUCOSE_TAGS.some((t) => t.key === tag)) errors.push('tag');
  return { errors, mmol, tag: tag ?? null };
}

const measures = (events, kind) => live(events, 'measure').filter((e) => e.kind === kind);

/** Latest weight per day, oldest first. */
export function weightsByDay(events) {
  const byDay = new Map();
  for (const e of measures(events, 'weight')) byDay.set(dayKey(e.ms), { key: dayKey(e.ms), kg: e.kg, ms: e.ms });
  return [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function weightToday(events, key) {
  const list = measures(events, 'weight').filter((e) => dayKey(e.ms) === key);
  return list.length ? list[list.length - 1] : null;
}

/** She is asked once a day, only after WOKE UP, and a skip counts as an answer. */
export function needsWeight(events, key) {
  const woke = live(events, 'day').some((e) => e.kind === 'wake' && dayKey(e.ms) === key);
  if (!woke) return false;
  const answered = live(events, 'measure').some((e) => (e.kind === 'weight' || e.kind === 'weight-skip') && dayKey(e.ms) === key);
  return !answered;
}

/** Ask her to re-check a number far from her last few readings. Never says what the trend is. */
export function weightNeedsCheck(events, kg, key) {
  const prior = weightsByDay(events).filter((x) => x.key < key).slice(-3);
  if (prior.length < 2) return false;
  const avg = prior.reduce((s, x) => s + x.kg, 0) / prior.length;
  return Math.abs(kg - avg) > WEIGHT_CHECK_KG;
}

const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Rolling 7 days ending on `key`. The number of days that had a reading is always returned. */
export function weightAverage(events, key) {
  const from = addDays(key, -6);
  const days = weightsByDay(events).filter((x) => x.key >= from && x.key <= key);
  if (!days.length) return { average: null, count: 0, from, to: key };
  const average = Math.round((days.reduce((s, x) => s + x.kg, 0) / days.length) * 10) / 10;
  return { average, count: days.length, from, to: key };
}

export function glucoseToday(events, key) {
  return measures(events, 'glucose').filter((e) => dayKey(e.ms) === key).reverse();
}

/** A single reading against the doctor's range. Unlike totals, a reading is always a finished value. */
export function glucoseStatus(mmol, target) {
  const r = statusFor(mmol, target, { running: false });
  return { ...r, mark: STATUS_MARK[r.status] };
}

export const weightShownEvent = (shown) => ({ kind: 'weight-shown', shown: !!shown });
export function weightShown(events) {
  let on = true;
  for (const e of live(events, 'config')) if (e.kind === 'weight-shown') on = !!e.shown;
  return on;
}
