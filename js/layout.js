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

const one = () => ({ order: [...IDS], span: { ...DEFAULT_SPAN }, rows: Object.fromEntries(IDS.map((id) => [id, DEFAULT_ROWS[id] ?? 1])) });
export const defaultLayout = () => ({ portrait: one(), landscape: one() });

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = one();
  const seen = new Set();
  const order = [];
  for (const id of Array.isArray(r.order) ? r.order : []) if (IDS.includes(id) && !seen.has(id)) { seen.add(id); order.push(id); }
  for (const id of IDS) if (!seen.has(id)) order.push(id);
  out.order = order;
  for (const id of IDS) {
    out.span[id] = int(r.span?.[id], 1, COLS) ?? DEFAULT_SPAN[id];
    out.rows[id] = int(r.rows?.[id], 1, 6) ?? (DEFAULT_ROWS[id] ?? 1);
  }
  return out;
}

export const normaliseLayout = (raw) => ({ portrait: clean(raw?.portrait), landscape: clean(raw?.landscape) });

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
  const want = layout[orient].rows[id] ?? 1;
  if (want <= 1) return 1;
  const vis = orderFor(layout, orient, visible);
  const room = COLS - spanFor(layout, orient, id);
  const after = vis.slice(vis.indexOf(id) + 1);
  let beside = 0;
  for (const x of after) { if (spanFor(layout, orient, x) <= room) beside += 1; else break; }
  return Math.max(1, Math.min(want, beside));
}
