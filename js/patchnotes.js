// Patch notes: written as drafts while changes are made, then published together as a numbered update.
// Nothing shows in the app until published. Each note belongs to one screen and shows only there.
export const SCREENS = [
  { key: 'main', label: 'Main page' },
  { key: 'headache', label: 'Headache' },
  { key: 'activity', label: 'Activity' },
  { key: 'intake', label: 'Food and drink' },
  { key: 'prefs', label: 'My preferences' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'admin', label: 'Admin' },
  { key: 'admin-reset', label: 'Admin: Reset data' },
  { key: 'doctors-rx', label: 'Doctors: Medicines' },
  { key: 'tester', label: 'Tester notes' },
];
const KEYS = new Set(SCREENS.map((s) => s.key));
export const MAX_LEN = 140;

/** Notes for a screen, newest release first. */
export const notesFor = (releases, screen) =>
  [...releases].sort((a, b) => b.id - a.id).flatMap((r) => r.notes.filter((n) => n.screen === screen).map((n) => ({ ...n, release: r.id, title: r.title, date: r.date })));

/** Notes on a screen from releases newer than the one last dismissed there. */
export const unseenFor = (releases, seen, screen) => notesFor(releases, screen).filter((n) => n.release > (seen?.[screen] ?? 0));

export const latestId = (releases) => releases.reduce((m, r) => Math.max(m, r.id), 0);

/** Dismiss a screen's notes: remember the newest release as seen there. */
export const markSeen = (seen, releases, screen) => ({ ...seen, [screen]: latestId(releases) });

/** A new install has nothing to catch up on. */
export const freshSeen = (releases) => Object.fromEntries(SCREENS.map((s) => [s.key, latestId(releases)]));

/** Turn the drafts into the next numbered update. Returns new lists; the inputs are left alone. */
export function publish(releases, drafts, date) {
  if (!drafts.length) throw new Error('There are no drafts to publish.');
  const id = latestId(releases) + 1;
  return { releases: [...releases, { id, date, title: `Update ${id}`, notes: drafts.map((d) => ({ ...d })) }], drafts: [] };
}

/** Problems with a list of notes (empty list = fine). Wording stays impersonal, like the rest of the app. */
export function validate(notes) {
  const bad = [];
  notes.forEach((n, i) => {
    const at = `Note ${i + 1}`;
    if (!KEYS.has(n.screen)) bad.push(`${at}: unknown screen "${n.screen}"`);
    if (!String(n.text ?? '').trim()) bad.push(`${at}: empty text`);
    else if (n.text.length > MAX_LEN) bad.push(`${at}: too long (${n.text.length} characters, limit ${MAX_LEN})`);
    else if (/\b(you|your|yours)\b/i.test(n.text)) bad.push(`${at}: avoid "you" or "your"`);
  });
  return bad;
}
