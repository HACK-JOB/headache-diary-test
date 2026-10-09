import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, ruleEvent, ruleFor, gate, NO_REASON } from '../js/editrules.js';

let ms = 1000;
const ev = (action, v) => ({ id: `r${ms}`, ms: ms++, ...ruleEvent(action, v) });

test('every action that asks for a reason today has a rule', () => {
  assert.deepEqual(ACTIONS.map((a) => a.key), ['undo', 'food', 'reading', 'dose', 'rxend', 'doctor']);
  for (const a of ACTIONS) assert.ok(a.label && a.what, a.key);
});

test('by default everything is allowed and asks for a reason', () => {
  for (const a of ACTIONS) assert.deepEqual(ruleFor([], a.key), { allowed: true, reason: true });
});

test('the latest setting for an action wins, and others are untouched', () => {
  const events = [ev('food', { allowed: false, reason: true }), ev('reading', { allowed: true, reason: false }), ev('food', { allowed: true, reason: false })];
  assert.deepEqual(ruleFor(events, 'food'), { allowed: true, reason: false });
  assert.deepEqual(ruleFor(events, 'reading'), { allowed: true, reason: false });
  assert.deepEqual(ruleFor(events, 'undo'), { allowed: true, reason: true });
});

test('ruleEvent refuses unknown actions and records a config entry', () => {
  assert.equal(ruleEvent('nope', { allowed: true, reason: true }), null);
  assert.deepEqual(ruleEvent('food', { allowed: false, reason: true }), { type: 'config', kind: 'edit-rule', action: 'food', allowed: false, reason: true });
});

test('gate: not allowed stops the action and says why', () => {
  const g = gate([ev('food', { allowed: false, reason: true })], 'food');
  assert.equal(g.ok, false);
  assert.match(g.message, /turned off/i);
});

test('gate: allowed with a reason asks for one; allowed without just confirms', () => {
  assert.deepEqual(gate([], 'food'), { ok: true, askReason: true });
  assert.deepEqual(gate([ev('food', { allowed: true, reason: false })], 'food'), { ok: true, askReason: false });
  assert.equal(typeof NO_REASON, 'string');
});

test('a deleted rule entry is ignored', () => {
  const e = { ...ev('food', { allowed: false, reason: true }), deleted: true };
  assert.equal(ruleFor([e], 'food').allowed, true);
});
