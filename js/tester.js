// Tester notes: a "what to try" checklist and a comments box, kept on the tablet only.
// Nothing here is sent anywhere. Comments leave the tablet only when the tester taps Share or Save as file.
export const ABOUT = ['Main page', 'Water', 'Day and activities', 'Headache', 'Food and drink', 'Medicines', 'Reminders', 'Blood glucose and weight', 'Options', 'Help guide', 'Other'];

export const CHECKLIST = [
  { id: 'day', group: 'A full day', text: 'Tap WOKE UP, then start an activity, change it, and tap END THE DAY.' },
  { id: 'water', group: 'A full day', text: 'Add a water refill, change the bottle size, then undo a refill.' },
  { id: 'meal', group: 'A full day', text: 'Log a meal with made-up numbers. Then log it again and tap its button under "Most used".' },
  { id: 'scan-cam', group: 'Barcode', text: 'On a meal form, tap "Scan a barcode" and point the camera at a packaged food. Does the camera open and read it?' },
  { id: 'scan-both', group: 'Barcode', text: 'Scan a pack with the number printed under the barcode. Which message shows: the barcode and number match, only one was read, or they do not match? Write it in a comment.' },
  { id: 'scan-check', group: 'Barcode', text: 'Compare the numbers that fill in with the pack label. Do they match?' },
  { id: 'scan-type', group: 'Barcode', text: 'Scan again and type the number under the barcode instead of using the camera.' },
  { id: 'scan-none', group: 'Barcode', text: 'Try a product that is not found, such as a fresh or local item. Is the message clear?' },
  { id: 'scan-off', group: 'Barcode', text: 'Scan the same food again with airplane mode on. Does it fill in from the saved food?' },
  { id: 'scan-light', group: 'Barcode', text: 'After scanning, does the camera light go off?' },
  { id: 'drink', group: 'A full day', text: 'Log a drink under Beverages with an amount.' },
  { id: 'head-start', group: 'Headache', text: 'Start a headache with made-up answers.' },
  { id: 'head-change', group: 'Headache', text: 'Change its status, then resolve it.' },
  { id: 'glucose', group: 'Measures', text: 'Save a made-up blood glucose reading and a made-up weight.' },
  { id: 'rx-add', group: 'Medicines', text: 'In Options, Doctors: add a made-up medicine due a few minutes from now.' },
  { id: 'rx-banner', group: 'Medicines', text: 'When the reminder appears, try Taken, Skipped and "Remind me later".' },
  { id: 'rx-undo', group: 'Medicines', text: 'On the Medicines card, undo an answer and give a reason.' },
  { id: 'own-rem', group: 'Reminders', text: 'In My preferences, turn on one of the "Other reminders" and see it appear.' },
  { id: 'help', group: 'Help guide', text: 'Tap Help on the main page and on one of the forms. Is each arrow clear?' },
  { id: 'rotate', group: 'Screen', text: 'Turn the tablet sideways and back. Does everything still fit?' },
  { id: 'text', group: 'Screen', text: 'Try each text size in My preferences. Which feels right?' },
  { id: 'dark', group: 'Screen', text: 'Switch to the dark screen with the moon button and back.' },
  { id: 'offline', group: 'Screen', text: 'Turn on airplane mode, add some water, then turn it off. Is it still there?' },
  { id: 'reload', group: 'Screen', text: 'Close the app fully and open it again. Is everything still there?' },
  { id: 'trk-off', group: 'Tracking', text: 'In Options, Tracking: switch off a log you do not use, such as Blood glucose. Does its card leave the main page and its reminders stop?' },
  { id: 'trk-on', group: 'Tracking', text: 'Switch that log back on. Is everything you entered earlier still there?' },
  { id: 'trk-lock', group: 'Tracking', text: 'In Admin, Tracking: lock a log on or off. Back in Options, Tracking, try to change it. Does the message name who locked it?' },
  { id: 'trk-doc', group: 'Tracking', text: 'In Doctors, Tracking: set a log, then set the opposite in Admin. Which one wins?' },
  { id: 'lay-unlock', group: 'Layout', text: 'Tap the padlock at the top of the main page. Can anything be entered while the layout is unlocked?' },
  { id: 'lay-move', group: 'Layout', text: 'Move a panel with its Earlier and Later buttons, then by dragging its handle. Do both work?' },
  { id: 'lay-resize', group: 'Layout', text: 'Resize a panel by dragging an edge or corner, and with the Size button. Do the panels below move up?' },
  { id: 'lay-free', group: 'Layout', text: 'Unlocked, open one panel\'s Size box and switch off Snap to neighbours, then make its neighbour taller. Does the panel below slide up into the gap? Try Free flow too.' },
  { id: 'lay-text', group: 'Layout', text: 'In a panel\'s Size settings, change that panel\'s text size. Do the other panels stay the same?' },
  { id: 'lay-rotate', group: 'Layout', text: 'Set a layout, then turn the tablet sideways. Is the sideways layout separate? Then tap Reset this layout.' },
];

const IDS = new Set(CHECKLIST.map((c) => c.id));
const MAX = 1000;
const empty = () => ({ checks: {}, notes: [] });

/** Whatever was saved becomes a safe record. Unknown ticks and broken notes are dropped. */
export function normaliseTester(raw) {
  if (!raw || typeof raw !== 'object') return empty();
  const checks = {};
  if (raw.checks && typeof raw.checks === 'object') for (const [k, v] of Object.entries(raw.checks)) if (IDS.has(k) && v === true) checks[k] = true;
  const notes = (Array.isArray(raw.notes) ? raw.notes : [])
    .filter((n) => n && typeof n === 'object' && Number.isFinite(n.at) && typeof n.text === 'string' && n.text.trim())
    .map((n) => ({ at: n.at, about: ABOUT.includes(n.about) ? n.about : 'Other', text: n.text.trim().slice(0, MAX) }));
  return { checks, notes };
}

export function addNote(state, { text, about, now = Date.now() }) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return state;
  const note = { at: now, about: ABOUT.includes(about) ? about : 'Other', text: t.slice(0, MAX) };
  return { ...state, notes: [note, ...state.notes] };
}

export const removeNote = (state, at) => ({ ...state, notes: state.notes.filter((n) => n.at !== at) });

export function setCheck(state, id, on) {
  if (!IDS.has(id)) return state;
  const checks = { ...state.checks };
  if (on) checks[id] = true; else delete checks[id];
  return { ...state, checks };
}

export const progress = (state) => ({ done: CHECKLIST.filter((c) => state.checks[c.id]).length, total: CHECKLIST.length });

const brisbane = (ms) => new Date(ms + 10 * 3600 * 1000);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function stamp(ms) {
  const d = brisbane(ms);
  const h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

/** Plain text to send. It holds only the ticks and the tester's own words, never diary entries. */
export function shareText(state, now = Date.now()) {
  const p = progress(state);
  const lines = [`Headache Diary tester notes, ${stamp(now)}`, `Checklist: ${p.done} of ${p.total} done`, ''];
  let group = '';
  for (const c of CHECKLIST) {
    if (c.group !== group) { group = c.group; lines.push(group); }
    lines.push(`  [${state.checks[c.id] ? 'x' : ' '}] ${c.text}`);
  }
  lines.push('', `Comments (${state.notes.length})`);
  if (!state.notes.length) lines.push('  None.');
  for (const n of state.notes) lines.push(`  ${stamp(n.at)} | ${n.about}`, `    ${n.text}`);
  return lines.join('\n');
}

export const noteFileName = (now = Date.now()) => `headache-diary-tester-notes-${brisbane(now).toISOString().slice(0, 10)}.txt`;
