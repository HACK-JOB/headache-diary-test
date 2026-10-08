import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS, notesFor, unseenFor, markSeen, freshSeen, publish, validate } from '../js/patchnotes.js';

const R = [
  { id: 1, date: '2026-10-10', title: 'Update 1', notes: [{ screen: 'main', text: 'A' }, { screen: 'intake', text: 'B' }] },
  { id: 2, date: '2026-10-12', title: 'Update 2', notes: [{ screen: 'main', text: 'C' }] },
];

test('notesFor lists a screen\'s notes from every release, newest first', () => {
  assert.deepEqual(notesFor(R, 'main').map((n) => n.text), ['C', 'A']);
  assert.deepEqual(notesFor(R, 'intake').map((n) => n.text), ['B']);
  assert.deepEqual(notesFor(R, 'headache'), []);
});

test('unseenFor shows only notes from releases newer than what was dismissed on that screen', () => {
  assert.deepEqual(unseenFor(R, {}, 'main').map((n) => n.text), ['C', 'A']);
  assert.deepEqual(unseenFor(R, { main: 1 }, 'main').map((n) => n.text), ['C']);
  assert.deepEqual(unseenFor(R, { main: 2 }, 'main'), []);
  assert.deepEqual(unseenFor(R, {}, 'headache'), []);
  assert.deepEqual(unseenFor(R, { intake: 0 }, 'intake').map((n) => n.text), ['B']);
});

test('dismissing one screen leaves the others showing', () => {
  const seen = markSeen({}, R, 'main');
  assert.deepEqual(seen, { main: 2 });
  assert.deepEqual(unseenFor(R, seen, 'intake').map((n) => n.text), ['B']);
  assert.deepEqual(markSeen({ main: 1, intake: 1 }, R, 'main'), { main: 2, intake: 1 });
  assert.deepEqual(markSeen({}, [], 'main'), { main: 0 });
});

test('a brand new install starts with everything marked as seen', () => {
  const seen = freshSeen(R);
  for (const s of SCREENS) assert.deepEqual(unseenFor(R, seen, s.key), [], s.key);
  assert.equal(freshSeen([])[SCREENS[0].key], 0);
});

test('publish moves the drafts into the next numbered update and empties the drafts', () => {
  const drafts = [{ screen: 'admin', text: 'X' }, { screen: 'main', text: 'Y' }];
  const out = publish(R, drafts, '2026-10-20');
  assert.equal(out.releases.length, 3);
  assert.deepEqual([out.releases[2].id, out.releases[2].title, out.releases[2].date], [3, 'Update 3', '2026-10-20']);
  assert.deepEqual(out.releases[2].notes, drafts);
  assert.deepEqual(out.drafts, []);
  assert.equal(R.length, 2);                                   // inputs are not changed
  assert.equal(publish([], drafts, '2026-10-20').releases[0].id, 1);
});

test('publish refuses when there are no drafts', () => {
  assert.throws(() => publish(R, [], '2026-10-20'), /no drafts/i);
});

test('validate rejects unknown screens, empty or personal wording, and over-long text', () => {
  assert.deepEqual(validate([{ screen: 'main', text: 'Meals can now be entered per 100 g.' }]), []);
  assert.match(validate([{ screen: 'nope', text: 'x' }])[0], /screen/i);
  assert.match(validate([{ screen: 'main', text: '' }])[0], /empty/i);
  assert.match(validate([{ screen: 'main', text: 'You can now do this.' }])[0], /you|your/i);
  assert.match(validate([{ screen: 'main', text: 'x'.repeat(200) }])[0], /long/i);
});

test('every screen has a plain label and the keys are unique', () => {
  assert.equal(new Set(SCREENS.map((s) => s.key)).size, SCREENS.length);
  for (const s of SCREENS) assert.ok(s.label);
});

import { readFileSync } from 'node:fs';
import { RELEASES } from '../js/releases.js';
test('the drafts and the published releases in the repo are all valid', () => {
  const drafts = JSON.parse(readFileSync(new URL('../notes/drafts.json', import.meta.url), 'utf8'));
  assert.deepEqual(validate(drafts), []);
  for (const r of RELEASES) { assert.deepEqual(validate(r.notes), [], r.title); assert.ok(r.id > 0 && r.date && r.title); }
  assert.deepEqual(RELEASES.map((r) => r.id), RELEASES.map((_, i) => i + 1));
});
