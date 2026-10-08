import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStart, validateUpdate, buildEpisodes, activeEpisode, describeChanges, TYPES, SEVERITY } from '../js/episodes.js';

const bne = (d, h = 0, m = 0) => Date.UTC(2026, 9, d, h - 10, m);
const good = { severity: 3, weather: 'Sunny', headacheType: 'tension' };

test('six preset types plus Other, and no type is called migraine', () => {
  assert.deepEqual(Object.keys(TYPES), ['cluster', 'sinus', 'tension', 'tmj', 'oneSided', 'neck', 'other']);
  assert.ok(!JSON.stringify(TYPES).toLowerCase().includes('migraine'));
  assert.equal(SEVERITY.length, 5);
});

test('validateStart needs severity 1-5, weather and a type', () => {
  assert.deepEqual(validateStart(good), []);
  assert.ok(validateStart({ ...good, severity: undefined }).includes('severity'));
  assert.ok(validateStart({ ...good, severity: 6 }).includes('severity'));
  assert.ok(validateStart({ ...good, weather: '  ' }).includes('weather'));
  assert.ok(validateStart({ ...good, headacheType: 'bogus' }).includes('headacheType'));
});

test('notes are only required when the type is Other', () => {
  assert.ok(validateStart({ ...good, headacheType: 'other' }).includes('notes'));
  assert.deepEqual(validateStart({ ...good, headacheType: 'other', notes: 'behind my eyes' }), []);
  assert.deepEqual(validateStart({ ...good, headacheType: 'neck' }), []);
});

test('validateUpdate allows everything optional, but changing to Other needs notes', () => {
  assert.deepEqual(validateUpdate({}, good), []);
  assert.deepEqual(validateUpdate({ severity: 4 }, good), []);
  assert.ok(validateUpdate({ severity: 9 }, good).includes('severity'));
  assert.ok(validateUpdate({ headacheType: 'other' }, good).includes('notes'));
  assert.deepEqual(validateUpdate({ headacheType: 'other', notes: 'x' }, good), []);
});

const ev = (extra) => ({ id: Math.random().toString(36).slice(2), type: 'headache', ...extra });

test('buildEpisodes groups start, updates and resolve into one episode', () => {
  const events = [
    ev({ ms: bne(8, 9), episodeId: 'E1', kind: 'start', ...good }),
    ev({ ms: bne(8, 11), episodeId: 'E1', kind: 'update', severity: 5 }),
    ev({ ms: bne(8, 15), episodeId: 'E1', kind: 'resolve' }),
  ];
  const [e] = buildEpisodes(events);
  assert.equal(e.id, 'E1');
  assert.equal(e.startMs, bne(8, 9));
  assert.equal(e.endMs, bne(8, 15));
  assert.equal(e.active, false);
  assert.equal(e.current.severity, 5);
  assert.equal(e.current.weather, 'Sunny');
  assert.equal(e.peakSeverity, 5);
  assert.equal(e.timeline.length, 3);
  assert.equal(e.changeCount, 1);
});

test('an episode that crosses midnight stays one episode', () => {
  const events = [
    ev({ ms: bne(8, 23, 30), episodeId: 'E1', kind: 'start', ...good }),
    ev({ ms: bne(9, 0, 40), episodeId: 'E1', kind: 'update', severity: 2 }),
    ev({ ms: bne(9, 6), episodeId: 'E1', kind: 'resolve' }),
  ];
  const eps = buildEpisodes(events);
  assert.equal(eps.length, 1);
  assert.equal(eps[0].durationMs, 6.5 * 3600000);
  assert.equal(eps[0].startDay, '2026-10-08');
});

test('activeEpisode finds the one unresolved episode, ignoring deleted entries', () => {
  const events = [
    ev({ ms: bne(7, 9), episodeId: 'OLD', kind: 'start', ...good }),
    ev({ ms: bne(7, 10), episodeId: 'OLD', kind: 'resolve' }),
    ev({ ms: bne(8, 9), episodeId: 'NEW', kind: 'start', ...good }),
  ];
  assert.equal(activeEpisode(events).id, 'NEW');
  events[2].deleted = true;
  assert.equal(activeEpisode(events), null);
});

test('medications and relief collect across the whole episode', () => {
  const events = [
    ev({ ms: 1, episodeId: 'E', kind: 'start', ...good, meds: [{ name: 'Panadol', at: 1 }] , relief: ['Ice pack'] }),
    ev({ ms: 2, episodeId: 'E', kind: 'update', meds: [{ name: 'Nurofen', at: 2 }], relief: ['Rest'] }),
  ];
  const [e] = buildEpisodes(events);
  assert.deepEqual(e.meds.map((m) => m.name), ['Panadol', 'Nurofen']);
  assert.deepEqual(e.relief, ['Ice pack', 'Rest']);
});

test('describeChanges lists only what changed, with previous and new', () => {
  const prev = { severity: 3, weather: 'Sunny', headacheType: 'tension' };
  const d = describeChanges(prev, { severity: 5, weather: 'Sunny', headacheType: 'neck' });
  assert.deepEqual(d, [
    { field: 'severity', from: 3, to: 5 },
    { field: 'headacheType', from: 'tension', to: 'neck' },
  ]);
  assert.deepEqual(describeChanges(prev, {}), []);
});

test('an update logged in the same minute as the start still wins (ties broken by creation order)', () => {
  const t = bne(8, 13, 0);
  const events = [
    // deliberately listed with the update first, as a random-id database order could return them
    { id: 'zzz', type: 'headache', kind: 'update', episodeId: 'E', ms: t, createdAt: 2, severity: 5, headacheType: 'neck' },
    { id: 'aaa', type: 'headache', kind: 'start', episodeId: 'E', ms: t, createdAt: 1, severity: 3, weather: 'Sunny', headacheType: 'tension' },
  ];
  const [e] = buildEpisodes(events);
  assert.equal(e.current.severity, 5);
  assert.equal(e.current.headacheType, 'neck');
  assert.equal(e.timeline[0].kind, 'start');
});

test('with identical times and no creation order, start comes before update before resolve', () => {
  const t = bne(8, 13, 0);
  const mk = (kind, extra = {}) => ({ id: kind, type: 'headache', kind, episodeId: 'E', ms: t, ...extra });
  const events = [mk('resolve'), mk('update', { severity: 4 }), mk('start', { severity: 2, weather: 'Rain', headacheType: 'sinus' })];
  const [e] = buildEpisodes(events);
  assert.deepEqual(e.timeline.map((x) => x.kind), ['start', 'update', 'resolve']);
  assert.equal(e.active, false);
});
