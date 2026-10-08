// Food and drink log. Everything is derived from the event log:
//   { type: 'intake', mealType, name, kind: 'food'|'drink', servings, amountMl?, nutrition: {key: valuePerServing} }
//   { type: 'config', kind: 'visibility', item, shown }   which nutrients SHE can see (doctors always see all)
// "My foods" is not stored separately: it is the latest entry per name. Nothing is preset.
import { dayKey } from './time.js';
import { canonical } from './memory.js';
import { byTime } from './events.js';

export const MEAL_TYPES = ['Breakfast', 'Morning Tea', 'Lunch', 'Afternoon Tea', 'Dinner', 'Dessert', 'Snack', 'Beverages'];

export const NUTRIENTS = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'sugar', label: 'Sugar', unit: 'g' },
  { key: 'fibre', label: 'Fibre', unit: 'g' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'satFat', label: 'Saturated fat', unit: 'g' },
  { key: 'transFat', label: 'Trans fat', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'iron', label: 'Iron', unit: 'mg' },
  { key: 'caffeine', label: 'Caffeine', unit: 'mg' },
];
const KEYS = NUTRIENTS.map((x) => x.key);
const live = (events, type) => events.filter((e) => e.type === type && !e.deleted).sort(byTime);

/** Entered values -> per-serving numbers. `basis` is 'serving' or 'total'. Blank = not known, dropped. Throws on nonsense. */
export function perServing(raw, basis, servings) {
  const out = {};
  const bad = [];
  const s = Number(servings) > 0 ? Number(servings) : 1;
  for (const k of KEYS) {
    const text = raw?.[k];
    if (text === undefined || text === null || String(text).trim() === '') continue;
    const v = Number(String(text).trim().replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) { bad.push(k); continue; }
    out[k] = Math.round((basis === 'total' ? v / s : v) * 100) / 100;
  }
  if (bad.length) throw new Error(`Check these numbers: ${bad.join(', ')}`);
  return out;
}

export function validateIntake(f) {
  const bad = [];
  if (!MEAL_TYPES.includes(f?.mealType)) bad.push('mealType');
  if (!canonical(f?.name)) bad.push('name');
  if (f?.servings !== undefined && !(Number(f.servings) > 0)) bad.push('servings');
  if (f?.mealType === 'Beverages' && !(Number(f.amountMl) > 0)) bad.push('amount');
  return bad;
}

/* ---------- My foods ---------- */
export function myFoods(events) {
  const map = new Map();
  for (const e of live(events, 'intake')) {
    const name = canonical(e.name);
    if (!name) continue;
    const k = name.toLowerCase();
    const row = map.get(k) ?? { count: 0 };
    map.set(k, { ...row, name, mealType: e.mealType, kind: e.kind, amountMl: e.amountMl, nutrition: e.nutrition ?? {}, last: e.ms, count: row.count + 1, ...((e.barcode ?? row.barcode) ? { barcode: e.barcode ?? row.barcode } : {}) });
  }
  return [...map.values()];
}

/** Her five most-used foods on this tile. */
export function commonFoods(events, mealType) {
  return myFoods(events).filter((f) => f.mealType === mealType)
    .sort((a, b) => b.count - a.count || b.last - a.last).slice(0, 5).map((f) => f.name);
}

/** Her five most-used foods overall (any tile), each with the tile she usually has it on. Nothing is preset. */
export function topFoods(events, n = 5) {
  return myFoods(events).sort((a, b) => b.count - a.count || b.last - a.last).slice(0, n)
    .map((f) => ({ name: f.name, mealType: f.mealType, count: f.count }));
}

/** Past foods that contain the typed text. This tile's foods come first, then the rest. */
export function suggestFoods(events, mealType, text) {
  const q = canonical(text).toLowerCase();
  if (!q) return [];
  return myFoods(events).filter((f) => f.name.toLowerCase().includes(q))
    .sort((a, b) => (b.mealType === mealType) - (a.mealType === mealType) || b.count - a.count || b.last - a.last);
}

/* ---------- Totals ---------- */
export function dayIntake(events, key) {
  const items = live(events, 'intake').filter((e) => dayKey(e.ms) === key);
  const totals = {};
  for (const n of NUTRIENTS) totals[n.key] = { value: 0, known: 0, of: items.length };
  let drinkMl = 0;
  for (const e of items) {
    const s = Number(e.servings) > 0 ? Number(e.servings) : 1;
    for (const k of KEYS) {
      const v = e.nutrition?.[k];
      if (typeof v === 'number') { totals[k].value += v * s; totals[k].known += 1; }
    }
    if (e.kind === 'drink' && e.amountMl) drinkMl += e.amountMl * s;
  }
  for (const k of KEYS) totals[k].value = Math.round(totals[k].value * 100) / 100;
  return { key, items, totals, drinkMl };
}

/* ---------- What she is allowed to see ---------- */
export function visibilityEvent(item, shown) {
  if (!KEYS.includes(item)) throw new Error(`Unknown item: ${item}`);
  return { type: 'config', kind: 'visibility', item, shown: !!shown };
}
export function visibility(events) {
  const out = Object.fromEntries(KEYS.map((k) => [k, true]));
  for (const e of live(events, 'config')) if (e.kind === 'visibility' && e.item in out) out[e.item] = e.shown;
  return out;
}
export const visibleNutrients = (events) => { const v = visibility(events); return NUTRIENTS.filter((n) => v[n.key]); };
export function visibilityLog(events) {
  return live(events, 'config').filter((e) => e.kind === 'visibility').reverse().map((e) => ({ item: e.item, shown: e.shown, ms: e.ms }));
}
