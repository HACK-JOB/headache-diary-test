// Hydration logic: water totals, container sizes. Pure functions, no browser needed.
import { dayKey } from './time.js';

const STARTER_SIZES = [250, 500, 600, 750, 1000];
const MAX_ML = 10000; // anything above 10 L in one go is a typo

/** Turn what she typed into millilitres, or null if it is not a sensible volume. */
export function parseVolume(text, unit) {
  const n = Number(String(text).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const ml = String(unit).toLowerCase() === 'l' ? n * 1000 : n;
  if (ml > MAX_ML) return null;
  return Math.round(ml);
}

/** Total water (ml) for one Brisbane day. Other fluids (beverages) are counted separately. */
export function dayWaterTotal(events, key) {
  return events
    .filter((e) => e.type === 'water' && !e.deleted && dayKey(e.ms) === key)
    .reduce((sum, e) => sum + e.ml, 0);
}

/** The last 5 distinct container sizes used, most recent first, padded with starter sizes. */
export function recentSizes(events) {
  const sizes = [];
  const water = events.filter((e) => e.type === 'water' && !e.deleted).sort((a, b) => b.ms - a.ms);
  for (const e of water) {
    if (!sizes.includes(e.ml)) sizes.push(e.ml);
    if (sizes.length === 5) return sizes;
  }
  for (const s of STARTER_SIZES) {
    if (!sizes.includes(s)) sizes.push(s);
    if (sizes.length === 5) break;
  }
  return sizes;
}

/** Move a size to the front of a recent list, keeping five entries. */
export function addSizeToRecent(list, ml) {
  return [ml, ...list.filter((s) => s !== ml)].slice(0, 5);
}
