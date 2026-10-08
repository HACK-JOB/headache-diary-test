// "Remember what she types": last-5 chips and type-ahead for medicines and relief measures.
// No presets: the lists only ever contain things she (or a doctor) actually entered.
export const canonical = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

function used(events, kind) {
  const names = [];
  for (const e of events) {
    if (e.type !== 'headache' || e.deleted) continue;
    const list = kind === 'meds' ? (e.meds ?? []).map((m) => m.name) : (e.relief ?? []);
    for (const n of list) names.push({ name: canonical(n), ms: e.ms });
  }
  return names.sort((a, b) => b.ms - a.ms);
}

/** Last 5 distinct (case-insensitive), newest first. */
export function recentItems(events, kind) {
  const seen = new Set();
  const out = [];
  for (const { name } of used(events, kind)) {
    const k = name.toLowerCase();
    if (!name || seen.has(k)) continue;
    seen.add(k);
    out.push(name);
    if (out.length === 5) break;
  }
  return out;
}

/** Everything ever used that contains the typed text, newest first. */
export function suggest(events, kind, text) {
  const q = canonical(text).toLowerCase();
  if (!q) return [];
  const seen = new Set();
  const out = [];
  for (const { name } of used(events, kind)) {
    const k = name.toLowerCase();
    if (!name || seen.has(k) || !k.includes(q)) continue;
    seen.add(k);
    out.push(name);
  }
  return out;
}
