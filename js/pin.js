// Admin PIN: a convenience lock, not real security. The PIN is never stored, only a salted PBKDF2 hash.
// There is deliberately no "forgot PIN" in v1. Wrong tries slow down (and cannot be skipped by reloading,
// because the count is kept in storage).
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const MAX_FREE_TRIES = 5;
export const AUTO_LOCK_MS = 5 * 60_000;
const MAX_WAIT_MS = 15 * 60_000;
export const FRESH_TRIES = Object.freeze({ fails: 0, until: 0 });
export const DEFAULT_ITER = 150_000;

export const validPinFormat = (pin) => typeof pin === 'string' && /^\d{4,6}$/.test(pin);

async function derive(pin, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
}

export async function makeRecord(pin, iter = DEFAULT_ITER) {
  if (!validPinFormat(pin)) throw new Error('A PIN must be 4 to 6 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { v: 1, iter, salt: b64(salt), hash: b64(await derive(pin, salt, iter)) };
}

export async function checkPin(record, pin) {
  if (!record || !validPinFormat(pin)) return false;
  const got = new Uint8Array(await derive(pin, unb64(record.salt), record.iter));
  const want = unb64(record.hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i += 1) diff |= got[i] ^ want[i];
  return diff === 0;
}

/** Five wrong tries are free; from the fifth on she waits 30 s, then double each time, up to 15 minutes. */
export function afterFail(tries, now) {
  const fails = (tries?.fails ?? 0) + 1;
  if (fails < MAX_FREE_TRIES) return { fails, until: 0 };
  const wait = Math.min(MAX_WAIT_MS, 30_000 * 2 ** (fails - MAX_FREE_TRIES));
  return { fails, until: now + wait };
}
export const afterSuccess = () => ({ ...FRESH_TRIES });
export const lockedFor = (tries, now) => Math.max(0, (tries?.until ?? 0) - now);

export const unlockUntil = (now) => now + AUTO_LOCK_MS;
export const isUnlocked = (until, now) => !!until && now < until;
