// Barcode lookup helpers (pure). The camera and network parts live in barcode-ui.js.
// Only the barcode NUMBER is ever sent out, to Open Food Facts. Nothing from the diary leaves the tablet.
import { myFoods } from './intake.js';

/** Keep digits only; accept 8, 12, 13 or 14 digits with a correct check digit, otherwise ''. */
export function cleanBarcode(text) {
  if (typeof text !== 'string' && typeof text !== 'number') return '';
  const d = String(text).replace(/\s+/g, '');
  if (!/^\d+$/.test(d) || ![8, 12, 13, 14].includes(d.length)) return '';
  const body = d.slice(0, -1).split('').reverse().map(Number);
  const sum = body.reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(d.slice(-1)) ? d : '';
}

const FIELDS = 'code,product_name,brands,quantity,serving_size,serving_quantity,nutriments';
export const offUrl = (code) => `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`;

// [our key, Open Food Facts name, multiplier to our unit, largest believable value per serving, "0 means not declared"]
const MAP = [
  ['calories', 'energy-kcal', 1, 5000, false],
  ['carbs', 'carbohydrates', 1, 1000, false],
  ['sugar', 'sugars', 1, 1000, false],
  ['fibre', 'fiber', 1, 1000, false],
  ['protein', 'proteins', 1, 1000, false],
  ['fat', 'fat', 1, 1000, false],
  ['satFat', 'saturated-fat', 1, 1000, false],
  ['transFat', 'trans-fat', 1, 1000, false],
  ['sodium', 'sodium', 1000, 20000, false],     // grams -> milligrams
  ['iron', 'iron', 1000, 200, true],            // grams -> milligrams; 0 is almost always "not printed"
  ['caffeine', 'caffeine', 1000, 2000, true],
];
const round2 = (v) => Math.round(v * 100) / 100;
const num = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);

export function tidyName(text) {
  const t = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  if (t && t === t.toUpperCase() && /[A-Z]/.test(t)) return t.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  return t;
}

/** Open Food Facts answer -> what the meal form needs. Blank stays blank; nothing is guessed. */
export function fromOff(json) {
  const p = json && json.status === 1 && json.product && typeof json.product === 'object' ? json.product : null;
  if (!p) return { found: false };
  const n = p.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {};
  const grams = num(p.serving_quantity);
  const nutrition = {};
  let fromServing = false, from100 = false;
  for (const [key, off, mult, max, zeroUnknown] of MAP) {
    let v = num(n[`${off}_serving`]);
    if (Number.isFinite(v)) fromServing = true;
    else if (grams > 0 && Number.isFinite(num(n[`${off}_100g`]))) { v = (num(n[`${off}_100g`]) * grams) / 100; from100 = true; }
    else continue;
    v *= mult;
    if (!Number.isFinite(v) || v < 0 || v > max || (zeroUnknown && v === 0)) continue;
    nutrition[key] = key === 'calories' ? Math.round(v) : round2(v);
  }
  const hasPer100Only = !fromServing && !from100 && MAP.some(([, off]) => Number.isFinite(num(n[`${off}_100g`])));
  const brand = typeof p.brands === 'string' ? p.brands.split(',')[0].trim() : '';
  return {
    found: true,
    name: tidyName(p.product_name),
    brand,
    servingText: typeof p.serving_size === 'string' ? p.serving_size.trim() : '',
    basis: Object.keys(nutrition).length ? 'serving' : (hasPer100Only ? 'none' : 'serving'),
    nutrition,
  };
}

/** What gets stored with a meal so a doctor can see where the numbers came from. */
export function provenance({ barcode, scanned, nutrition }) {
  if (!barcode) return {};
  const a = scanned ?? {}, b = nutrition ?? {};
  if (!Object.keys(a).length) return { barcode };
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const edited = [...keys].some((k) => a[k] !== b[k]);
  return { source: 'barcode', barcode, edited };
}

export function sourceNote(e) {
  if (!e || e.source !== 'barcode' || !e.barcode) return '';
  return `From barcode ${e.barcode}` + (e.edited ? ', values changed after scanning' : '');
}

/** A food saved before with this barcode (latest numbers win). Checked before any internet lookup. */
export function findByBarcode(events, code) {
  return myFoods(events).find((f) => f.barcode === code) ?? null;
}

const MESSAGES = {
  found: 'Found. Please check the numbers against the pack before saving.',
  notfound: 'This product is not in the food database. The name and numbers can be typed in once and will be remembered with this barcode.',
  offline: 'No internet connection, so the product could not be looked up. The name and numbers can be typed in instead.',
  badcode: 'That barcode number does not look right. Please check the digits.',
  nocamera: 'This tablet cannot scan with the camera here. The barcode number can be typed in instead.',
  denied: 'Camera permission was not given. The barcode number can be typed in instead.',
  busy: 'The food database is busy right now. Please try again in a moment, or type the details in.',
  nonumbers: 'The product was found but it has no nutrition numbers. They can be typed in from the pack.',
  per100: 'The product only lists numbers per 100 g, with no serving size. They can be typed in from the pack.',
};
export const scanMessage = (k) => MESSAGES[k] ?? '';

/* ---------- barcode + printed number cross-check ---------- */
export const GRACE_MS = 2500;   // after one of the two is read, how long to keep looking for the other

/** Valid barcode numbers found in text read off the pack (spaces inside the number are allowed). */
export function printedNumbers(lines) {
  const out = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    for (const m of String(line ?? '').matchAll(/\d(?: ?\d){7,13}/g)) {
      const c = cleanBarcode(m[0].replace(/ /g, ''));
      if (c && !out.includes(c)) out.push(c);
    }
  }
  return out;
}

/** Equal once padded to 14 digits, so a 12-digit UPC-A matches its 13-digit form with a leading zero. */
export const sameCode = (a, b) => !!a && !!b && String(a).padStart(14, '0') === String(b).padStart(14, '0');

/** What to do with what the camera has read so far. `ocr` is whether this tablet can read printed digits at all. */
export function scanDecision({ barcodes = [], numbers = [], ocr = false, waitedMs = 0 }) {
  const b = barcodes[0];
  if (b && numbers.some((n) => sameCode(n, b))) return { done: true, kind: 'both', code: b };
  if (b && !ocr) return { done: true, kind: 'barcode', code: b };
  if (waitedMs < GRACE_MS) return { done: false };
  if (b) return { done: true, kind: numbers.length ? 'mismatch' : 'barcode', code: b };
  if (numbers.length) return { done: true, kind: 'number', code: numbers[0] };
  return { done: false };
}

const CHECKS = {
  both: { ok: true, text: 'The barcode and the printed number match.' },
  barcode: { ok: false, text: 'Only the barcode was read, with no printed number to check it against. Please check the product matches the description on the pack.' },
  number: { ok: false, text: 'Only the printed number was read, with no barcode to check it against. Please check the product matches the description on the pack.' },
  typed: { ok: false, text: 'The number was typed in, so there was no barcode to check it against. Please check the product matches the description on the pack.' },
  mismatch: { ok: false, text: 'The barcode and the printed number do not match. Please check the product matches the description on the pack.' },
};
export const checkNote = (kind) => CHECKS[kind] ?? { ok: false, text: '' };
