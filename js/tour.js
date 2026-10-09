// Help tour: callouts with arrows over the real screen. Pure layout + the step text (edit the wording here).
// Each step points at the first selector that exists on screen; steps with no match are skipped.

export const MAIN_STEPS = [
  { sel: ['.tools'], text: 'Header buttons: light or dark screen, the layout padlock, this guide (Help), and Options.' },
  { sel: ['#layout-lock'], text: 'Unlocks the layout to move or resize panels and set their text size. Nothing can be entered while unlocked.' },
  { sel: ['#wake'], text: 'Press when waking up. This starts the day.' },
  { sel: ['#end-day'], text: 'Press at the end of the day. A check is asked first.' },
  { sel: ['#w-kg'], text: 'Weight is asked once a day, then confirmed.' },
  { sel: ['#headache-start'], text: 'Press when a headache begins. Press again to change or resolve it.' },
  { sel: ['.active-card #hd-h'], text: 'A headache is active. Doctor-written text appears here when set.' },
  { sel: ['#rx-card'], text: 'Medicines today: Taken or Skipped for each dose. A reminder bar offers the same buttons when one is due.' },
  { sel: ['#acts-h'], text: 'Today so far: every activity, with where and how long.' },
  { sel: ['.quick-foods'], text: 'Most used: the five foods and drinks logged most often. One tap opens the form filled in.' },
  { sel: ['.tiles'], text: 'Food and drink: tap a meal type, then fill in what was had.' },
  { sel: ['#in-h'], text: 'Eaten today: totals. A coloured word and sign show the doctor\'s limits.' },
  { sel: ['#g-mmol'], text: 'Type a glucose reading from the meter, then Save.' },
  { sel: ['#refill'], text: 'Adds one bottle of water. The Undo button stays with it.' },
  { sel: ['.pn-card'], text: 'What\'s new: changes made to this screen. Got it hides the note once read.' },
];

/** The unlocked layout is a different screen (bars, grips, a banner), so it has its own tour. */
export const mainTourKey = (unlocked) => (unlocked ? 'main-unlocked' : 'main');
export const UNLOCKED_STEPS = [
  { sel: ['#pg-top'], text: 'Layout is unlocked. Nothing can be entered until Done, lock it is pressed.' },
  { sel: ['.pg-bar .pg-handle', '.pg-handle'], text: 'Drag the handle to move a panel. A line shows where it will land.' },
  { sel: ['.pg-bar [id^="pg-earlier-"]', '.pg-bar [id^="pg-later-"]'], text: 'Earlier and Later move a panel one step. They work where dragging is awkward.' },
  { sel: ['.pg-grip-se', '.pg-grip-s', '.pg-grip-e', '.pg-grip'], text: 'Grips on the edges and corners resize a panel. An outline shows the new size, applied on release.' },
  { sel: ['.pg-bar [id^="pg-set-"]'], text: 'Size opens a bar: text size for this panel, and Narrower, Wider, Shorter and Taller steps.' },
  { sel: ['#pg-flow-snap', '.pg-flow'], text: 'Snapped panels resize together. Lock size in a Size bar keeps one panel at its height.' },
  { sel: ['#pg-reset'], text: 'Reset this layout puts the panels back in the standard arrangement.' },
  { sel: ['#pg-done'], text: 'Done, lock it keeps the layout and allows entries again.' },
];

const HELP = { sel: ['#help'], text: 'Opens this guide again.' };
export const FORM_STEPS = {
  headache: [
    { sel: ['#back'], text: 'Goes back without saving anything.' },
    { sel: ['.time-panel'], text: 'The time the headache started, or the time of this update.' },
    { sel: ['#f-severity'], text: 'How strong the pain is, from 1 (mild) to 5 (very strong).' },
    { sel: ['#f-headacheType'], text: 'Tap the picture closest to where it hurts. Other lets a description be typed.' },
    { sel: ['#f-weather'], text: 'The weather right now.' },
    { sel: ['#f-notes'], text: 'Tap a common note or type one. A description is needed for Other.' },
    { sel: ['#f-meds'], text: 'Any medicine taken. Recent ones appear as buttons.' },
    { sel: ['#f-relief'], text: 'Anything else that helped, such as an ice pack or rest.' },
    { sel: ['#save'], text: 'Saves the headache. Missing items are pointed out first.' },
  ],
  activity: [
    { sel: ['#back'], text: 'Goes back without saving anything.' },
    { sel: ['.time-panel'], text: 'The time this started. It cannot be earlier than the last entry.' },
    { sel: ['#f-activity'], text: 'What is being done. The five most used appear as buttons.' },
    { sel: ['#f-location'], text: 'Where it is happening: outside, in the house, in bed, or another place.' },
    { sel: ['#f-position'], text: 'Laying, sitting or standing.' },
    { sel: ['#save'], text: 'Saves. Any activity still running is ended at this time.' },
  ],
  intake: [
    { sel: ['#back'], text: 'Goes back without saving anything.' },
    { sel: ['#f-name'], text: 'Type or tap the food or drink. Past choices are remembered.' },
    { sel: ['#scan-open'], text: 'Scan a barcode with the camera, or type its number. The name and numbers fill in to check.' },
    { sel: ['.time-panel'], text: 'The time it was had.' },
    { sel: ['#f-amount'], text: 'How many servings, or how much for a drink.' },
    { sel: ['#f-nutrition'], text: 'Numbers from the label, per serving or per 100 g. All optional, and remembered for next time.' },
    { sel: ['#save'], text: 'Saves it to today\'s list.' },
  ],
  'options-prefs': [
    { sel: ['#back'], text: 'Goes back to the diary.' },
    { sel: ['.tabs'], text: 'Options sections. Doctors and Admin are for the family and doctors.' },
    { sel: ['.pn-card'], text: 'What\'s new: changes made to this screen. Got it hides the note once read.' },
    { sel: ['#st-prefs-colour'], text: 'Colours: pick one light and one dark theme. The moon button swaps between them.' },
    { sel: ['#st-prefs-look'], text: 'Pictures and text: the head pictures, the text size and the 12 or 24 hour clock.' },
    { sel: ['#st-prefs-layout'], text: 'Main page layout: unlock the panels to move and resize them, or reset the layout.' },
    { sel: ['#st-prefs-reminders'], text: 'Reminders: the level and sound, and optional reminders that all start off.' },
    { sel: ['#st-prefs-general'], text: 'General: Check for update, and whether a Saved message shows after saving.' },
    { sel: ['.swatches'], text: 'Pick one light and one dark theme. Device dark mode setting follows the tablet instead.' },
    { sel: ['.art-picks'], text: 'Head pictures: only the look changes. The same six types are always there.' },
    { sel: ['.seg[aria-label="Text size"]'], text: 'Text size for the whole app. Panels can have their own size in the unlocked layout.' },
    { sel: ['#layout-open'], text: 'Unlocks the layout. Panels can then be moved and resized, and nothing can be entered.' },
    { sel: ['#own-reminders'], text: 'Optional reminders for waking up, blood glucose and sitting. All start off.' },
    { sel: ['#update-check'], text: 'Check for update looks for a new version now. The installed app also checks overnight.' },
  ],
  'options-track': [
    { sel: ['#back'], text: 'Goes back to the diary.' },
    { sel: ['.tabs'], text: 'Options sections. Tracking chooses which logs are used.' },
    { sel: ['.trk-row'], text: 'Each log can be tracked or not. Off hides it and stops its reminders.' },
    { sel: ['.warn-line', '#trk-user'], text: 'A log locked by Admin or a doctor cannot be changed here. The message says who.' },
  ],
  'options-admin': [
    { sel: ['#back'], text: 'Goes back to the diary.' },
    { sel: ['#st-admin-screens'], text: 'Diary screens: which optional parts of the diary are shown, such as the food log details.' },
    { sel: ['#st-admin-tracking'], text: 'Tracking: Admin\'s choice for a log wins over a doctor\'s and the user\'s. A log can be left to others.' },
    { sel: ['#st-admin-accounts'], text: 'Doctor accounts: add or remove a doctor, and reset a PIN that was lost.' },
    { sel: ['#st-admin-pin'], text: 'Admin PIN: until one is set, Admin stays open. It locks again after 5 minutes.' },
    { sel: ['#st-admin-editing'], text: 'Editing: allow or turn off each Remove and Undo, and choose whether a reason is asked.' },
    { sel: ['#st-admin-restore'], text: 'Restore: load a backup file, either a full restore or a merge of chosen kinds of data.' },
    { sel: ['#st-admin-reset'], text: 'Reset data: one kind of data, or everything. A backup can be saved first, and DELETE is typed.' },
    { sel: ['#admin-accounts'], text: 'Doctor accounts are added and removed here.' },
    { sel: ['#reset-zone'], text: 'Master reset: deletes everything on this tablet. DELETE has to be typed first.' },
  ],
  'options-doctors': [
    { sel: ['#back'], text: 'Goes back to the diary.' },
    { sel: ['#st-doctors-people'], text: 'Doctors: who is signed in, and the list of doctors. Adding a doctor is done in Admin.' },
    { sel: ['#st-doctors-tracking'], text: 'Tracking: a doctor\'s choice for a log, unless Admin has set it. Changes go in the change log.' },
    { sel: ['#st-doctors-targets'], text: 'Daily targets: the limits that colour the totals on the diary.' },
    { sel: ['#st-doctors-rx'], text: 'Medicines: doses with exact times or ranges, and an optional fixed reminder level.' },
    { sel: ['#st-doctors-relief'], text: 'Relief and urgent message: doctor-written text shown with a headache or a high glucose.' },
    { sel: ['#st-doctors-notes'], text: 'Clinical notes: entries are added, never changed.' },
    { sel: ['#st-doctors-log'], text: 'Change log: every change, who made it and when. It cannot be edited.' },
    { sel: ['#targets'], text: 'Targets and limits. They colour the totals on the diary.' },
    { sel: ['#prescriptions'], text: 'Medicines, with exact times or ranges, and an optional fixed reminder level.' },
    { sel: ['#notes'], text: 'Clinical notes. Entries are added, never changed.' },
  ],
  'options-tester': [
    { sel: ['#back'], text: 'Goes back to the diary.' },
    { sel: ['#tn-about'], text: 'Pick the part of the diary a comment is about, then type it below.' },
    { sel: ['#tn-add'], text: 'Saves the comment on this tablet.' },
    { sel: ['#tn-share'], text: 'Sends the checklist and comments. Save as file keeps a copy instead.' },
  ],
};
for (const k of Object.keys(FORM_STEPS)) FORM_STEPS[k].push(HELP);
UNLOCKED_STEPS.push(HELP);
export const TOURS = { main: MAIN_STEPS, 'main-unlocked': UNLOCKED_STEPS, ...FORM_STEPS };

const GAP = 14;
const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/* items: [{id, rect:{x,y,w,h}, cw, ch}] viewport vp:{w,h,top}. Returns {placed:[{id,x,y,side}], overflow:[id]} */
export function layoutCallouts(items, vp, obstacles = []) {
  const placed = [];
  const overflow = [];
  const cards = [];
  const sorted = [...items].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const clampX = (x, cw) => Math.max(8, Math.min(vp.w - cw - 8, x));
  const clampY = (y, ch) => Math.max(vp.top + 4, Math.min(vp.h - ch - 8, y));
  const attempt = (it, useObs) => {
    const { rect: r, cw, ch } = it;
    const cy = r.y + r.h / 2 - ch / 2;
    const cx = r.x + r.w / 2 - cw / 2;
    const tries = [
      ['right', r.x + r.w + GAP + 24, cy], ['left', r.x - GAP - 24 - cw, cy],
      ['below', cx, r.y + r.h + GAP + 24], ['above', cx, r.y - GAP - 24 - ch],
    ];
    const jitter = [0, ch + 8, -(ch + 8), 2 * (ch + 8), -2 * (ch + 8)];
    for (const [side, x0, y0] of tries) {
      for (const dy of (side === 'right' || side === 'left') ? jitter : [0]) {
        const x = clampX(x0, cw); const y = clampY(y0 + dy, ch);
        if ((side === 'right' || side === 'left') && x !== x0) continue;
        const c = { x, y, w: cw, h: ch };
        const inside = c.y >= vp.top && c.y + c.h <= vp.h && c.x >= 0 && c.x + c.w <= vp.w;
        if (!inside) continue;
        if (cards.some((o) => hit(c, o, 6))) continue;
        if (items.some((o) => hit(c, o.rect, 6))) continue;
        if (useObs && obstacles.some((o) => hit(c, o, 2))) continue;
        return { id: it.id, x, y, side, c };
      }
    }
    return null;
  };
  for (const it of sorted) {
    const done = attempt(it, true) || attempt(it, false);
    if (done) { cards.push(done.c); placed.push({ id: done.id, x: done.x, y: done.y, side: done.side }); } else overflow.push(it.id);
  }
  return { placed, overflow };
}

/* How many scroll stops a page needs (each stop shows about one screen minus the bar) */
export function pagesFor(docH, vh, top) {
  const step = vh - top - 40;
  return docH <= vh ? 1 : Math.ceil((docH - vh) / step) + 1;
}
