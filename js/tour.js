// Help tour: callouts with arrows over the real screen. Pure layout + the step text (edit the wording here).
// Each step points at the first selector that exists on screen; steps with no match are skipped.

export const MAIN_STEPS = [
  { sel: ['.tools'], text: 'Top right: light or dark screen, this guide (Help), and Options for settings.' },
  { sel: ['#wake'], text: 'Press when waking up. This starts the day.' },
  { sel: ['#end-day'], text: 'Press at the end of the day. A check is asked first.' },
  { sel: ['#w-kg'], text: 'Weight is asked once a day, then confirmed.' },
  { sel: ['#headache-start'], text: 'Press when a headache begins. Press again to change or resolve it.' },
  { sel: ['.active-card #hd-h'], text: 'A headache is active. Doctor-written text appears here when set.' },
  { sel: ['#acts-h'], text: 'Today so far: every activity, with where and how long.' },
  { sel: ['.tiles'], text: 'Food and drink: tap a meal type, then fill in what was had.' },
  { sel: ['#in-h'], text: 'Eaten today: totals. A coloured word and sign show the doctor\'s limits.' },
  { sel: ['#g-mmol'], text: 'Type a glucose reading from the meter, then Save.' },
  { sel: ['#refill'], text: 'Adds one bottle of water. Undo is right below.' },
];

const GAP = 14;
const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/* items: [{id, rect:{x,y,w,h}, cw, ch}] viewport vp:{w,h,top}. Returns {placed:[{id,x,y,side}], overflow:[id]} */
export function layoutCallouts(items, vp) {
  const placed = [];
  const overflow = [];
  const cards = [];
  const sorted = [...items].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const clampX = (x, cw) => Math.max(8, Math.min(vp.w - cw - 8, x));
  const clampY = (y, ch) => Math.max(vp.top + 4, Math.min(vp.h - ch - 8, y));
  for (const it of sorted) {
    const { rect: r, cw, ch } = it;
    const cy = r.y + r.h / 2 - ch / 2;
    const cx = r.x + r.w / 2 - cw / 2;
    const tries = [
      ['right', r.x + r.w + GAP + 24, cy], ['left', r.x - GAP - 24 - cw, cy],
      ['below', cx, r.y + r.h + GAP + 24], ['above', cx, r.y - GAP - 24 - ch],
    ];
    const jitter = [0, ch + 8, -(ch + 8), 2 * (ch + 8), -2 * (ch + 8)];
    let done = null;
    outer: for (const [side, x0, y0] of tries) {
      for (const dy of (side === 'right' || side === 'left') ? jitter : [0]) {
        const x = clampX(x0, cw); const y = clampY(y0 + dy, ch);
        if ((side === 'right' || side === 'left') && x !== x0) continue;
        const c = { x, y, w: cw, h: ch };
        const inside = c.y >= vp.top && c.y + c.h <= vp.h && c.x >= 0 && c.x + c.w <= vp.w;
        if (!inside) continue;
        if (cards.some((o) => hit(c, o, 6))) continue;
        if (items.some((o) => hit(c, o.rect, 6))) continue;
        done = { id: it.id, x, y, side }; cards.push(c); break outer;
      }
    }
    if (done) placed.push(done); else overflow.push(it.id);
  }
  return { placed, overflow };
}

/* How many scroll stops a page needs (each stop shows about one screen minus the bar) */
export function pagesFor(docH, vh, top) {
  const step = vh - top - 40;
  return docH <= vh ? 1 : Math.ceil((docH - vh) / step) + 1;
}
