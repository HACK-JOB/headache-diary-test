import test from 'node:test';
import assert from 'node:assert/strict';
import { versionFrom, outcomeText, checkNow } from '../js/updatecheck.js';

// A stand-in for a service worker registration. `after` runs when update() is called, to act out what the browser does.
function fakeReg(after) {
  const reg = new EventTarget();
  reg.installing = null; reg.waiting = null; reg.active = {};
  reg.update = async () => { after?.(reg); };
  return reg;
}
function fakeWorker() { const w = new EventTarget(); w.state = 'installing'; return w; }

test('versionFrom reads the newest app cache name', () => {
  assert.equal(versionFrom(['hd-v9', 'hd-v134', 'other']), 'hd-v134');
  assert.equal(versionFrom(['x']), null);
  assert.equal(versionFrom([]), null);
  assert.equal(versionFrom(undefined), null);
});

test('outcomeText: neutral wording, names the version when known, never says "you"', () => {
  assert.match(outcomeText('current', 'hd-v134'), /up to date/i);
  assert.match(outcomeText('current', 'hd-v134'), /hd-v134/);
  assert.match(outcomeText('found', 'hd-v134'), /new version/i);
  assert.match(outcomeText('offline', null), /no connection|offline/i);
  assert.match(outcomeText('failed', null), /could not/i);
  for (const o of ['current', 'found', 'offline', 'failed', 'checking']) assert.doesNotMatch(outcomeText(o, 'hd-v1'), /\byou\b|\byour\b/i);
});

test('checkNow: offline answers without asking the network', async () => {
  let asked = false;
  const reg = fakeReg(() => { asked = true; });
  assert.equal(await checkNow(reg, { online: false }), 'offline');
  assert.equal(asked, false);
});

test('checkNow: no registration (no service worker) is a failed check', async () => {
  assert.equal(await checkNow(null, { online: true }), 'failed');
});

test('checkNow: nothing new means current', async () => {
  assert.equal(await checkNow(fakeReg(), { online: true, waitMs: 20 }), 'current');
});

test('checkNow: a worker that installs means a new version was found', async () => {
  const w = fakeWorker();
  const reg = fakeReg((r) => { r.installing = w; setTimeout(() => { w.state = 'installed'; w.dispatchEvent(new Event('statechange')); }, 5); });
  assert.equal(await checkNow(reg, { online: true, waitMs: 500 }), 'found');
});

test('checkNow: a worker already waiting counts as found', async () => {
  const reg = fakeReg((r) => { r.waiting = {}; });
  assert.equal(await checkNow(reg, { online: true, waitMs: 50 }), 'found');
});

test('checkNow: a worker that never finishes installing times out as found, not stuck', async () => {
  const w = fakeWorker();
  const reg = fakeReg((r) => { r.installing = w; });
  assert.equal(await checkNow(reg, { online: true, waitMs: 30 }), 'found');
});

test('checkNow: a failed install is reported as failed', async () => {
  const w = fakeWorker();
  const reg = fakeReg((r) => { r.installing = w; setTimeout(() => { w.state = 'redundant'; w.dispatchEvent(new Event('statechange')); }, 5); });
  assert.equal(await checkNow(reg, { online: true, waitMs: 500 }), 'failed');
});

test('checkNow: update() throwing is a failed check', async () => {
  const reg = fakeReg(); reg.update = async () => { throw new Error('network'); };
  assert.equal(await checkNow(reg, { online: true }), 'failed');
});

import { autoText, lastCheckedText, AUTO_TAG, AUTO_MIN_MS } from '../js/updatecheck.js';

test('overnight check: one tag, at most twice a day is asked for', () => {
  assert.equal(AUTO_TAG, 'hd-update-check');
  assert.equal(AUTO_MIN_MS, 12 * 60 * 60 * 1000);
});

test('autoText: says plainly whether overnight checks are on, and that the browser picks the time', () => {
  assert.match(autoText('on'), /overnight|automatic/i);
  assert.match(autoText('on'), /browser/i);
  assert.match(autoText('unsupported'), /not available|only when/i);
  assert.match(autoText('denied'), /not allowed|blocked/i);
  assert.match(autoText('unknown'), /checks/i);
  for (const s of ['on', 'unsupported', 'denied', 'unknown']) assert.doesNotMatch(autoText(s), /\byou\b|\byour\b/i);
});

test('lastCheckedText: never, today with the time, yesterday, or a date', () => {
  const now = new Date(2026, 9, 10, 15, 0).getTime();
  assert.equal(lastCheckedText(null, now, '24'), 'Not checked yet.');
  assert.equal(lastCheckedText(new Date(2026, 9, 10, 5, 7).getTime(), now, '24'), 'Last checked today at 05:07.');
  assert.equal(lastCheckedText(new Date(2026, 9, 10, 5, 7).getTime(), now, '12'), 'Last checked today at 5:07 AM.');
  assert.equal(lastCheckedText(new Date(2026, 9, 9, 23, 30).getTime(), now, '24'), 'Last checked yesterday at 23:30.');
  assert.match(lastCheckedText(new Date(2026, 9, 1, 8, 0).getTime(), now, '24'), /^Last checked 1 Oct at 08:00\.$/);
  assert.equal(lastCheckedText('junk', now, '24'), 'Not checked yet.');
});
