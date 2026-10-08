// Time helpers. The app always uses Brisbane time (UTC+10, no daylight saving),
// regardless of the tablet's own timezone setting.
const TZ = 'Australia/Brisbane';
const OFFSET_MS = 10 * 3600 * 1000;
const DAY_MS = 86400000;

const pad = (n) => String(n).padStart(2, '0');

/** Calendar day (YYYY-MM-DD) in Brisbane for a timestamp in ms. */
export function dayKey(ms) {
  const d = new Date(ms + OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Milliseconds until the next Brisbane midnight. */
export function msUntilNextMidnight(ms) {
  const local = ms + OFFSET_MS;
  return DAY_MS - (((local % DAY_MS) + DAY_MS) % DAY_MS);
}

export function formatLongDate(ms) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(ms));
}

export function formatTime(ms) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(ms)).replace(/\s?([AP]M)/i, (_, m) => ' ' + m.toLowerCase());
}
