// Headache episode rules. A headache is an episode: one start, optional status updates, one resolve.
// Everything is derived from the event log, so edits/deletes and history come for free.
import { dayKey } from './time.js';

const KIND_RANK = { start: 0, update: 1, resolve: 2 };
const byOrder = (a, b) => a.ms - b.ms || (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.seq ?? 0) - (b.seq ?? 0) || (KIND_RANK[a.kind] ?? 1) - (KIND_RANK[b.kind] ?? 1);

// Plain-language descriptions only. The app never uses the word "migraine" and never diagnoses.
export const TYPES = {
  cluster: { name: 'Cluster', hint: 'Sharp pain behind or around one eye' },
  sinus: { name: 'Sinus', hint: 'Pressure across the forehead, cheeks or nose' },
  tension: { name: 'Tension', hint: 'A tight band or pressure around the whole head' },
  tmj: { name: 'TMJ', hint: 'Ache at the jaw joint, in front of the ear' },
  oneSided: { name: 'One Sided', hint: 'Pain mostly on one side of the head' },
  neck: { name: 'Neck', hint: 'Pain from the neck or the back of the head' },
  other: { name: 'Other', hint: 'None of these fit. Please describe it.' },
};
export const SEVERITY = [
  { n: 1, name: 'Mild', hint: 'There, but easy to ignore' },
  { n: 2, name: 'Minor', hint: 'Noticeable, can carry on' },
  { n: 3, name: 'Moderate', hint: 'Hard to ignore, slows me down' },
  { n: 4, name: 'Severe', hint: 'Hard to do anything' },
  { n: 5, name: 'Debilitating', hint: 'Cannot do anything' },
];
export const WEATHER = ['Sunny', 'Partly cloudy', 'Overcast', 'Rain', 'Thunderstorm', 'Windy'];
export const SYMPTOMS = [
  'Sensitive to light', 'Sensitive to noise', 'Feeling sick', 'Dizzy', 'Blurry vision',
  'Pain when chewing', 'Stiff neck', 'Runny or blocked nose', 'Tired', 'Thirsty',
];

const blank = (v) => v == null || String(v).trim() === '';
const validSeverity = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

/** Returns a list of field names that are missing or wrong. Empty list = OK. */
export function validateStart(f) {
  const bad = [];
  if (!validSeverity(f.severity)) bad.push('severity');
  if (blank(f.weather)) bad.push('weather');
  if (!(f.headacheType in TYPES)) bad.push('headacheType');
  else if (f.headacheType === 'other' && blank(f.notes)) bad.push('notes');
  return bad;
}

/** Status updates: everything optional, but switching to Other needs a note. */
export function validateUpdate(changes, current) {
  const bad = [];
  if ('severity' in changes && changes.severity != null && !validSeverity(changes.severity)) bad.push('severity');
  if ('headacheType' in changes && changes.headacheType != null) {
    if (!(changes.headacheType in TYPES)) bad.push('headacheType');
    else if (changes.headacheType === 'other' && current.headacheType !== 'other' && blank(changes.notes)) bad.push('notes');
  }
  return bad;
}

const TRACKED = ['severity', 'weather', 'headacheType'];

/** What changed between the current values and a proposed update (for the yellow/red display). */
export function describeChanges(prev, next) {
  return TRACKED
    .filter((k) => next[k] != null && next[k] !== '' && next[k] !== prev[k])
    .map((k) => ({ field: k, from: prev[k], to: next[k] }));
}

/** Turn the flat event log into episodes (newest last). */
export function buildEpisodes(events) {
  const byId = new Map();
  for (const e of [...events].filter((x) => x.type === 'headache' && !x.deleted).sort(byOrder)) {
    if (!byId.has(e.episodeId)) byId.set(e.episodeId, []);
    byId.get(e.episodeId).push(e);
  }
  const out = [];
  for (const [id, list] of byId) {
    const start = list.find((x) => x.kind === 'start');
    if (!start) continue;
    const resolve = list.find((x) => x.kind === 'resolve');
    const current = {};
    const meds = [];
    const relief = [];
    const symptoms = new Set();
    let peak = 0;
    let changeCount = 0;
    for (const e of list) {
      for (const k of [...TRACKED, 'notes']) if (e[k] != null && e[k] !== '') current[k] = e[k];
      if (e.severity) peak = Math.max(peak, e.severity);
      if (e.kind === 'update') changeCount += 1;
      for (const m of e.meds ?? []) meds.push(m);
      for (const r of e.relief ?? []) if (!relief.includes(r)) relief.push(r);
      for (const s of e.symptoms ?? []) symptoms.add(s);
    }
    out.push({
      id, startMs: start.ms, endMs: resolve ? resolve.ms : null, active: !resolve,
      durationMs: resolve ? resolve.ms - start.ms : null, startDay: dayKey(start.ms),
      current, peakSeverity: peak, changeCount, meds, relief, symptoms: [...symptoms], timeline: list,
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

export function activeEpisode(events) {
  const live = buildEpisodes(events).filter((e) => e.active);
  return live.length ? live[live.length - 1] : null;
}
