// The main page as a 6-column grid. Each panel has an order, a width in columns and a height in rows.
// Portrait and landscape have separate layouts. Pure logic: no screen code here.
export const COLS = 6;
export const PANELS = [
  { id: 'water', label: 'Water', track: 'water' },
  { id: 'headache', label: 'Headache', track: 'headache' },
  { id: 'day', label: 'Day', track: 'day' },
  { id: 'glucose', label: 'Blood glucose', track: 'glucose' },
  { id: 'weight', label: 'Weight', track: 'weight' },
  { id: 'meds', label: 'Medicines', track: 'meds' },
  { id: 'today', label: 'Today so far', track: 'day' },
  { id: 'intake', label: 'Food and drink', track: 'intake' },
  { id: 'eaten', label: 'Eaten today', track: 'intake' },
];
const IDS = PANELS.map((p) => p.id);
const DEFAULT_SPAN = { water: 3, headache: 3, day: 3, glucose: 3, weight: 6, meds: 6, today: 6, intake: 6, eaten: 6 };
const DEFAULT_ROWS = { water: 3 };

export const TEXT_PX = { big: 20, medium: 17, small: 14 };   // the same sizes as the global setting
export const PANEL_TEXT = ['same', 'big', 'medium', 'small'];

/** Narrowest width, in rem at that text size, that shows a panel properly. Measured in the browser, plus a safety margin for
 *  panel states that were not measured (an open headache, longer lists). No panel goes below 9 rem. */
export const MIN_REM = {
  big:    { water: 9, headache: 14.5, day: 10.5, glucose: 11, weight: 11, meds: 20.5, today: 9, intake: 32.5, eaten: 9 },
  medium: { water: 9, headache: 14.5, day: 10.5, glucose: 11, weight: 11, meds: 20.5, today: 9, intake: 33,   eaten: 9 },
  small:  { water: 9, headache: 14.5, day: 10.5, glucose: 11, weight: 11, meds: 20.5, today: 9, intake: 33,   eaten: 9 },
};

const one = () => ({ order: [...IDS], span: { ...DEFAULT_SPAN }, rows: Object.fromEntries(IDS.map((id) => [id, DEFAULT_ROWS[id] ?? 1])), tall: Object.fromEntries(IDS.map((id) => [id, 0])), loose: {} });
export const defaultLayout = () => ({ portrait: one(), landscape: one(), text: {} });

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = one();
  const seen = new Set();
  const order = [];
  for (const id of Array.isArray(r.order) ? r.order : []) if (IDS.includes(id) && !seen.has(id)) { seen.add(id); order.push(id); }
  for (const id of IDS) if (!seen.has(id)) order.push(id);
  out.order = order;
  // 'free: true' is the earlier single switch: it meant every panel is loose
  for (const id of IDS) if (r.loose?.[id] === true || r.free === true) out.loose[id] = true;
  for (const id of IDS) {
    out.span[id] = int(r.span?.[id], 1, COLS) ?? DEFAULT_SPAN[id];
    out.rows[id] = int(r.rows?.[id], 1, 6) ?? (DEFAULT_ROWS[id] ?? 1);
    out.tall[id] = int(r.tall?.[id], 0, 8) ?? 0;
  }
  return out;
}

const cleanText = (raw) => Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {}).filter(([id, v]) => IDS.includes(id) && ['big', 'medium', 'small'].includes(v)));
export const normaliseLayout = (raw) => ({ portrait: clean(raw?.portrait), landscape: clean(raw?.landscape), text: cleanText(raw?.text) });

export const orientationOf = (w, h) => (h > w ? 'portrait' : 'landscape');
export const orderFor = (layout, orient, visible) => layout[orient].order.filter((id) => visible.includes(id));
export const spanFor = (layout, orient, id) => layout[orient].span[id] ?? COLS;

const put = (layout, orient, patch) => ({ ...layout, [orient]: { ...layout[orient], ...patch } });

/** Move one step earlier (-1) or later (+1) among the panels that are showing. Returns the same object if nothing changes. */
export function moveStep(layout, orient, id, dir, visible) {
  const vis = orderFor(layout, orient, visible);
  const i = vis.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= vis.length) return layout;
  const order = [...layout[orient].order];
  const a = order.indexOf(id), b = order.indexOf(vis[j]);
  [order[a], order[b]] = [order[b], order[a]];
  return put(layout, orient, { order });
}

/** Drop a panel just before or after another. */
export function moveTo(layout, orient, id, targetId, after) {
  const order = layout[orient].order;
  if (id === targetId || !order.includes(id) || !order.includes(targetId)) return layout;
  const rest = order.filter((x) => x !== id);
  rest.splice(rest.indexOf(targetId) + (after ? 1 : 0), 0, id);
  return put(layout, orient, { order: rest });
}

/** Rows a panel spans. A panel taller than one row only keeps as many rows as there are panels that can sit beside it. */
export function rowsFor(layout, orient, id, visible) {
  if (anyLoose(layout, orient)) return 1;
  const want = layout[orient].rows[id] ?? 1;
  if (want <= 1) return 1;
  const vis = orderFor(layout, orient, visible);
  const room = COLS - spanFor(layout, orient, id);
  const after = vis.slice(vis.indexOf(id) + 1);
  let beside = 0;
  for (const x of after) { if (spanFor(layout, orient, x) <= room) beside += 1; else break; }
  return Math.max(1, Math.min(want, beside));
}

/* ---------- step 2: sizes ---------- */
export const textFor = (layout, id) => layout.text?.[id] ?? 'same';

/** Choose a panel's own text size ('same' follows the global setting). Unknown panels or sizes change nothing. */
export function setText(layout, id, value) {
  if (!IDS.includes(id) || !PANEL_TEXT.includes(value) || textFor(layout, id) === value) return layout;
  const text = { ...layout.text };
  if (value === 'same') delete text[id]; else text[id] = value;
  return { ...layout, text };
}

/** How much to scale a panel so its text matches its own size, given the global size. */
export const zoomFor = (panelText, globalText) => (panelText === 'same' || panelText === globalText ? 1 : TEXT_PX[panelText] / TEXT_PX[globalText]);

/** Narrowest pixel width for a panel at a text size. */
export const minPx = (id, textKey) => (MIN_REM[textKey]?.[id] ?? 9) * (TEXT_PX[textKey] ?? 20);

export const panelWidth = (span, gridWidth, gap) => span * ((gridWidth - (COLS - 1) * gap) / COLS) + (span - 1) * gap;

/** Fewest columns (of 6) whose width holds `minPx`. When the grid has no width yet, play safe with all 6. */
export function minSpan({ minPx: need, gridWidth, gap }) {
  if (!(gridWidth > 0)) return COLS;
  const col = (gridWidth - (COLS - 1) * gap) / COLS;
  for (let n = 1; n <= COLS; n++) if (n * col + (n - 1) * gap >= need) return n;
  return COLS;
}

/** A copy of the layout where each span is at least its minimum. What is saved is never changed by this. */
export function effectiveSpans(layout, orient, mins) {
  const span = { ...layout[orient].span };
  for (const id of IDS) span[id] = Math.max(span[id], mins[id] ?? 1);
  return { ...layout, [orient]: { ...layout[orient], span } };
}

export function setSpan(layout, orient, id, span, min = 1) {
  if (!IDS.includes(id)) return layout;
  const v = Math.max(min, Math.min(COLS, Math.round(span)));
  if (layout[orient].span[id] === v) return layout;
  return put(layout, orient, { span: { ...layout[orient].span, [id]: v } });
}

export function setRows(layout, orient, id, rows) {
  if (!IDS.includes(id)) return layout;
  const v = Math.max(1, Math.min(6, Math.round(rows)));
  if (layout[orient].rows[id] === v) return layout;
  return put(layout, orient, { rows: { ...layout[orient].rows, [id]: v } });
}

/** Dragging an edge sideways, in whole columns. sign +1 for the right edge, -1 for the left edge. */
export function snapSpan({ startSpan, dxPx, sign, colW, gap, min }) {
  const step = colW + gap;
  const cols = step > 0 ? Math.round((dxPx * sign) / step) : 0;
  return Math.max(min, Math.min(COLS, startSpan + cols));
}

/** Dragging an edge up or down, in whole rows. sign +1 for the bottom edge, -1 for the top edge. */
export function snapRows({ startRows, dyPx, sign, unit }) {
  const rows = unit > 0 ? Math.round((dyPx * sign) / unit) : 0;
  return Math.max(1, Math.min(6, startRows + rows));
}

/** Extra height, in steps (each step is TALL_STEP_REM of extra minimum height). 0 means "as tall as the content". */
export const TALL_STEP_REM = 4;
export function setTall(layout, orient, id, steps) {
  if (!IDS.includes(id)) return layout;
  const v = Math.max(0, Math.min(8, Math.round(steps)));
  if (layout[orient].tall[id] === v) return layout;
  return put(layout, orient, { tall: { ...layout[orient].tall, [id]: v } });
}

/** Dragging the top or bottom edge, in whole steps. sign +1 for the bottom edge, -1 for the top edge. */
export function snapTall({ startTall, dyPx, sign, unit }) {
  const steps = unit > 0 ? Math.round((dyPx * sign) / unit) : 0;
  return Math.max(0, Math.min(8, startTall + steps));
}

/** The eight grips on an unlocked panel. x and y say which way a drag on that grip grows the panel. */
export const GRIPS = [
  { key: 'n', x: 0, y: -1 }, { key: 'e', x: 1, y: 0 }, { key: 's', x: 0, y: 1 }, { key: 'w', x: -1, y: 0 },
  { key: 'ne', x: 1, y: -1 }, { key: 'se', x: 1, y: 1 }, { key: 'sw', x: -1, y: 1 }, { key: 'nw', x: -1, y: -1 },
];

/** Net height change in steps. Shorter takes off extra height first, then built-in rows (down to 1); taller puts rows back first, then adds height. */
export function heightBy(layout, orient, id, steps) {
  if (!IDS.includes(id) || !steps) return layout;
  const free = anyLoose(layout, orient);
  const home = free ? layout[orient].rows[id] : (DEFAULT_ROWS[id] ?? 1);
  let rows = layout[orient].rows[id], tall = layout[orient].tall[id];
  for (let i = 0; i < Math.abs(steps); i++) {
    if (steps < 0) { if (tall > 0) tall -= 1; else if (rows > 1 && !free) rows -= 1; }
    else if (rows < home) rows += 1; else if (tall < 8) tall += 1;
  }
  if (rows === layout[orient].rows[id] && tall === layout[orient].tall[id]) return layout;
  return put(layout, orient, { rows: { ...layout[orient].rows, [id]: rows }, tall: { ...layout[orient].tall, [id]: tall } });
}

/** A loose panel keeps its own height and the panel below slides up into any gap. A snapped panel stays level with the snapped panels beside it. */
export const isLoose = (layout, orient, id) => layout[orient].loose?.[id] === true;
export const anyLoose = (layout, orient) => IDS.some((id) => isLoose(layout, orient, id));
export function setLoose(layout, orient, id, on) {
  if (!IDS.includes(id) || isLoose(layout, orient, id) === !!on) return layout;
  const loose = { ...layout[orient].loose };
  if (on) loose[id] = true; else delete loose[id];
  return put(layout, orient, { loose });
}

/** The two all-at-once buttons: every panel loose (Free flow) or every panel snapped (Snapped rows). */
export const isFree = (layout, orient) => IDS.every((id) => isLoose(layout, orient, id));
export function setFree(layout, orient, on) {
  if (isFree(layout, orient) === !!on && (on || !anyLoose(layout, orient))) return layout;
  return put(layout, orient, { loose: on ? Object.fromEntries(IDS.map((id) => [id, true])) : {} });
}

/** Heights after levelling. Snapped panels that start on the same line (within tol px) share the tallest one; loose panels keep theirs. */
export function levelHeights(items, tol) {
  const out = {};
  const snapped = items.filter((i) => i.snap).sort((a, b) => a.top - b.top);
  for (const i of items) if (!i.snap) out[i.id] = i.h;
  let k = 0;
  while (k < snapped.length) {
    let e = k + 1;
    while (e < snapped.length && snapped[e].top - snapped[k].top <= tol) e += 1;
    const tallest = Math.max(...snapped.slice(k, e).map((i) => i.h));
    for (const i of snapped.slice(k, e)) out[i.id] = tallest;
    k = e;
  }
  return out;
}

/** Free flow packs panels on a fine grid of small rows. This is how many of them a panel of this height needs, gap included. */
export function masonrySpan({ heightPx, gapPx, unitPx }) {
  if (!(unitPx > 0)) return 1;
  return Math.max(1, Math.ceil((heightPx + gapPx) / unitPx));
}
