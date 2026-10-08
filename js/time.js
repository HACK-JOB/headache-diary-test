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

export function formatTime(ms, clock = '12') {
  if (clock === '24') {
    return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  }
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(ms)).replace(/\s?([AP]M)/i, (_, m) => ' ' + m.toLowerCase());
}

/** "HH:MM" typed on a given Brisbane day -> ms. A time later than `now` means she is logging it after midnight, so yesterday. */
export function msFromClock(key, hhmm, now = Date.now()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  const [y, mo, d] = key.split('-').map(Number);
  let ms = Date.UTC(y, mo - 1, d, h - 10, mi);
  if (ms > now + 60000) ms -= DAY_MS;
  return ms;
}

/** ms -> "HH:MM" for <input type=time>. */
export function clockValue(ms) {
  const d = new Date(ms + OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "HH:MM" -> the parts shown in a 12- or 24-hour picker. Returns null if it is not a time. */
export function splitClock(hhmm, clock = '12') {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm ?? ''));
  if (!m) return null;
  const h24 = Number(m[1]);
  const min = Number(m[2]);
  if (h24 > 23 || min > 59) return null;
  if (clock === '24') return { h: h24, m: min, ap: null };
  return { h: h24 % 12 === 0 ? 12 : h24 % 12, m: min, ap: h24 < 12 ? 'am' : 'pm' };
}

/** The reverse: picker parts -> "HH:MM". Gives '' while any part is missing. */
export function joinClock({ h, m, ap }, clock = '12') {
  if (h == null || m == null || (clock !== '24' && !ap)) return '';
  const h24 = clock === '24' ? h : (h % 12) + (ap === 'pm' ? 12 : 0);
  return `${pad(h24)}:${pad(m)}`;
}
