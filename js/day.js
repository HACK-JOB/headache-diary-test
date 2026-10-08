// Day flow: WOKE UP -> START ACTIVITY -> CHANGE ACTIVITY -> END THE DAY. All derived from the event log.
//   { type: 'day', kind: 'wake' | 'end' }                     wake / bedtime marks
//   { type: 'activity', activity, location, position }        the thing she is doing from `ms` until the next change
// Nothing is guessed: a missing WOKE UP or END THE DAY is simply left out, never flagged.
import { dayKey } from './time.js';
import { canonical } from './memory.js';
import { byTime } from './events.js';

const OFFSET_MS = 10 * 3600 * 1000;
const DAY_MS = 86400000;
const live = (events) => events.filter((e) => !e.deleted && (e.type === 'day' || e.type === 'activity')).sort(byTime);
const startOfDay = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) - OFFSET_MS; };

/** 'asleep' (show WOKE UP), 'awake' (show START ACTIVITY), 'active' (show CHANGE ACTIVITY + END THE DAY). */
export function dayPhase(events) {
  const list = live(events);
  const last = list[list.length - 1];
  if (!last) return 'asleep';
  if (last.type === 'activity') return 'active';
  return last.kind === 'wake' ? 'awake' : 'asleep';
}

/** The activity still running right now, or null. */
export function openActivity(events) {
  const list = live(events);
  const last = list[list.length - 1];
  return last?.type === 'activity' ? last : null;
}

/**
 * One calendar day (Brisbane) as time segments. An activity runs until the next activity, an END THE DAY,
 * the next WOKE UP, or midnight. A stretch that began on an earlier day is shown as carried in.
 */
export function buildDay(events, key, now = Date.now()) {
  const list = live(events);
  const from = startOfDay(key);
  const to = from + DAY_MS;
  const stop = Math.min(to, now);
  const segments = [];
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (e.type !== 'activity' || e.ms >= to) continue;
    const next = list.slice(i + 1).find((x) => x.type === 'activity' || x.kind === 'end' || x.kind === 'wake');
    let end; let closedBy;
    if (next) { end = next.ms; closedBy = next.type === 'activity' ? 'change' : next.kind; } else { end = now; closedBy = 'open'; }
    if (end > to) { end = to; closedBy = 'midnight'; }
    if (end <= from) continue;
    const start = Math.max(e.ms, from);
    const cut = Math.min(end, stop);
    if (cut <= start && closedBy === 'open') continue;
    segments.push({ id: e.id, activity: e.activity, location: e.location, position: e.position, start, end: closedBy === 'open' ? stop : end, closedBy, carriedIn: e.ms < from });
  }
  const mark = (kind) => list.filter((x) => x.type === 'day' && x.kind === kind && dayKey(x.ms) === key);
  return { key, wake: mark('wake')[0]?.ms ?? null, end: mark('end').slice(-1)[0]?.ms ?? null, segments };
}

/** Each END THE DAY paired with the next WOKE UP. A missing end or wake is skipped, never invented. */
export function sleepSessions(events) {
  const marks = live(events).filter((e) => e.type === 'day');
  const out = [];
  for (let i = 0; i < marks.length; i += 1) {
    if (marks[i].kind !== 'end') continue;
    const wake = marks.slice(i + 1).find((x) => x.kind === 'wake' || x.kind === 'end');
    if (wake?.kind === 'wake') out.push({ endMs: marks[i].ms, wakeMs: wake.ms, minutes: Math.round((wake.ms - marks[i].ms) / 60000) });
  }
  return out;
}

/** Minutes per position. A stretch closed only by a later WOKE UP is left out (she may have been asleep). */
export function positionMinutes(segments) {
  const out = {};
  for (const s of segments) {
    if (s.closedBy === 'wake') continue;
    out[s.position] = (out[s.position] ?? 0) + Math.round((s.end - s.start) / 60000);
  }
  return out;
}

export function validateActivity(f) {
  return ['activity', 'location', 'position'].filter((k) => !canonical(f?.[k]));
}

/* ---------- pick lists: fixed choices first, then what she uses most ---------- */
export const STARTER_ACTIVITIES = ['Resting', 'TV', 'Walking', 'Cooking', 'Chores'];
export const FIXED_LOCATIONS = ['Outside', 'House', 'Bed'];
export const FIXED_POSITIONS = ['Laying', 'Sitting', 'Standing'];

function tally(events, field) {
  const t = new Map();
  for (const e of live(events)) {
    if (e.type !== 'activity') continue;
    const name = canonical(e[field]);
    if (!name) continue;
    const k = name.toLowerCase();
    const row = t.get(k) ?? { name, count: 0, last: -Infinity };
    row.count += 1;
    if (e.ms >= row.last) { row.last = e.ms; row.name = name; }
    t.set(k, row);
  }
  return [...t.values()].sort((a, b) => b.count - a.count || b.last - a.last);
}

/** 'activities' (5, most used first, topped up with starters), 'locations' (3 fixed + 2 most used), 'positions' (3 fixed + up to 2). */
export function pickList(events, kind) {
  if (kind === 'activities') {
    const used = tally(events, 'activity').map((r) => r.name);
    const out = [];
    for (const n of [...used, ...STARTER_ACTIVITIES]) if (!out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
    return out.slice(0, 5);
  }
  const fixed = kind === 'locations' ? FIXED_LOCATIONS : FIXED_POSITIONS;
  const rows = tally(events, kind === 'locations' ? 'location' : 'position');
  const extra = rows.map((r) => r.name).filter((n) => !fixed.some((f) => f.toLowerCase() === n.toLowerCase()));
  return [...fixed, ...extra.slice(0, 2)];
}

/** Everything she has ever typed for this field, most used first, for the type-ahead. */
export function pastValues(events, kind) {
  const field = kind === 'activities' ? 'activity' : kind === 'locations' ? 'location' : 'position';
  return tally(events, field).map((r) => r.name);
}
