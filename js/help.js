// Help overlay: the tour steps (text lives here so it can be edited without touching the screens)
// and the pure layout rules that place a callout beside each target without covering anything.
// Wording is impersonal and gives no medical advice.

export const MAIN_STEPS = [
  { id: 'dark', selectors: ['#dark-toggle'], text: 'Switches between light and dark colours.' },
  { id: 'options', selectors: ['#cog'], text: 'Options: text size, clock, colours and pictures. The Doctors and Admin tabs are here too.' },
  { id: 'day', selectors: ['#wake', '#activity-start', '#activity-change'], text: 'Day button. WOKE UP starts the day, then each activity is logged here, and END THE DAY finishes it.' },
  { id: 'weight', selectors: ['#w-kg', '#wt-h'], text: 'Weight is asked once a day, after waking up. It is checked before it is saved.' },
  { id: 'headache', selectors: ['#headache-start', '#headache-update'], text: 'Starts a headache record. While one is active, its status can be changed or resolved from here.' },
  { id: 'activities', selectors: ['#acts-h'], text: 'Today so far: each activity with where it happened and how long it lasted.' },
  { id: 'meals', selectors: ['#tile-breakfast'], text: 'Food and drink tiles. Tap one to log a meal or a drink.' },
  { id: 'totals', selectors: ['.totals h3'], text: 'Totals so far. A coloured word and sign appear only when a doctor has set a limit for that item.' },
  { id: 'glucose', selectors: ['#g-mmol'], text: 'Blood glucose reading from the meter, in mmol/L. Today\'s readings are listed underneath.' },
  { id: 'fluids', selectors: ['.fluid-line'], text: 'All fluids today: water refills plus every drink logged in the food and drink tiles.' },
  { id: 'refill', selectors: ['#refill'], text: 'Adds one bottle of the selected size to today\'s water. The sizes are chosen just above.' },
];

const GAP = 14;      // space between a callout and the thing it points at
const EDGE = 8;      // space kept free at the screen edge
const WIDTHS = [300, 260, 220, 190];

export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inflate = (r, n) => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });
const dist = (a, b) => {                       // gap between two rectangles (0 when touching)
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.hypot(dx, dy);
};

/** Height of a callout holding `text` at the given width and font size. */
export function estimateHeight(text, width, fontPx) {
  const pad = fontPx * 0.7;
  const perLine = Math.max(8, Math.floor((width - pad * 2 - fontPx * 1.8) / (fontPx * 0.52)));
  const lines = Math.max(1, Math.ceil(String(text).length / perLine));
  return Math.ceil(lines * fontPx * 1.4 + pad * 2);
}

const nearestPoint = (r, p) => ({ x: Math.min(Math.max(p.x, r.x), r.x + r.w), y: Math.min(Math.max(p.y, r.y), r.y + r.h) });

/**
 * Place one callout per target. A callout never covers any target or another callout and stays on screen.
 * Targets that cannot be given room are returned in `failed` (the caller then shows a numbered list instead).
 * targets: [{ id, rect:{x,y,w,h}, text }] in screen coordinates.
 */
export function layoutCallouts(targets, viewport, { fontPx = 20 } = {}) {
  const placed = [];
  const failed = [];
  const solid = targets.map((t) => t.rect);
  targets.forEach((t, i) => {
    let best = null;
    for (const width of WIDTHS) {
      const w = Math.min(width, viewport.w - 2 * EDGE);
      const h = estimateHeight(t.text, w, fontPx);
      for (let x = EDGE; x + w <= viewport.w - EDGE; x += 8) {
        for (let y = EDGE; y + h <= viewport.h - EDGE; y += 8) {
          const box = { x, y, w, h };
          const d = dist(box, t.rect);
          if (d < GAP) continue;
          if (best && d >= best.d) continue;
          if (solid.some((r, k) => overlaps(box, k === i ? inflate(r, GAP - 1) : inflate(r, 4)))) continue;
          if (placed.some((p) => overlaps(box, inflate(p.box, 6)))) continue;
          best = { box, d };
        }
      }
      if (best) break;                                 // a wider, shorter callout is preferred when it fits
    }
    if (!best) { failed.push({ id: t.id, n: i + 1, text: t.text, rect: t.rect }); return; }
    const c = { x: best.box.x + best.box.w / 2, y: best.box.y + best.box.h / 2 };
    const to = nearestPoint(t.rect, c);
    const from = nearestPoint(best.box, to);
    placed.push({ id: t.id, n: i + 1, text: t.text, box: best.box, arrow: { from, to } });
  });
  return { placed, failed };
}

/**
 * Which steps go on one page of the tour: starting at `start`, the steps whose whole box fits in `vh` pixels
 * once step `start` is scrolled to the top. The first step is always included so the tour always moves on.
 * rects are in document coordinates (y from the top of the page).
 */
export function pageFrom(rects, start, vh, max = 5, margin = 0) {
  if (start >= rects.length) return [];
  const top = rects[start].y - margin;
  const out = [start];
  for (let i = start + 1; i < rects.length && out.length < max; i += 1) {
    if (rects[i].y + rects[i].h <= top + vh) out.push(i); else break;
  }
  return out;
}
