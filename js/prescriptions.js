// Prescriptions: doctor-written schedules, and her Taken / Skipped answers.
//   { type:'clinical', kind:'rx', rxId, status:'active'|'paused'|'ended', name, dose, food, days:'daily'|[0..6], slots:[{start,end,at}], instructions, nag:''|gentle|normal|persistent, by }
//   { type:'dose', rxId, slot, forDay, action:'taken'|'skipped' }       (her answer; ms = the real time she answered)
// Every medicine, dose and word here is written by a named doctor. The app never suggests or changes any of it.
import { dayKey, formatTime } from './time.js';
import { byTime } from './events.js';

export const NAGS = {
  gentle: { label: 'Gentle', repeats: 0, gapMin: 0 },
  normal: { label: 'Normal', repeats: 3, gapMin: 10 },
  persistent: { label: 'Persistent', repeats: Infinity, gapMin: 5 },
};
export const FOOD = [
  { key: '', label: 'No food instruction' },
  { key: 'before', label: 'Take before food' },
  { key: 'with', label: 'Take with food' },
  { key: 'after', label: 'Take after food' },
];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const RX_INSTR_MAX = 400;
export const RX_NAME_MAX = 60;
export const MAX_SLOTS = 4;
const DAY_MS = 86400000;
const live = (events, type) => events.filter((e) => e.type === type && !e.deleted).sort(byTime);

const hhmm = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v ?? '')) ? String(v) : null);
const mins = (v) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };

/** Sunday = 0, for a Brisbane calendar day string. */
export function weekdayOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function validateRx(f) {
  const errors = [];
  const name = String(f?.name ?? '').trim();
  const dose = String(f?.dose ?? '').trim();
  const instructions = String(f?.instructions ?? '').trim();
  if (!name || name.length > RX_NAME_MAX) errors.push('name');
  if (!dose || dose.length > RX_NAME_MAX) errors.push('dose');
  if (instructions.length > RX_INSTR_MAX) errors.push('instructions');
  const food = String(f?.food ?? '');
  if (!FOOD.some((x) => x.key === food)) errors.push('food');
  const nag = String(f?.nag ?? '');
  if (nag !== '' && !NAGS[nag]) errors.push('nag');
  let days = f?.days;
  if (days !== 'daily') {
    days = [...new Set((Array.isArray(days) ? days : []).map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6).sort((a, b) => a - b);
    if (!days.length) errors.push('days');
  }
  const raw = Array.isArray(f?.slots) ? f.slots : [];
  let slots = raw.map((s) => (s?.mode === 'exact' ? { mode: 'exact', at: hhmm(s.at) } : s?.mode === 'range' ? { mode: 'range', start: hhmm(s.start), end: hhmm(s.end) } : { mode: null }));
  const lo = (s) => mins(s.mode === 'exact' ? s.at : s.start);
  const hi = (s) => mins(s.mode === 'exact' ? s.at : s.end);
  let slotOk = slots.length >= 1 && slots.length <= MAX_SLOTS && slots.every((s) => (s.mode === 'exact' ? !!s.at : s.mode === 'range' && s.start && s.end && mins(s.start) < mins(s.end)));
  if (slotOk) {
    slots = slots.sort((a, b) => lo(a) - lo(b));
    for (let i = 1; i < slots.length; i++) if (lo(slots[i]) <= hi(slots[i - 1])) slotOk = false;
  }
  if (!slotOk) errors.push('slots');
  return { errors, value: { name, dose, food, days, slots: slotOk ? slots : [], instructions, nag } };
}

/** The latest saved version of each prescription. Earlier versions stay in the log. */
export function prescriptions(events) {
  const map = new Map();
  const firstMs = new Map();
  for (const e of live(events, 'clinical')) {
    if (e.kind !== 'rx') continue;
    if (!firstMs.has(e.rxId)) firstMs.set(e.rxId, e.ms);
    map.set(e.rxId, { rxId: e.rxId, status: e.status ?? 'active', name: e.name, dose: e.dose, food: e.food ?? '', days: e.days, slots: (e.slots ?? []).map((s) => (s.mode ? s : { mode: 'range', start: s.start, end: s.end })),
      instructions: e.instructions ?? '', nag: e.nag ?? '', by: e.by, ms: e.ms, startedMs: firstMs.get(e.rxId) });
  }
  return [...map.values()];
}

const msAt = (key, t) => { const [y, mo, d] = key.split('-').map(Number); const [h, m] = t.split(':').map(Number); return Date.UTC(y, mo - 1, d, h - 10, m); };

/** Her answers for a day, newest wins, keyed "rxId#slot". */
function answers(events, key) {
  const out = new Map();
  for (const e of live(events, 'dose')) if (e.forDay === key) out.set(`${e.rxId}#${e.slot}`, e);
  return out;
}

/** Every dose due on a day for active prescriptions, in time order, with its state at `now`. */
export function dosesFor(events, key, now) {
  const ans = answers(events, key);
  const wd = weekdayOf(key);
  const out = [];
  for (const p of prescriptions(events)) {
    if (p.status !== 'active') continue;
    if (p.days !== 'daily' && !p.days.includes(wd)) continue;
    if (key < dayKey(p.startedMs)) continue;
    p.slots.forEach((s, i) => {
      const exact = s.mode === 'exact';
      const startMs = msAt(key, exact ? s.at : s.start);
      let endMs;
      if (exact) {
        // an exact time stays open for an hour, but never runs into the next time, and never past 11:59 pm
        const nxt = p.slots[i + 1];
        const nextStart = nxt ? msAt(key, nxt.mode === 'exact' ? nxt.at : nxt.start) - 60000 : Infinity;
        endMs = Math.min(startMs + 3600000, nextStart, msAt(key, '23:59'));
      } else endMs = msAt(key, s.end);
      const a = ans.get(`${p.rxId}#${i}`);
      let state;
      if (a) state = a.action === 'skipped' ? 'skipped' : (a.ms > endMs + 59999 ? 'late' : 'taken');
      else if (now < startMs) state = 'upcoming';
      else if (now <= endMs + 59999) state = 'due';
      else state = 'overdue';
      out.push({ rxId: p.rxId, slot: i, name: p.name, dose: p.dose, food: p.food, instructions: p.instructions, nag: p.nag, by: p.by,
        mode: s.mode, start: s.start ?? null, end: s.end ?? null, at: s.at ?? null, startMs, endMs, atMs: startMs, state, answeredMs: a ? a.ms : null, forDay: key });
    });
  }
  return out.sort((x, y) => x.atMs - y.atMs || x.name.localeCompare(y.name));
}

/** The level a prescription's reminders use: the doctor's fixed level if set, otherwise hers. */
export function effectiveNag(rx, her) {
  if (rx?.nag && NAGS[rx.nag]) return rx.nag;
  return NAGS[her] ? her : 'normal';
}

const daysText = (days) => (days === 'daily' ? 'Every day' : days.map((d) => WEEKDAYS[d]).join(', '));
export function describeRx(rx, clock = '12') {
  const t = (v) => { const [h, m] = v.split(':').map(Number); return formatTime(Date.UTC(2026, 0, 1, h - 10, m), clock); };
  return `${daysText(rx.days)} · ${rx.slots.map((s) => slotText(s, clock)).join(', ')}`;
}

/** A time exactly as the doctor gave it: "8:00 am" for an exact time, "7:00 am to 9:00 am" for a range. */
export function slotText(s, clock = '12') {
  const t = (v) => { const [h, m] = v.split(':').map(Number); return formatTime(Date.UTC(2026, 0, 1, h - 10, m), clock); };
  return s.mode === 'exact' ? t(s.at) : `${t(s.start)} to ${t(s.end)}`;
}

const nagText = (n) => (n ? NAGS[n].label : "user's own setting");
const fields = [
  ['dose', 'dose', (r) => r.dose], ['food', 'food instruction', (r) => FOOD.find((f) => f.key === r.food)?.label ?? ''],
  ['days', 'days', (r) => daysText(r.days)], ['slots', 'times', (r) => r.slots.map((s) => (s.mode === 'exact' ? s.at : `${s.start}-${s.end}`)).join(', ')],
  ['instructions', 'instructions', (r) => (r.instructions ? 'written' : 'none')], ['nag', 'reminder level', (r) => nagText(r.nag)],
];
export function rxChanges(a, b) {
  const out = [];
  for (const [key, what, show] of fields) {
    if (key === 'instructions') {
      const x = String(a.instructions ?? '').trim(); const y = String(b.instructions ?? '').trim();
      if (x !== y) out.push({ what, from: x ? 'written' : 'none', to: !y ? 'cleared' : x ? 'changed' : 'written' });
      continue;
    }
    const from = show(a); const to = show(b);
    if (from !== to) out.push({ what, from, to });
  }
  return out;
}

/** For doctors: how each prescription went between two days (from inclusive, to exclusive). A gap is "not recorded", never "skipped". */
export function doseSummary(events, fromKey, toKey, now) {
  const rows = new Map();
  let ms = msAt(fromKey, '00:00');
  const stop = msAt(toKey, '00:00');
  for (; ms < stop; ms += DAY_MS) {
    const key = dayKey(ms + 3600000);
    for (const d of dosesFor(events, key, now)) {
      const r = rows.get(d.rxId) ?? { rxId: d.rxId, name: d.name, onTime: 0, late: 0, skipped: 0, notRecorded: 0, total: 0 };
      r.total += 1;
      if (d.state === 'taken') r.onTime += 1;
      else if (d.state === 'late') r.late += 1;
      else if (d.state === 'skipped') r.skipped += 1;
      else if (d.state === 'overdue') r.notRecorded += 1;
      rows.set(d.rxId, r);
    }
  }
  return [...rows.values()];
}
