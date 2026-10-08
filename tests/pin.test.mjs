import test from 'node:test';
import assert from 'node:assert/strict';
import { validPinFormat, makeRecord, checkPin, afterFail, afterSuccess, lockedFor, unlockUntil, isUnlocked, FRESH_TRIES, MAX_FREE_TRIES, AUTO_LOCK_MS } from '../js/pin.js';

test('a PIN is 4 to 6 digits and nothing else', () => {
  for (const ok of ['1234', '123456', '0000']) assert.equal(validPinFormat(ok), true, ok);
  for (const bad of ['', '123', '1234567', '12a4', '12 34', ' 1234', 'abcd', null, undefined, 1234]) assert.equal(validPinFormat(bad), false, String(bad));
});

test('the stored record never contains the PIN, and is different each time', async () => {
  const a = await makeRecord('4821', 1000);
  const b = await makeRecord('4821', 1000);
  assert.ok(!JSON.stringify(a).includes('4821'));
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.equal(a.iter, 1000);
});

test('checkPin accepts the right PIN and rejects the wrong ones', async () => {
  const rec = await makeRecord('4821', 1000);
  assert.equal(await checkPin(rec, '4821'), true);
  assert.equal(await checkPin(rec, '4822'), false);
  assert.equal(await checkPin(rec, ''), false);
  assert.equal(await checkPin(rec, '48210'), false);
  assert.equal(await checkPin(null, '4821'), false);
});

test('makeRecord refuses a badly formed PIN', async () => {
  await assert.rejects(() => makeRecord('12', 1000), /PIN/);
});

test('the first few wrong tries cost nothing; then a wait that grows', () => {
  let t = { ...FRESH_TRIES };
  const now = 1_000_000;
  for (let i = 1; i < MAX_FREE_TRIES; i += 1) { t = afterFail(t, now); assert.equal(lockedFor(t, now), 0, `try ${i}`); }
  t = afterFail(t, now);                       // the fifth wrong try
  const first = lockedFor(t, now);
  assert.ok(first >= 30_000 && first <= 60_000, String(first));
  t = afterFail(t, now + first);               // wrong again right after the wait
  assert.ok(lockedFor(t, now + first) > first);
});

test('the wait never goes above 15 minutes, and ends by itself', () => {
  let t = { ...FRESH_TRIES };
  for (let i = 0; i < 30; i += 1) t = afterFail(t, 5_000);
  assert.ok(lockedFor(t, 5_000) <= 15 * 60_000);
  assert.equal(lockedFor(t, 5_000 + 15 * 60_000 + 1), 0);
});

test('a right PIN clears the count', () => {
  let t = FRESH_TRIES;
  for (let i = 0; i < 4; i += 1) t = afterFail(t, 1);
  assert.deepEqual(afterSuccess(), FRESH_TRIES);
});

test('unlocked lasts 5 minutes, then Admin locks itself', () => {
  const until = unlockUntil(1_000);
  assert.equal(until, 1_000 + AUTO_LOCK_MS);
  assert.equal(AUTO_LOCK_MS, 5 * 60_000);
  assert.equal(isUnlocked(until, 1_000 + 60_000), true);
  assert.equal(isUnlocked(until, until), false);
  assert.equal(isUnlocked(0, 1_000), false);
});
