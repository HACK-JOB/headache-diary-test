// Doctors: accounts, targets, doctor-written content and the change log. All derived from the event log.
//   { type:'doctor',   kind:'add'|'pin'|'remove', doctorId, name?, role?, pin?, by }
//   { type:'clinical', kind:'target', key, min, max, margin, by }
//   { type:'clinical', kind:'relief', headacheType, text, by }
//   { type:'clinical', kind:'urgent', threshold, text, by }     (used by the glucose slice)
//   { type:'clinical', kind:'fasting', on, by }                 (used by the glucose slice)
//   { type:'clinical', kind:'note', text, by }
// The app never writes medical content itself: every word here comes from a named doctor.
import { NUTRIENTS } from './intake.js';
import { byTime } from './events.js';
import { dayIntake } from './intake.js';
import { TYPES } from './episodes.js';
import { dayWaterTotal } from './hydration.js';
import { rxChanges } from './prescriptions.js';

export const DEFAULT_MARGIN = 20;
export const MAX_MARGIN = 50;
export const TARGET_KEYS = [{ key: 'fluid', label: 'Fluid (all drinks)', unit: 'ml' }, { key: 'glucose', label: 'Blood glucose (each reading)', unit: 'mmol/L' }, ...NUTRIENTS];

const live = (events, type) => events.filter((e) => e.type === type && !e.deleted).sort(byTime);
const FAMILY = 'Family admin';
const OPEN = 'Open access (no PIN set)';

export function validateDoctor(f) {
  const errors = [];
  if (!String(f?.name ?? '').trim()) errors.push('name');
  if (!String(f?.role ?? '').trim()) errors.push('role');
  return errors;
}

/** Current doctors in the order they were added. Latest PIN wins; removed doctors are gone. */
export function doctors(events) {
  const map = new Map();
  for (const e of live(events, 'doctor')) {
    if (e.kind === 'add') map.set(e.doctorId, { id: e.doctorId, name: String(e.name).trim(), role: String(e.role).trim(), pin: e.pin ?? null, addedMs: e.ms });
    else if (e.kind === 'pin' && map.has(e.doctorId)) map.get(e.doctorId).pin = e.pin ?? null;
    else if (e.kind === 'remove') map.delete(e.doctorId);
  }
  return [...map.values()];
}

/** The Doctors tab is open to anyone until at least one doctor has a PIN. */
export const needsLogin = (events) => doctors(events).some((d) => !!d.pin);

const nameOf = (events, id) => {
  if (id === 'setup' || id === 'admin') return FAMILY;
  if (id === 'open') return OPEN;
  // include removed doctors so old entries keep their author
  let name = null;
  for (const e of live(events, 'doctor')) if (e.kind === 'add' && e.doctorId === id) name = String(e.name).trim();
  return name ?? 'A doctor';
};

const num = (text) => {
  const t = String(text ?? '').trim();
  if (t === '') return { blank: true };
  const v = Number(t.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? { v } : { bad: true };
};

/** Doctor-typed text -> numbers. Blank min and max are fine (that clears the target). */
export function validateTarget(raw) {
  const errors = [];
  const lo = num(raw?.min); const hi = num(raw?.max); const mg = num(raw?.margin);
  if (lo.bad) errors.push('min');
  if (hi.bad) errors.push('max');
  if (!lo.bad && !hi.bad && !lo.blank && !hi.blank && lo.v > hi.v) errors.push('max');
  if (mg.bad || (!mg.blank && mg.v > MAX_MARGIN)) errors.push('margin');
  return {
    errors,
    value: { min: lo.blank || lo.bad ? null : lo.v, max: hi.blank || hi.bad ? null : hi.v, margin: mg.blank || mg.bad ? DEFAULT_MARGIN : mg.v },
  };
}

/** Latest target per item. A target with no min and no max is "cleared". */
export function targets(events) {
  const out = {};
  for (const e of live(events, 'clinical')) {
    if (e.kind !== 'target') continue;
    if (e.min == null && e.max == null) delete out[e.key];
    else out[e.key] = { min: e.min ?? null, max: e.max ?? null, margin: e.margin ?? DEFAULT_MARGIN, by: e.by, ms: e.ms };
  }
  return out;
}

const WORDS = { in: 'In range', near: 'Near the limit', over: 'Over the limit', under: 'Under the minimum', none: '' };
const res = (status) => ({ status, word: WORDS[status] });

/**
 * Colour/word for a total against a doctor's target. No target = neutral, no word.
 * While the day is still running (opts.running) she cannot be "under" yet, so the minimum is ignored.
 */
export function statusFor(value, target, opts = {}) {
  if (!target || (target.min == null && target.max == null)) return res('none');
  const m = (target.margin ?? DEFAULT_MARGIN) / 100;
  const { min, max } = target;
  if (max != null) {
    if (value > max) return res('over');
    if (value >= max * (1 - m)) return res('near');
  }
  if (opts.running) return max == null ? res('none') : res('in');
  if (min != null) {
    if (value < min) return res('under');
    if (value <= min * (1 + m)) return res('near');
  }
  return res('in');
}

export function reliefFor(events, headacheType) {
  let found = null;
  for (const e of live(events, 'clinical')) if (e.kind === 'relief' && e.headacheType === headacheType) found = e;
  if (!found || !String(found.text ?? '').trim()) return null;
  return { text: String(found.text).trim(), by: found.by, byName: nameOf(events, found.by), ms: found.ms };
}

export function urgentGlucose(events) {
  let found = null;
  for (const e of live(events, 'clinical')) if (e.kind === 'urgent') found = e;
  if (!found || (found.threshold == null && !String(found.text ?? '').trim())) return null;
  return { threshold: found.threshold, text: found.text, by: found.by, ms: found.ms };
}

export function fasting(events) {
  let on = false;
  for (const e of live(events, 'clinical')) if (e.kind === 'fasting') on = !!e.on;
  return on;
}

export function notes(events) {
  return live(events, 'clinical').filter((e) => e.kind === 'note' && String(e.text ?? '').trim())
    .map((e) => ({ text: String(e.text).trim(), by: e.by, byName: nameOf(events, e.by), ms: e.ms })).reverse();
}

const human = (k) => String(k).replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()).trim();
const keyInfo = (key) => TARGET_KEYS.find((k) => k.key === key) ?? { label: human(key), unit: '' };

export function describeTarget(t, unit) {
  if (!t || (t.min == null && t.max == null)) return 'not set';
  const u = unit ? ` ${unit}` : '';
  const core = t.min != null && t.max != null ? `${t.min} to ${t.max}${u}` : t.max != null ? `up to ${t.max}${u}` : `at least ${t.min}${u}`;
  return `${core} (margin ${t.margin ?? DEFAULT_MARGIN}%)`;
}

/** Everything a doctor or the family admin changed, newest first. Never contains a PIN or hash. */
export function changeLog(events) {
  const out = [];
  const lastTarget = {};
  const lastText = {};
  const lastRx = {};
  const push = (e, what, from, to) => out.push({ ms: e.ms, by: e.by, byName: nameOf(events, e.by), what, from, to });
  const all = events.filter((e) => (e.type === 'doctor' || e.type === 'clinical') && !e.deleted).sort(byTime);
  for (const e of all) {
    if (e.type === 'doctor') {
      if (e.kind === 'add') push(e, `Added doctor ${String(e.name).trim()} (${String(e.role).trim()})`, '', '');
      else if (e.kind === 'pin') push(e, `Changed the PIN for ${nameOf(events, e.doctorId)}`, '', '');
      else if (e.kind === 'remove') push(e, `Removed doctor ${nameOf(events, e.doctorId)}`, '', '');
    } else if (e.kind === 'target') {
      const info = keyInfo(e.key);
      const to = { min: e.min ?? null, max: e.max ?? null, margin: e.margin };
      push(e, `${info.label} target`, describeTarget(lastTarget[e.key], info.unit), describeTarget(to, info.unit));
      lastTarget[e.key] = to;
    } else if (e.kind === 'relief') {
      const k = `relief:${e.headacheType}`;
      push(e, `Relief text for ${human(e.headacheType)}`, lastText[k] ? 'written' : 'not set', String(e.text ?? '').trim() ? 'written' : 'cleared');
      lastText[k] = String(e.text ?? '').trim();
    } else if (e.kind === 'urgent') {
      push(e, 'Urgent glucose message', lastText.urgent ?? 'not set', e.threshold != null ? `below ${e.threshold}` : 'cleared');
      lastText.urgent = e.threshold != null ? `below ${e.threshold}` : null;
    } else if (e.kind === 'fasting') {
      push(e, 'Fasting tags', lastText.fasting ?? 'off', e.on ? 'on' : 'off');
      lastText.fasting = e.on ? 'on' : 'off';
    } else if (e.kind === 'note') {
      push(e, 'Added a clinical note', '', '');
    } else if (e.kind === 'rx') {
      const prev = lastRx[e.rxId];
      if (!prev) push(e, `Added prescription ${String(e.name).trim()} (${String(e.dose).trim()})`, '', '');
      else {
        if (prev.status !== (e.status ?? 'active')) push(e, `${e.name}: status`, prev.status, e.status ?? 'active');
        for (const c of rxChanges(prev, e)) push(e, `${e.name}: ${c.what}`, c.from, c.to);
      }
      lastRx[e.rxId] = { ...e, status: e.status ?? 'active' };
    }
  }
  return out.reverse();
}

/** A shape or sign for each status, so colour is never the only cue. */
export const STATUS_MARK = { in: '✓', near: '!', over: '▲', under: '▼', none: '' };

/**
 * Today's totals against the doctors' targets. Only items that have a target appear.
 * Fluid = water refills + every drink logged in the meal log. An item nobody has logged yet gets no status.
 */
export function dayStatuses(events, key, opts = {}) {
  const tg = targets(events);
  const day = dayIntake(events, key);
  const out = {};
  for (const k of Object.keys(tg)) {
    let value; let known = true;
    if (k === 'fluid') value = dayWaterTotal(events, key) + day.drinkMl;
    else { const t = day.totals[k]; known = !!t && t.known > 0; value = t?.value ?? 0; }
    if (!known) continue;
    const r = statusFor(value, tg[k], opts);
    if (r.status === 'none') continue;
    out[k] = { ...r, mark: STATUS_MARK[r.status], value, target: tg[k] };
  }
  return out;
}

export const RELIEF_MAX = 600;
export const URGENT_MAX = 300;

/** The headache types a doctor can write relief text for, in the app's own order. */
export const reliefTypes = () => Object.entries(TYPES).map(([key, t]) => ({ key, name: t.name }));

export function validateRelief(text) {
  const t = String(text ?? '').trim();
  return { errors: t.length > RELIEF_MAX ? ['text'] : [], text: t };
}

/** Urgent glucose message: a threshold (mmol/L) and the doctor's own words. Both blank = none. */
export function validateUrgent(f) {
  const errors = [];
  const rawT = String(f?.threshold ?? '').trim().replace(',', '.');
  const wording = String(f?.text ?? '').trim();
  let threshold = null;
  if (rawT !== '') { const v = Number(rawT); if (!Number.isFinite(v) || v <= 0) errors.push('threshold'); else threshold = v; }
  if (threshold !== null && !wording) errors.push('text');
  if (threshold === null && wording && !errors.includes('threshold')) errors.push('threshold');
  if (wording.length > URGENT_MAX) errors.push('text');
  return { errors, value: { threshold, text: wording } };
}

/** The doctor's urgent wording if a glucose reading is below their threshold, otherwise null. */
export function urgentFor(events, reading) {
  const u = urgentGlucose(events);
  if (!u || u.threshold == null || !String(u.text ?? '').trim()) return null;
  if (!(reading < u.threshold)) return null;
  return { text: String(u.text).trim(), threshold: u.threshold, by: u.by, byName: nameOf(events, u.by) };
}
