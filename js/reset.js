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

/* ---------- individual resets ---------- */
import { myFoods } from './intake.js';
import { recentItems } from './memory.js';

/** What each reset removes, and what it deliberately keeps. `types` are entry types in the diary log;
 *  `storage` are settings kept on this tablet; `forget` hides remembered lists without touching the log. */
export const SCOPES = [
  { key: 'water', label: 'Water', what: 'Every water refill.', keeps: 'Everything else.', types: ['water'] },
  { key: 'food', label: 'Food and drink log', what: 'Every meal and drink entry, including the totals.', keeps: 'Nothing is kept of the meals. Saved foods are cleared separately.', types: ['intake'] },
  { key: 'saved', label: 'Saved foods and notes', what: 'The Most used buttons and remembered foods, medicines, notes and relief items.', keeps: 'The meal and headache entries stay, and so do the doctors\' totals. Typing an item again brings it back.', forget: ['foods', 'notes'] },
  { key: 'headaches', label: 'Headaches', what: 'Every headache record.', keeps: 'Medicine answers, meals and everything else.', types: ['headache'] },
  { key: 'days', label: 'Days and activities', what: 'WOKE UP, END THE DAY and every activity.', keeps: 'Everything else.', types: ['day', 'activity'] },
  { key: 'measures', label: 'Weight and blood glucose', what: 'Every weight and glucose reading.', keeps: 'Targets and the urgent message.', types: ['measure'] },
  { key: 'doses', label: 'Medicine answers', what: 'Every Taken, Skipped and Undo answer.', keeps: 'The prescriptions themselves.', types: ['dose'] },
  { key: 'tester', label: 'Tester notes', what: 'The checklist ticks and every comment.', keeps: 'The diary itself.', storage: ['hd.tester'] },
  { key: 'display', label: 'Display settings', what: 'Colours, text size, clock, reminder levels, the page layout and the bottle sizes go back to the starting choices.', keeps: 'The diary and all PINs.', storage: ['hd.settings', 'hd.selected', 'hd.text', 'hd.layout'] },
  { key: 'doctors', label: 'Doctor data', what: 'Doctor accounts and PINs, targets, prescriptions, relief text, urgent message and clinical notes.', keeps: 'The diary entries.', types: ['doctor', 'clinical'], storage: ['hd.doctorTries'] },
];
export const scopeByKey = (k) => SCOPES.find((s) => s.key === k);

/** How many things a reset would remove (entries, or stored settings, or remembered items). */
export function countScope(events, scope, storage) {
  let n = 0;
  if (scope.types) n += events.filter((e) => scope.types.includes(e.type) && !e.deleted).length;
  if (scope.storage) n += scope.storage.filter((k) => storage?.getItem?.(k) != null).length;
  if (scope.forget) n += myFoods(events).length + ['meds', 'phrases', 'relief'].reduce((s, k) => s + recentItems(events, k).length, 0);
  return n;
}

/** Doctor data cannot be wiped quietly: not while any doctor has a PIN, unless a doctor is signed in. */
export const scopeAllowed = (scope, { pinHolders = 0, doctorSignedIn = false } = {}) =>
  scope.key !== 'doctors' || pinHolders === 0 || doctorSignedIn;

/** Do the reset and leave a small record of it. Returns how many things were removed. */
export async function applyScope(scope, { log, storage, now = Date.now() }) {
  const count = countScope(await log.all(), scope, storage);
  if (scope.types) await log.purge((e) => scope.types.includes(e.type));
  for (const k of scope.storage ?? []) storage?.removeItem?.(k);
  for (const what of scope.forget ?? []) await log.add({ type: 'config', kind: 'forget', what }, now);
  await log.add({ type: 'config', kind: 'reset', scope: scope.key, count }, now);
  return count;
}

export function resetNote(e) {
  const s = scopeByKey(e?.scope);
  if (!s) return '';
  if (s.forget) return `${s.label} reset: forgotten`;
  if (!s.types) return `${s.label} reset`;
  return `${s.label} reset: ${e.count} ${e.count === 1 ? 'entry' : 'entries'} removed`;
}

/* ---------- restore from a backup file ---------- */
/** Read a backup file's text. Only this app's own file, in a version this code knows, is accepted. */
export function parseBackup(text) {
  let f;
  try { f = JSON.parse(text); } catch { return { ok: false, message: 'That is not a backup file from this diary.' }; }
  if (!f || f.app !== 'headache-diary') return { ok: false, message: 'That is not a backup file from this diary.' };
  if (f.version !== 1) return { ok: false, message: 'That backup is from a different version and cannot be loaded.' };
  if (!Array.isArray(f.events) || !Array.isArray(f.history ?? [])) return { ok: false, message: 'That backup file is damaged.' };
  return { ok: true, file: { ...f, history: f.history ?? [] } };
}

/** The kinds of data a merge can include or leave out. */
const RESTORE_GROUPS = [
  ['water', 'Water', ['water']], ['food', 'Food and drink', ['intake']], ['headaches', 'Headaches', ['headache']],
  ['days', 'Days and activities', ['day', 'activity']], ['measures', 'Weight and blood glucose', ['measure']], ['doses', 'Medicine answers', ['dose']],
  ['doctors', 'Doctor data (accounts, PINs, targets, medicines, notes)', ['doctor', 'clinical']], ['admin', 'Admin choices (screens, tracking, edit rules)', ['config']],
];
export function restoreGroups(file) {
  return RESTORE_GROUPS.map(([key, label, types]) => ({ key, label, types, count: file.events.filter((e) => types.includes(e.type) && !e.deleted).length }))
    .filter((g) => g.count > 0);
}

/** What a restore would do. Merge adds only chosen groups and skips entries already here; full takes everything. */
export function planRestore(file, have, { mode, groups = [] }) {
  if (mode === 'full') return { add: file.events, skipped: 0 };
  const types = new Set(RESTORE_GROUPS.filter(([k]) => groups.includes(k)).flatMap(([, , t]) => t));
  const ids = new Set(have.map((e) => e.id));
  const chosen = file.events.filter((e) => types.has(e.type));
  return { add: chosen.filter((e) => !ids.has(e.id)), skipped: chosen.filter((e) => ids.has(e.id)).length };
}

/** Do the restore. Full wipes the diary first, then loads the file and its display settings. Returns how many entries were added. */
export async function applyRestore(file, log, { mode, groups = [], storage } = {}) {
  const plan = planRestore(file, await log.all(), { mode, groups });
  if (mode === 'full') {
    await log.clearAll();
    for (const [k, v] of Object.entries(file.settings ?? {})) if (k.startsWith('hd.')) storage?.setItem?.(k, v);
  }
  const n = await log.restoreRaw(plan.add, file.history);
  return n;
}
