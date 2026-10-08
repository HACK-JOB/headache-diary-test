// Help tour: callouts with arrows over the real screen. Pure layout + the step text (edit the wording here).
// Each step points at the first selector that exists on screen; steps with no match are skipped.

export const MAIN_STEPS = [
  { sel: ['.tools'], text: 'Top right: light or dark screen, this guide (Help), and Options for settings.' },
  { sel: ['#wake'], text: 'Press when waking up. This starts the day.' },
  { sel: ['#end-day'], text: 'Press at the end of the day. A check is asked first.' },
  { sel: ['#w-kg'], text: 'Weight is asked once a day, then confirmed.' },
  { sel: ['#headache-start'], text: 'Press when a headache begins. Press again to change or resolve it.' },
  { sel: ['.active-card #hd-h'], text: 'A headache is active. Doctor-written text appears here when set.' },
  { sel: ['#rx-card'], text: 'Medicines today: Taken or Skipped for each dose. A reminder bar at the top offers the same buttons.' },
  { sel: ['#acts-h'], text: 'Today so far: every activity, with where and how long.' },
  { sel: ['.quick-foods'], text: 'Most used: the five foods and drinks logged most often. One tap opens the form filled in.' },
  { sel: ['.tiles'], text: 'Food and drink: tap a meal type, then fill in what was had.' },
  { sel: ['#in-h'], text: 'Eaten today: totals. A coloured word and sign show the doctor\'s limits.' },
  { sel: ['#g-mmol'], text: 'Type a glucose reading from the meter, then Save.' },
  { sel: ['#refill'], text: 'Adds one bottle of water. Undo is right below.' },
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
    { sel: ['#own-reminders'], text: 'Optional reminders for waking up, blood glucose and sitting too long. All start off.' },
  ],
  'options-track': [
    { sel: ['#back'], text: 'Goes back to the diary.' },
    { sel: ['.tabs'], text: 'Options sections. Tracking chooses which logs are used.' },
    { sel: ['.trk-row'], text: 'Each log can be tracked or not. Off hides it and stops its reminders.' },
    { sel: ['.warn-line', '#trk-user'], text: 'A log locked by Admin or a doctor cannot be changed here. The message says who.' },
  ],
  'options-admin': [
    { sel: ['#back'], text: 'Goes back to the diary.' },
    { sel: ['#weight-switch'], text: 'Shows or hides weight on the diary. Doctors always see it.' },
    { sel: ['#admin-accounts'], text: 'Doctor accounts are added and removed here.' },
    { sel: ['#reset-zone'], text: 'Master reset: deletes everything on this tablet. DELETE has to be typed first.' },
  ],
  'options-doctors': [
    { sel: ['#back'], text: 'Goes back to the diary.' },
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
export const TOURS = { main: MAIN_STEPS, ...FORM_STEPS };

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
