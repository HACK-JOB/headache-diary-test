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
