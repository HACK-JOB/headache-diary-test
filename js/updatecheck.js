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
