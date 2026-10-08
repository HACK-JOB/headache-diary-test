import test from 'node:test';
import assert from 'node:assert/strict';
import { dayPhase, openActivity, buildDay, sleepSessions, positionMinutes, validateActivity, pickList, STARTER_ACTIVITIES, FIXED_LOCATIONS, FIXED_POSITIONS } from '../js/day.js';

// Brisbane is UTC+10 all year. Helper: Brisbane wall-clock -> ms.
const bne = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 10, mi);
let n = 0;
const wake = (ms) => ({ id: 'w' + ++n, type: 'day', kind: 'wake', ms, seq: n });
const end = (ms) => ({ id: 'e' + ++n, type: 'day', kind: 'end', ms, seq: n });
const act = (ms, activity, location = 'House', position = 'Sitting', extra = {}) => ({ id: 'a' + ++n, type: 'activity', activity, location, position, ms, seq: n, ...extra });

test('phase: nothing logged means she has not woken up yet', () => {
  assert.equal(dayPhase([]), 'asleep');
});

test('phase follows WOKE UP, then START ACTIVITY, then END THE DAY', () => {
  const t = bne(2026, 10, 8, 6);
  assert.equal(dayPhase([wake(t)]), 'awake');
  assert.equal(dayPhase([wake(t), act(t + 60000, 'TV')]), 'active');
  assert.equal(dayPhase([wake(t), act(t + 60000, 'TV'), end(t + 120000)]), 'asleep');
  assert.equal(dayPhase([wake(t), act(t + 60000, 'TV'), end(t + 120000), wake(t + 180000)]), 'awake');
});

test('phase: forgetting WOKE UP still lets her log an activity; headache events are ignored', () => {
  const t = bne(2026, 10, 8, 9);
  assert.equal(dayPhase([act(t, 'Resting')]), 'active');
  assert.equal(dayPhase([{ type: 'headache', ms: t, kind: 'start' }, { type: 'water', ms: t }]), 'asleep');
});

test('deleted entries do not count', () => {
  const t = bne(2026, 10, 8, 6);
  assert.equal(dayPhase([wake(t), act(t + 1, 'TV', 'House', 'Sitting', { deleted: true })]), 'awake');
});

test('openActivity returns the activity still running, or null', () => {
  const t = bne(2026, 10, 8, 6);
  const a = act(t + 60000, 'TV');
  assert.equal(openActivity([wake(t), a]).id, a.id);
  assert.equal(openActivity([wake(t), a, end(t + 90000)]), null);
  assert.equal(openActivity([wake(t), a, act(t + 90000, 'Resting')]).activity, 'Resting');
});

test('buildDay: each activity runs until the next change; the last one runs to now', () => {
  const now = bne(2026, 10, 8, 12);
  const evs = [wake(bne(2026, 10, 8, 6)), act(bne(2026, 10, 8, 6, 30), 'TV', 'House', 'Sitting'), act(bne(2026, 10, 8, 8), 'Cooking', 'House', 'Standing'), act(bne(2026, 10, 8, 9), 'Resting', 'Bed', 'Laying')];
  const d = buildDay(evs, '2026-10-08', now);
  assert.equal(d.wake, bne(2026, 10, 8, 6));
  assert.equal(d.end, null);
  assert.deepEqual(d.segments.map((s) => [s.activity, (s.end - s.start) / 60000, s.closedBy]), [['TV', 90, 'change'], ['Cooking', 60, 'change'], ['Resting', 180, 'open']]);
});

test('buildDay: END THE DAY closes the last activity', () => {
  const now = bne(2026, 10, 8, 23);
  const evs = [wake(bne(2026, 10, 8, 6)), act(bne(2026, 10, 8, 7), 'TV'), end(bne(2026, 10, 8, 21))];
  const d = buildDay(evs, '2026-10-08', now);
  assert.equal(d.end, bne(2026, 10, 8, 21));
  assert.deepEqual(d.segments.map((s) => [s.activity, (s.end - s.start) / 60000, s.closedBy]), [['TV', 840, 'end']]);
});

test('buildDay: an activity running over midnight is split, and the new day shows it carried in', () => {
  const evs = [wake(bne(2026, 10, 7, 7)), act(bne(2026, 10, 7, 23), 'TV', 'House', 'Sitting'), act(bne(2026, 10, 8, 1), 'Sleeping', 'Bed', 'Laying')];
  const now = bne(2026, 10, 8, 8);
  const d1 = buildDay(evs, '2026-10-07', now);
  assert.deepEqual(d1.segments.map((s) => [s.activity, (s.end - s.start) / 60000, s.closedBy, s.carriedIn]), [['TV', 60, 'midnight', false]]);
  const d2 = buildDay(evs, '2026-10-08', now);
  assert.deepEqual(d2.segments.map((s) => [s.activity, (s.end - s.start) / 60000, s.closedBy, s.carriedIn]), [['TV', 60, 'change', true], ['Sleeping', 420, 'open', false]]);
});

test('buildDay: an activity left open when she next wakes is closed by the wake and marked so', () => {
  const evs = [wake(bne(2026, 10, 7, 7)), act(bne(2026, 10, 7, 22), 'TV'), wake(bne(2026, 10, 8, 6))];
  const d = buildDay(evs, '2026-10-08', bne(2026, 10, 8, 7));
  assert.deepEqual(d.segments.map((s) => [s.activity, (s.end - s.start) / 60000, s.closedBy, s.carriedIn]), [['TV', 360, 'wake', true]]);
});

test('buildDay: an empty or future day has no segments', () => {
  assert.deepEqual(buildDay([], '2026-10-08', bne(2026, 10, 8, 8)).segments, []);
  const evs = [act(bne(2026, 10, 9, 7), 'TV')];
  assert.deepEqual(buildDay(evs, '2026-10-08', bne(2026, 10, 8, 8)).segments, []);
});

test('sleepSessions pairs END THE DAY with the next WOKE UP and never guesses missing ends', () => {
  const evs = [wake(bne(2026, 10, 7, 7)), end(bne(2026, 10, 7, 22, 30)), wake(bne(2026, 10, 8, 6)), wake(bne(2026, 10, 9, 6, 30))];
  const s = sleepSessions(evs);
  assert.equal(s.length, 1);
  assert.equal(s[0].minutes, 450);
  assert.equal(s[0].endMs, bne(2026, 10, 7, 22, 30));
  assert.equal(s[0].wakeMs, bne(2026, 10, 8, 6));
});

test('positionMinutes adds up time per position and leaves out wake-closed stretches', () => {
  const evs = [wake(bne(2026, 10, 8, 6)), act(bne(2026, 10, 8, 6), 'TV', 'House', 'Sitting'), act(bne(2026, 10, 8, 8), 'Cooking', 'House', 'Standing'), act(bne(2026, 10, 8, 9), 'Resting', 'Bed', 'Laying'), act(bne(2026, 10, 8, 10), 'TV', 'House', 'Sitting')];
  const d = buildDay(evs, '2026-10-08', bne(2026, 10, 8, 12));
  assert.deepEqual(positionMinutes(d.segments), { Sitting: 240, Standing: 60, Laying: 60 });
  const stale = buildDay([wake(bne(2026, 10, 7, 7)), act(bne(2026, 10, 7, 22), 'TV'), wake(bne(2026, 10, 8, 6))], '2026-10-08', bne(2026, 10, 8, 7));
  assert.deepEqual(positionMinutes(stale.segments), {});
});

test('validateActivity needs an activity, a location and a position', () => {
  assert.deepEqual(validateActivity({}), ['activity', 'location', 'position']);
  assert.deepEqual(validateActivity({ activity: 'TV', location: '  ', position: 'Sitting' }), ['location']);
  assert.deepEqual(validateActivity({ activity: 'TV', location: 'House', position: 'Sitting' }), []);
});

test('pickList: activities start with the five starters, and her own use pushes them out', () => {
  assert.deepEqual(pickList([], 'activities'), STARTER_ACTIVITIES);
  assert.equal(STARTER_ACTIVITIES.length, 5);
  const t = bne(2026, 10, 8, 6);
  const evs = [act(t, 'Knitting'), act(t + 1, 'Knitting'), act(t + 2, 'tv'), act(t + 3, 'Gardening')];
  const list = pickList(evs, 'activities');
  assert.equal(list.length, 5);
  assert.deepEqual(list.slice(0, 3), ['Knitting', 'Gardening', 'tv']); // tie on one use each: the later one first
  // 'tv' matches the starter 'TV' without duplicating it
  assert.equal(list.filter((x) => x.toLowerCase() === 'tv').length, 1);
});

test('pickList: locations are Outside, House, Bed plus her two most used others', () => {
  assert.deepEqual(FIXED_LOCATIONS, ['Outside', 'House', 'Bed']);
  assert.deepEqual(pickList([], 'locations'), FIXED_LOCATIONS);
  const t = bne(2026, 10, 8, 6);
  const evs = [act(t, 'x', 'Car'), act(t + 1, 'x', 'Car'), act(t + 2, 'x', 'Shops'), act(t + 3, 'x', 'Clinic'), act(t + 4, 'x', 'house'), act(t + 5, 'x', 'house')];
  assert.deepEqual(pickList(evs, 'locations'), ['Outside', 'House', 'Bed', 'Car', 'Clinic']);
});

test('pickList: positions are Laying, Sitting, Standing plus up to two of her own', () => {
  assert.deepEqual(FIXED_POSITIONS, ['Laying', 'Sitting', 'Standing']);
  const t = bne(2026, 10, 8, 6);
  assert.deepEqual(pickList([act(t, 'x', 'House', 'Leaning')], 'positions'), ['Laying', 'Sitting', 'Standing', 'Leaning']);
});
