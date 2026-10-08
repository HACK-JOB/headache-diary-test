import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRx, prescriptions, dosesFor, NAGS, FOOD, weekdayOf, describeRx, rxChanges, effectiveNag, doseSummary } from '../js/prescriptions.js';
import { changeLog } from '../js/doctors.js';

const at = (key, hhmm) => { const [y, mo, d] = key.split('-').map(Number); const [h, m] = hhmm.split(':').map(Number); return Date.UTC(y, mo - 1, d, h - 10, m); };
const DAY = '2026-10-08';           // a Thursday
const slot = (start, end) => ({ mode: 'range', start, end });          // a range the doctor gave
const exact = (atT) => ({ mode: 'exact', at: atT });                    // an exact time the doctor gave
const base = { name: 'Metformin', dose: '500 mg', food: 'with', days: 'daily', slots: [exact('08:00')], instructions: 'Swallow whole.', nag: '' };
let seq = 0;
const ev = (e) => ({ id: 'e' + (++seq), ms: at(DAY, '06:00') + seq, deleted: false, ...e });
const rx = (over = {}, rxId = 'r1') => ev({ type: 'clinical', kind: 'rx', rxId, status: 'active', by: 'open', ...base, ...over });
const ans = (action, hhmm, over = {}) => ev({ type: 'dose', rxId: 'r1', slot: 0, forDay: DAY, action, ms: at(DAY, hhmm), ...over });

test('validateRx accepts a normal prescription and trims text', () => {
  const r = validateRx({ ...base, name: '  Metformin ', dose: ' 500 mg ' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.value.name, 'Metformin');
  assert.equal(r.value.dose, '500 mg');
});

test('validateRx asks for name, dose, days and 1-4 sensible time slots', () => {
  assert.ok(validateRx({ ...base, name: '' }).errors.includes('name'));
  assert.ok(validateRx({ ...base, dose: '  ' }).errors.includes('dose'));
  assert.ok(validateRx({ ...base, days: [] }).errors.includes('days'));
  assert.ok(validateRx({ ...base, slots: [] }).errors.includes('slots'));
  assert.ok(validateRx({ ...base, slots: ['06:00', '08:00', '10:00', '12:00', '14:00'].map(exact) }).errors.includes('slots'));
  assert.ok(validateRx({ ...base, slots: [slot('09:00', '07:00')] }).errors.includes('slots'));       // range ends before it starts
  assert.ok(validateRx({ ...base, slots: [slot('09:00', '09:00')] }).errors.includes('slots'));
  assert.ok(validateRx({ ...base, slots: [exact('')] }).errors.includes('slots'));
  assert.ok(validateRx({ ...base, slots: [slot('07:00', '')] }).errors.includes('slots'));
  assert.deepEqual(validateRx({ ...base, slots: [exact('08:00'), slot('12:00', '14:00')] }).errors, []);
});

test('validateRx rejects overlapping windows and bad food/nag/length values', () => {
  assert.ok(validateRx({ ...base, slots: [slot('07:00', '09:00'), slot('08:30', '12:00')] }).errors.includes('slots'));
  assert.ok(validateRx({ ...base, slots: [slot('07:00', '09:00'), exact('08:00')] }).errors.includes('slots'));   // exact time inside a range
  assert.ok(validateRx({ ...base, slots: [exact('08:00'), exact('08:00')] }).errors.includes('slots'));
  assert.ok(validateRx({ ...base, food: 'banana' }).errors.includes('food'));
  assert.ok(validateRx({ ...base, nag: 'loud' }).errors.includes('nag'));
  assert.ok(validateRx({ ...base, instructions: 'x'.repeat(401) }).errors.includes('instructions'));
  assert.ok(validateRx({ ...base, name: 'x'.repeat(61) }).errors.includes('name'));
});

test('slots are sorted by time and chosen days are kept as sorted weekday numbers', () => {
  const r = validateRx({ ...base, days: [4, 1, 1, 3], slots: [exact('19:00'), exact('08:00')] });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.days, [1, 3, 4]);
  assert.equal(r.value.slots[0].at, '08:00');
  assert.deepEqual(validateRx({ ...base, slots: [{ mode: 'range', start: '07:00', end: '09:00', at: '08:00' }] }).value.slots, [{ mode: 'range', start: '07:00', end: '09:00' }]);   // a range keeps no exact time
  assert.deepEqual(validateRx({ ...base, slots: [{ mode: 'exact', at: '08:00', start: '07:00', end: '09:00' }] }).value.slots, [{ mode: 'exact', at: '08:00' }]);
});

test('weekdayOf gives Sunday = 0 for a Brisbane calendar day', () => {
  assert.equal(weekdayOf('2026-10-08'), 4);
  assert.equal(weekdayOf('2026-10-11'), 0);
});

test('prescriptions: the latest saved version of each wins; status is respected', () => {
  const evs = [rx({ dose: '500 mg' }), rx({ dose: '1000 mg' }), rx({ name: 'Statin', dose: '20 mg' }, 'r2'), rx({ status: 'paused' }, 'r2')];
  const list = prescriptions(evs);
  assert.equal(list.length, 2);
  assert.equal(list.find((p) => p.rxId === 'r1').dose, '1000 mg');
  assert.equal(list.find((p) => p.rxId === 'r2').status, 'paused');
});

test('dosesFor lists doses only for active prescriptions on a chosen weekday', () => {
  const evs = [rx({ days: [4] }), rx({ name: 'Mon only', days: [1] }, 'r2'), rx({ name: 'Paused', status: 'paused' }, 'r3'), rx({ name: 'Ended', status: 'ended' }, 'r4')];
  const list = dosesFor(evs, DAY, at(DAY, '06:00'));
  assert.deepEqual(list.map((d) => d.name), ['Metformin']);
  assert.equal(list[0].slot, 0);
  assert.equal(list[0].atMs, at(DAY, '08:00'));
});

test('doses are ordered by time and a medicine with two slots gives two doses', () => {
  const evs = [rx({ name: 'Twice', slots: [exact('08:00'), slot('18:00', '20:00')] }, 'r1'), rx({ name: 'Noon', slots: [exact('12:00')] }, 'r2')];
  const list = dosesFor(evs, DAY, at(DAY, '06:00'));
  assert.deepEqual(list.map((d) => `${d.name}${d.slot}`), ['Twice0', 'Noon0', 'Twice1']);
});

test('dose state: upcoming, due, overdue; then taken / late / skipped once answered', () => {
  const state = (now, extra = []) => dosesFor([rx({ slots: [slot('07:00', '09:00')] }), ...extra], DAY, now)[0];
  assert.equal(state(at(DAY, '06:30')).state, 'upcoming');
  assert.equal(state(at(DAY, '07:00')).state, 'due');
  assert.equal(state(at(DAY, '09:00')).state, 'due');
  assert.equal(state(at(DAY, '09:01')).state, 'overdue');
  assert.equal(state(at(DAY, '10:00'), [ans('taken', '08:05')]).state, 'taken');
  assert.equal(state(at(DAY, '10:00'), [ans('taken', '09:40')]).state, 'late');
  assert.equal(state(at(DAY, '10:00'), [ans('taken', '06:50')]).state, 'taken');
  assert.equal(state(at(DAY, '10:00'), [ans('skipped', '09:30')]).state, 'skipped');
  assert.equal(state(at(DAY, '10:00'), [ans('taken', '08:05')]).answeredMs, at(DAY, '08:05'));
});

test('an exact time is due from that minute and counts as overdue one hour later; the doctor\'s time is kept as given', () => {
  const at8 = (now, extra = []) => dosesFor([rx({ slots: [exact('08:00')] }), ...extra], DAY, now)[0];
  assert.equal(at8(at(DAY, '07:59')).state, 'upcoming');
  assert.equal(at8(at(DAY, '08:00')).state, 'due');
  assert.equal(at8(at(DAY, '09:00')).state, 'due');
  assert.equal(at8(at(DAY, '09:01')).state, 'overdue');
  assert.equal(at8(at(DAY, '10:00'), [ans('taken', '09:30')]).state, 'late');
  const d = at8(at(DAY, '08:00'));
  assert.equal(d.mode, 'exact');
  assert.equal(d.atMs, at(DAY, '08:00'));
  assert.equal(d.startMs, at(DAY, '08:00'));
  const rng = dosesFor([rx({ slots: [slot('07:00', '09:00')] })], DAY, at(DAY, '08:00'))[0];
  assert.equal(rng.mode, 'range');
  assert.equal(rng.startMs, at(DAY, '07:00'));
  assert.equal(rng.endMs, at(DAY, '09:00'));
});

test('an exact time never runs into the next time: its overdue point stops one minute before it; the last one cannot pass midnight', () => {
  const two = dosesFor([rx({ slots: [exact('08:00'), exact('08:30')] })], DAY, at(DAY, '08:45'));
  assert.equal(two[0].state, 'overdue');
  assert.equal(two[1].state, 'due');
  const late = dosesFor([rx({ slots: [exact('23:30')] })], DAY, at(DAY, '23:59'))[0];
  assert.equal(late.state, 'due');
});

test('a removed answer reopens the dose; the newest answer wins', () => {
  const a1 = ans('skipped', '08:00'); const a2 = ans('taken', '08:10');
  assert.equal(dosesFor([rx(), a1, a2], DAY, at(DAY, '08:20'))[0].state, 'taken');
  assert.equal(dosesFor([rx(), a1, { ...a2, deleted: true }], DAY, at(DAY, '08:20'))[0].state, 'skipped');
  assert.equal(dosesFor([rx(), { ...a1, deleted: true }, { ...a2, deleted: true }], DAY, at(DAY, '08:20'))[0].state, 'due');
});

test('answers belong to a day and a slot', () => {
  const yest = ans('taken', '08:00', { forDay: '2026-10-07', ms: at('2026-10-07', '08:00') });
  assert.equal(dosesFor([rx(), yest], DAY, at(DAY, '08:00'))[0].state, 'due');
  assert.equal(dosesFor([rx(), ans('taken', '08:00', { slot: 1 })], DAY, at(DAY, '08:00'))[0].state, 'due');
});

test('a prescription edited after an answer keeps the answer by rx id and slot', () => {
  const list = dosesFor([rx(), rx({ dose: '1000 mg' }), ans('taken', '08:00')], DAY, at(DAY, '10:00'));
  assert.equal(list[0].dose, '1000 mg');
  assert.equal(list[0].state, 'taken');
});

test('a prescription only counts from the day it was written', () => {
  const written = rx({ ms: at(DAY, '07:30') });
  assert.equal(dosesFor([written], '2026-10-07', at(DAY, '12:00')).length, 0);
  assert.equal(dosesFor([written], DAY, at(DAY, '12:00')).length, 1);
});

test('effectiveNag: the doctor\'s level on a prescription is fixed; empty uses her level', () => {
  assert.equal(effectiveNag({ nag: 'persistent' }, 'gentle'), 'persistent');
  assert.equal(effectiveNag({ nag: '' }, 'normal'), 'normal');
  assert.equal(effectiveNag({ nag: '' }, undefined), 'normal');
  assert.equal(effectiveNag({ nag: 'gentle' }, 'persistent'), 'gentle');
});

test('NAGS: gentle once, normal three repeats ten minutes apart, persistent every five minutes', () => {
  assert.deepEqual(NAGS.gentle, { label: 'Gentle', repeats: 0, gapMin: 0 });
  assert.deepEqual(NAGS.normal, { label: 'Normal', repeats: 3, gapMin: 10 });
  assert.equal(NAGS.persistent.gapMin, 5);
  assert.equal(NAGS.persistent.repeats, Infinity);
});

test('FOOD has none/before/with/after and plain labels', () => {
  assert.deepEqual(FOOD.map((f) => f.key), ['', 'before', 'with', 'after']);
  assert.equal(FOOD.find((f) => f.key === 'with').label, 'Take with food');
});

test('describeRx gives a plain one-line summary', () => {
  const s = describeRx({ ...base, days: [1, 3], slots: [exact('08:00'), slot('18:00', '20:00')] }, '12');
  assert.match(s, /Mon, Wed/);
  assert.match(s, /8:00 am/);
  assert.match(s, /6:00 pm to 8:00 pm/);
  assert.ok(!/to 8:00 am/.test(s));
  assert.match(describeRx({ ...base }, '12'), /Every day/);
});

test('rxChanges lists exactly what changed, field by field, naming the reminder level', () => {
  const b = { ...base, dose: '1000 mg', nag: 'persistent', instructions: 'Different.' };
  const c = rxChanges({ ...base }, b);
  assert.deepEqual(c.map((x) => x.what), ['dose', 'instructions', 'reminder level']);
  assert.equal(c.find((x) => x.what === 'reminder level').from, "user's own setting");
  assert.equal(c.find((x) => x.what === 'reminder level').to, 'Persistent');
  assert.deepEqual(rxChanges({ ...base }, { ...base }), []);
});

test('the change log records a new prescription and each later change, by name', () => {
  const doc = ev({ type: 'doctor', kind: 'add', doctorId: 'd1', name: 'Dr Lee', role: 'GP', pin: null, by: 'open', ms: at(DAY, '05:00') });
  const evs = [doc, rx({ by: 'd1', ms: at(DAY, '06:00') }), rx({ by: 'd1', ms: at(DAY, '06:05'), dose: '1000 mg', nag: 'persistent' }),
    rx({ by: 'd1', ms: at(DAY, '06:10'), dose: '1000 mg', nag: 'persistent', status: 'paused' })];
  const log = changeLog(evs).map((l) => `${l.what}|${l.from}|${l.to}|${l.byName}`);
  assert.ok(log.includes('Added prescription Metformin (500 mg)|||Dr Lee'), log.join('\n'));
  assert.ok(log.includes('Metformin: dose|500 mg|1000 mg|Dr Lee'), log.join('\n'));
  assert.ok(log.includes('Metformin: reminder level|user\'s own setting|Persistent|Dr Lee'), log.join('\n'));
  assert.ok(log.includes('Metformin: status|active|paused|Dr Lee'), log.join('\n'));
});

test('doseSummary counts on time, late, skipped and not recorded; a gap is never called skipped', () => {
  const evs = [rx({ ms: at('2026-10-05', '06:00') }),
    ans('taken', '08:00', { forDay: '2026-10-05', ms: at('2026-10-05', '08:00') }),
    ans('taken', '10:00', { forDay: '2026-10-06', ms: at('2026-10-06', '10:00') }),
    ans('skipped', '08:30', { forDay: '2026-10-07', ms: at('2026-10-07', '08:30') })];
  const r1 = doseSummary(evs, '2026-10-05', '2026-10-09', at('2026-10-08', '12:00')).find((x) => x.rxId === 'r1');
  assert.deepEqual([r1.onTime, r1.late, r1.skipped, r1.notRecorded, r1.total], [1, 1, 1, 1, 4]);
});

test('a prescription saved before exact/range existed is read as a range (its old window), never lost', () => {
  const old = ev({ type: 'clinical', kind: 'rx', rxId: 'old', status: 'active', by: 'open', name: 'Old', dose: '1 mg', food: '', days: 'daily', slots: [{ start: '07:00', end: '09:00', at: '08:00' }], instructions: '', nag: '' });
  const d = dosesFor([old], DAY, at(DAY, '08:00'))[0];
  assert.equal(d.mode, 'range');
  assert.equal(d.state, 'due');
  assert.equal(d.endMs, at(DAY, '09:00'));
  assert.match(describeRx(prescriptions([old])[0], '12'), /7:00 am to 9:00 am/);
});
