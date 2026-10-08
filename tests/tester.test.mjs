import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKLIST, ABOUT, normaliseTester, addNote, removeNote, setCheck, progress, shareText, noteFileName } from '../js/tester.js';

const NOW = Date.UTC(2026, 9, 9, 0, 30);   // 10:30 am Brisbane, 9 Oct 2026

test('the checklist has unique ids and plain wording', () => {
  const ids = CHECKLIST.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(CHECKLIST.length >= 10);
  for (const c of CHECKLIST) assert.ok(c.text.length > 8 && c.group);
});

test('bad or missing saved data becomes an empty record', () => {
  assert.deepEqual(normaliseTester(null), { checks: {}, notes: [] });
  assert.deepEqual(normaliseTester('x'), { checks: {}, notes: [] });
  const s = normaliseTester({ checks: { [CHECKLIST[0].id]: true, nope: true, [CHECKLIST[1].id]: 'yes' }, notes: [{ at: 5, about: 'Main page', text: 'hi' }, { at: 'x' }, 7] });
  assert.deepEqual(s.checks, { [CHECKLIST[0].id]: true });
  assert.equal(s.notes.length, 1);
});

test('a comment is saved with the time and the screen it is about', () => {
  const s = addNote(normaliseTester(null), { text: '  The save button was hard to find  ', about: 'Food and drink', now: NOW });
  assert.equal(s.notes.length, 1);
  assert.deepEqual(s.notes[0], { at: NOW, about: 'Food and drink', text: 'The save button was hard to find' });
});

test('empty comments are refused, unknown screens become Other, long ones are cut', () => {
  const e = normaliseTester(null);
  assert.equal(addNote(e, { text: '   ', about: 'Main page', now: NOW }), e);
  assert.equal(addNote(e, { text: 'x', about: 'Zzz', now: NOW }).notes[0].about, 'Other');
  assert.equal(addNote(e, { text: 'a'.repeat(3000), about: 'Main page', now: NOW }).notes[0].text.length, 1000);
  assert.ok(ABOUT.includes('Other'));
});

test('newest comment is first and can be removed', () => {
  let s = addNote(normaliseTester(null), { text: 'one', about: 'Main page', now: 1 });
  s = addNote(s, { text: 'two', about: 'Main page', now: 2 });
  assert.deepEqual(s.notes.map((n) => n.text), ['two', 'one']);
  s = removeNote(s, 2);
  assert.deepEqual(s.notes.map((n) => n.text), ['one']);
});

test('ticks are saved and can be undone; unknown items are ignored', () => {
  const id = CHECKLIST[2].id;
  let s = setCheck(normaliseTester(null), id, true);
  assert.equal(s.checks[id], true);
  assert.deepEqual(progress(s), { done: 1, total: CHECKLIST.length });
  s = setCheck(s, id, false);
  assert.equal(progress(s).done, 0);
  const same = setCheck(s, 'bogus', true);
  assert.equal(progress(same).done, 0);
});

test('the share text lists ticks and comments in plain words and carries no diary data', () => {
  let s = setCheck(normaliseTester(null), CHECKLIST[0].id, true);
  s = addNote(s, { text: 'Chime was too quiet', about: 'Reminders', now: NOW });
  const t = shareText(s, NOW);
  assert.match(t, /Headache Diary/);
  assert.match(t, new RegExp(`1 of ${CHECKLIST.length}`));
  assert.match(t, /Chime was too quiet/);
  assert.match(t, /Reminders/);
  assert.match(t, /9 Oct 2026/);
  assert.match(t, /\[x\]/);
  assert.match(t, /\[ \]/);
});

test('file name carries the Brisbane date', () => {
  assert.equal(noteFileName(NOW), 'headache-diary-tester-notes-2026-10-09.txt');
});
