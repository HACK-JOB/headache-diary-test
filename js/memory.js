// "Remember what she types": last-5 chips and type-ahead for medicines and relief measures.
// No presets: the lists only ever contain things she (or a doctor) actually entered.
export const canonical = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

function used(events, kind) {
  const names = [];
  for (const e of events) {
    if (e.type !== 'headache' || e.deleted) continue;
    const list = kind === 'meds' ? (e.meds ?? []).map((m) => m.name) : kind === 'phrases' ? (e.phrases ?? []) : (e.relief ?? []);
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

/** The 5 phrases she uses most (ties: most recent first). Spelling follows her latest use. */
export function commonItems(events, kind) {
  const tally = new Map();
  for (const { name, ms } of used(events, kind)) {
    if (!name) continue;
    const k = name.toLowerCase();
    const t = tally.get(k) ?? { name, count: 0, last: -Infinity };
    t.count += 1;
    if (ms >= t.last) { t.last = ms; t.name = name; }
    tally.set(k, t);
  }
  return [...tally.values()].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, 5).map((t) => t.name);
}

/** Everything ever used that contains the typed text. Phrases are ranked by how common; others newest first. */
export function suggest(events, kind, text) {
  const q = canonical(text).toLowerCase();
  if (!q) return [];
  if (kind === 'phrases') {
    const ranked = commonItems(events, kind).length ? rankAll(events) : [];
    return ranked.filter((n) => n.toLowerCase().includes(q));
  }
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

function rankAll(events) {
  const tally = new Map();
  for (const { name, ms } of used(events, 'phrases')) {
    if (!name) continue;
    const k = name.toLowerCase();
    const t = tally.get(k) ?? { name, count: 0, last: -Infinity };
    t.count += 1;
    if (ms >= t.last) { t.last = ms; t.name = name; }
    tally.set(k, t);
  }
  return [...tally.values()].sort((a, b) => b.count - a.count || b.last - a.last).map((t) => t.name);
}

const items = (text) => String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean);

/** Is this phrase already one of the comma-separated items in the notes? */
export function hasPhrase(notes, phrase) {
  const p = canonical(phrase).toLowerCase();
  return !!p && items(notes).some((x) => canonical(x).toLowerCase() === p);
}

/** Append a phrase to the notes, unless it is already there. */
export function addPhrase(notes, phrase) {
  const p = canonical(phrase);
  if (!p) return items(notes).join(', ');
  if (hasPhrase(notes, p)) return items(notes).join(', ');
  return [...items(notes), p].join(', ');
}

/** Take a phrase out of the notes and tidy the commas. */
export function removePhrase(notes, phrase) {
  const p = canonical(phrase).toLowerCase();
  return items(notes).filter((x) => canonical(x).toLowerCase() !== p).join(', ');
}
