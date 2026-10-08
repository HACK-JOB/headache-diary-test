// Master reset (Admin). Pure helpers; the screen is in admin-ui.js.
export const RESET_WORD = 'DELETE';

/** True only when the typed text is exactly the word DELETE (stray spaces are ignored; capitals matter). */
export const confirmsReset = (text) => typeof text === 'string' && text.trim() === RESET_WORD;

/** Which saved settings on the tablet belong to this app (all start "hd."). */
export const diaryKeys = (keys) => keys.filter((k) => typeof k === 'string' && k.startsWith('hd.'));

const SAFE_SETTINGS = ['hd.settings'];   // display preferences only; PIN records and lockout counters are never saved to a file

/** The backup file: every entry and its change history, plus display settings. No PINs. */
export function backupFile({ events, history }, storage, now = Date.now()) {
  const settings = {};
  for (const k of SAFE_SETTINGS) if (typeof storage?.[k] === 'string') settings[k] = storage[k];
  return { app: 'headache-diary', version: 1, savedAt: new Date(now).toISOString(), events, history, settings };
}

/** File name with the Brisbane date, e.g. headache-diary-backup-2026-10-08.json */
export function backupName(now = Date.now()) {
  const d = new Date(now + 10 * 3600 * 1000).toISOString().slice(0, 10);
  return `headache-diary-backup-${d}.json`;
}
