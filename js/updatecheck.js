// Check for an app update on request. The app also checks on its own when opened and every hour; this is the manual button.

/** The version name from the app's cache names (e.g. 'hd-v134'): the highest number wins. */
export function versionFrom(cacheNames) {
  const found = (Array.isArray(cacheNames) ? cacheNames : []).map((n) => /^hd-v(\d+)$/.exec(n)).filter(Boolean).map((m) => Number(m[1]));
  return found.length ? `hd-v${Math.max(...found)}` : null;
}

const TEXT = {
  checking: () => 'Checking for a new version…',
  current: (v) => `The app is up to date${v ? ` (${v})` : ''}.`,
  found: () => 'A new version was found and is being installed. The app will ask to refresh.',
  offline: () => 'No connection. The check needs the internet.',
  failed: () => 'Could not check for a new version. Try again in a moment.',
};
export const outcomeText = (outcome, version) => (TEXT[outcome] ?? TEXT.failed)(version);

/** Wait for a freshly found worker to finish installing. Gives up after waitMs: it is still on its way, so call it found. */
function installed(worker, waitMs) {
  return new Promise((resolve) => {
    const done = (v) => { clearTimeout(timer); worker.removeEventListener('statechange', onState); resolve(v); };
    const onState = () => { if (worker.state === 'installed' || worker.state === 'activating' || worker.state === 'activated') done('found'); else if (worker.state === 'redundant') done('failed'); };
    const timer = setTimeout(() => done('found'), waitMs);
    worker.addEventListener('statechange', onState);
    onState();
  });
}

/** Ask the server for a new version now. Returns 'current', 'found', 'offline' or 'failed'. */
export async function checkNow(reg, { online = true, waitMs = 8000 } = {}) {
  if (!online) return 'offline';
  if (!reg) return 'failed';
  try {
    await reg.update();
    if (reg.waiting) return 'found';
    if (reg.installing) return await installed(reg.installing, waitMs);
    return 'current';
  } catch {
    return 'failed';
  }
}

/* ---------- overnight check (periodic background sync) ---------- */
export const AUTO_TAG = 'hd-update-check';
export const AUTO_MIN_MS = 12 * 60 * 60 * 1000;     // at most about twice a day; the browser decides the actual time

const AUTO = {
  on: 'Automatic checks are on. The browser picks the time, usually overnight, and only when the app is installed.',
  unsupported: 'Automatic overnight checks are not available here. The app checks when it opens and every hour while open.',
  denied: 'Automatic overnight checks are not allowed here. The browser only allows them for the installed app. The app checks when it opens and every hour while open.',
  unknown: 'The app checks when it opens and every hour while open.',
};
export const autoText = (status) => AUTO[status] ?? AUTO.unknown;

/** Ask for the overnight check. Returns 'on', 'unsupported' or 'denied'. */
export async function registerAuto(reg, perms = navigator.permissions) {
  if (!reg?.periodicSync) return 'unsupported';
  try {
    const p = await perms?.query?.({ name: 'periodic-background-sync' });
    if (p && p.state === 'denied') return 'denied';
    await reg.periodicSync.register(AUTO_TAG, { minInterval: AUTO_MIN_MS });
    return 'on';
  } catch { return 'denied'; }
}

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function clockText(d, clock) {
  if (clock === '12') return `${d.getHours() % 12 || 12}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** "Last checked today at 05:07." in the tablet's own time and clock style. */
export function lastCheckedText(ms, now, clock = '12') {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 'Not checked yet.';
  const d = new Date(ms), n = new Date(now);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 86400000);
  const when = diff === 0 ? 'today' : diff === 1 ? 'yesterday' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `Last checked ${when} at ${clockText(d, clock)}.`;
}
