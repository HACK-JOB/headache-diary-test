// Her own reminders (all off by default, set in My preferences). Pure logic, no screen code.
//   wake    - at a chosen time, if WOKE UP has not been tapped yet (the one reminder that works while asleep)
//   glucose - at up to 3 chosen times, after WOKE UP, until a reading is logged at or after that time
//   sitting - once the current activity has been in the position "Sitting" for the chosen minutes
// Each uses her nag level for its repeats, gives up after an hour (sitting: half an hour), and says nothing
// beyond a plain fact. Medicines are separate (js/reminders.js) and always come first.
import { fireTimes } from './reminders.js';
import { dayPhase, openActivity } from './day.js';
import { glucoseToday } from './measures.js';
import { dayKey } from './time.js';

export const SIT_CHOICES = [15, 30, 45, 60, 90, 120];
const MIN = 60000;
const HOUR = 60 * MIN;
const msAt = (key, t) => { const [y, mo, d] = key.split('-').map(Number); const [h, m] = t.split(':').map(Number); return Date.UTC(y, mo - 1, d, h - 10, m); };

/** Keep only valid HH:MM strings, sorted, no repeats, at most three. */
export function validTimes(list) {
  const ok = (Array.isArray(list) ? list : []).filter((t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
  return [...new Set(ok)].sort().slice(0, 3);
}

const clock = (t, fmt) => fmt(msAt('2026-01-01', t));

/**
 * Reminders showing right now (not medicines), soonest first.
 * dismissed: Map of id -> when "OK" was tapped.  fmt(ms) -> "7:30 am" (optional, for wording).
 */
export function activeNudges(events, key, now, s, dismissed = new Map(), fmt = null) {
  const out = [];
  const add = (id, kind, title, startMs, windowMs) => {
    const fires = fireTimes({ startMs, endMs: startMs + windowMs }, s.nag);
    const past = fires.filter((t) => t <= now);
    if (!past.length || now > startMs + windowMs) return;
    const fireMs = past[past.length - 1];
    if ((dismissed.get(id) ?? -Infinity) >= fireMs) return;
    out.push({ id, kind, title, fireMs, startMs, hasMore: fires.some((t) => t > now) });
  };
  const phase = dayPhase(events);
  const woke = events.some((e) => !e.deleted && e.type === 'day' && e.kind === 'wake' && dayKey(e.ms) === key);

  if (s.wakeOn && !woke && phase === 'asleep') {
    const t = msAt(key, s.wakeAt);
    add(`wake#${key}`, 'wake', 'Time to tap WOKE UP', t, HOUR);
  }
  if (s.glucoseOn && phase !== 'asleep') {
    const readings = glucoseToday(events, key);
    for (const t of validTimes(s.glucoseTimes)) {
      const at = msAt(key, t);
      if (readings.some((r) => r.ms >= at)) continue;
      add(`glucose#${t}#${key}`, 'glucose', 'Blood glucose check', at, HOUR);
    }
  }
  if (s.sitOn && phase === 'active') {
    const a = openActivity(events);
    if (a && String(a.position).toLowerCase() === 'sitting') {
      add(`sitting#${a.id}`, 'sitting', `Sitting for ${s.sitMins} minutes`, a.ms + s.sitMins * MIN, 30 * MIN);
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}
