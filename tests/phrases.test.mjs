import test from 'node:test';
import assert from 'node:assert/strict';
import { commonItems, suggest, addPhrase, removePhrase, hasPhrase } from '../js/memory.js';

const ev = (ms, phrases, extra = {}) => ({ type: 'headache', ms, kind: 'update', phrases, ...extra });

test('commonItems ranks by how often she used a phrase, not how recently', () => {
  const events = [
    ev(1, ['Light hurts']), ev(2, ['Light hurts']), ev(3, ['Light hurts']),
    ev(4, ['Felt sick']), ev(5, ['Felt sick']),
    ev(6, ['Dizzy']),
  ];
  assert.deepEqual(commonItems(events, 'phrases'), ['Light hurts', 'Felt sick', 'Dizzy']);
});

test('ties go to the more recent phrase, and only 5 are returned', () => {
  const events = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((p, i) => ev(i + 1, [p]));
  assert.deepEqual(commonItems(events, 'phrases'), ['g', 'f', 'e', 'd', 'c']);
});

test('phrases match regardless of capital letters and keep the latest spelling', () => {
  const events = [ev(1, ['light hurts']), ev(2, ['Light Hurts'])];
  assert.deepEqual(commonItems(events, 'phrases'), ['Light Hurts']);
});

test('deleted entries and other event types are ignored; nothing is preset', () => {
  assert.deepEqual(commonItems([], 'phrases'), []);
  assert.deepEqual(commonItems([ev(1, ['x'], { deleted: true }), { type: 'water', ms: 2, phrases: ['y'] }], 'phrases'), []);
});

test('suggest works for phrases, ranked by how common', () => {
  const events = [ev(1, ['Pressure behind eyes']), ev(2, ['Pressure on top']), ev(3, ['Pressure on top']), ev(4, ['Felt sick'])];
  assert.deepEqual(suggest(events, 'phrases', 'press'), ['Pressure on top', 'Pressure behind eyes']);
  assert.deepEqual(suggest(events, 'phrases', ''), []);
});

test('addPhrase joins with a comma and does not double up', () => {
  assert.equal(addPhrase('', 'Felt sick'), 'Felt sick');
  assert.equal(addPhrase('Light hurts', 'Felt sick'), 'Light hurts, Felt sick');
  assert.equal(addPhrase('Light hurts, ', 'Felt sick'), 'Light hurts, Felt sick');
  assert.equal(addPhrase('Light hurts', 'light HURTS'), 'Light hurts');
  assert.equal(addPhrase('Light hurts', '   '), 'Light hurts');
});

test('removePhrase takes it out and tidies the commas', () => {
  assert.equal(removePhrase('Light hurts, Felt sick, Dizzy', 'Felt sick'), 'Light hurts, Dizzy');
  assert.equal(removePhrase('Felt sick', 'felt sick'), '');
  assert.equal(removePhrase('Light hurts, Felt sick', 'Light hurts'), 'Felt sick');
  assert.equal(removePhrase('Only this', 'Not there'), 'Only this');
});

test('hasPhrase finds a phrase as a whole item, not as part of a longer one', () => {
  assert.equal(hasPhrase('Light hurts, Felt sick', 'felt sick'), true);
  assert.equal(hasPhrase('Felt sickly', 'Felt sick'), false);
  assert.equal(hasPhrase('', 'x'), false);
});
