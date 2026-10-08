// The Admin tab. Open until a PIN has been set up here; after that it is locked behind the PIN.
// The PIN is a convenience lock for the family (see pin.js). There is no "forgot PIN" in v1.
import { validPinFormat, makeRecord, checkPin, afterFail, afterSuccess, lockedFor, unlockUntil, isUnlocked } from './pin.js';

const KEY = 'hd.adminPin';
const TRIES = 'hd.adminTries';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

export function createAdminUI(ctx) {
  const { h, state, log, reload, render, icon, time } = ctx;
  const st = { mode: 'view', error: '', info: '' };   // view | setup | change | off
  let timer;

  const record = () => read(KEY);
  const hasPin = () => !!record();
  const unlocked = () => !hasPin() || isUnlocked(state.adminUntil, Date.now());

  function lock() { state.adminUntil = 0; st.mode = 'view'; st.error = ''; st.info = ''; clearTimeout(timer); }
  function unlock() {
    state.adminUntil = unlockUntil(Date.now());
    clearTimeout(timer);
    timer = setTimeout(() => { lock(); if (state.view === 'options') render(); }, state.adminUntil - Date.now() + 50);
  }
  /** Leaving Options always locks Admin again. */
  const leave = () => { if (hasPin()) lock(); };

  const val = (id) => document.getElementById(id)?.value ?? '';
  const field = (id, label, extra = {}) => h('div', { class: 'num-field' },
    h('label', { for: id }, label),
    h('input', { id, type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '6', autocomplete: 'off', class: 'text pin-input', ...extra }));

  async function enter() {
    const tries = read(TRIES) ?? { fails: 0, until: 0 };
    const wait = lockedFor(tries, Date.now());
    if (wait) { st.error = `Too many tries. Please wait ${Math.ceil(wait / 1000)} seconds.`; render(); return; }
    if (await checkPin(record(), val('pin-in'))) {
      localStorage.setItem(TRIES, JSON.stringify(afterSuccess()));
      st.error = ''; unlock(); render();
    } else {
      const next = afterFail(tries, Date.now());
      localStorage.setItem(TRIES, JSON.stringify(next));
      const w = lockedFor(next, Date.now());
      st.error = w ? `That PIN is not right. Please wait ${Math.ceil(w / 1000)} seconds before trying again.` : 'That PIN is not right.';
      render();
    }
  }

  async function savePin() {
    const a = val('pin-new'); const b = val('pin-again');
    if (st.mode === 'change' && !(await checkPin(record(), val('pin-old')))) { st.error = 'The current PIN is not right.'; render(); return; }
    if (!validPinFormat(a)) { st.error = 'Please use 4 to 6 digits, numbers only.'; render(); return; }
    if (a !== b) { st.error = 'The two PINs are different. Please type them again.'; render(); return; }
    const changing = hasPin();
    localStorage.setItem(KEY, JSON.stringify(await makeRecord(a)));
    localStorage.setItem(TRIES, JSON.stringify(afterSuccess()));
    await log.add({ type: 'config', kind: 'admin-pin', action: changing ? 'changed' : 'set' });
    await reload();
    st.mode = 'view'; st.error = ''; st.info = changing ? 'PIN changed.' : 'PIN set. Admin will now ask for it.';
    unlock(); render();
  }

  async function turnOff() {
    if (!(await checkPin(record(), val('pin-old')))) { st.error = 'The current PIN is not right.'; render(); return; }
    localStorage.removeItem(KEY); localStorage.removeItem(TRIES);
    await log.add({ type: 'config', kind: 'admin-pin', action: 'removed' });
    await reload();
    state.adminUntil = 0; st.mode = 'view'; st.error = ''; st.info = 'PIN removed. Admin is open.';
    render();
  }

  const err = () => st.error ? h('p', { class: 'error', role: 'alert' }, st.error) : null;
  const wrap = (...kids) => h('section', { class: 'panel', id: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-admin' }, ...kids);
  const buttons = (...b) => h('div', { class: 'two' }, ...b);

  function lockedView() {
    return wrap(
      h('div', { class: 'lock' }, icon('lock'), h('div', {}, h('h3', {}, 'Family admin'), h('p', { class: 'hint' }, 'This area is locked. Type the family PIN to open it.'))),
      err(),
      field('pin-in', 'PIN', { onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); enter(); } } }),
      h('button', { class: 'btn primary', id: 'pin-go', onclick: enter }, 'Open admin'),
      h('p', { class: 'hint' }, 'If the PIN is lost it cannot be recovered in this version. Ask Corey.'));
  }

  function pinForm() {
    const change = st.mode === 'change' || st.mode === 'off';
    return h('div', { class: 'setting' },
      h('h3', {}, st.mode === 'setup' ? 'Set up an Admin PIN' : st.mode === 'change' ? 'Change the PIN' : 'Turn the PIN off'),
      st.mode === 'setup' ? h('p', { class: 'hint' }, 'Choose 4 to 6 numbers. Write it somewhere safe: it cannot be recovered in this version. It keeps the family settings away from accidental taps. It is not strong security.') : null,
      err(),
      change ? field('pin-old', 'Current PIN') : null,
      st.mode !== 'off' ? field('pin-new', st.mode === 'setup' ? 'New PIN' : 'New PIN') : null,
      st.mode !== 'off' ? field('pin-again', 'Type the new PIN again', { onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); savePin(); } } }) : null,
      buttons(
        h('button', { class: 'btn quiet', id: 'pin-cancel', onclick: () => { st.mode = 'view'; st.error = ''; render(); } }, 'Cancel'),
        h('button', { class: 'btn primary', id: 'pin-save', onclick: st.mode === 'off' ? turnOff : savePin }, st.mode === 'off' ? 'Turn PIN off' : 'Save PIN')));
  }

  function pinSection() {
    if (st.mode !== 'view') return pinForm();
    if (!hasPin()) {
      return h('div', { class: 'setting' }, h('h3', {}, 'Admin PIN'),
        h('p', { class: 'hint' }, 'Admin is open to anyone who uses this tablet. Set a PIN to lock it.'),
        h('button', { class: 'btn quiet', id: 'pin-setup', onclick: () => { st.mode = 'setup'; st.error = ''; st.info = ''; render(); } }, 'Set up an Admin PIN'));
    }
    return h('div', { class: 'setting' }, h('h3', {}, 'Admin PIN'),
      h('p', { class: 'hint' }, 'A PIN is set. Admin locks itself after 5 minutes, and whenever you leave Options.'),
      buttons(
        h('button', { class: 'btn quiet', id: 'pin-change', onclick: () => { st.mode = 'change'; st.error = ''; st.info = ''; render(); } }, 'Change PIN'),
        h('button', { class: 'btn quiet', id: 'pin-off', onclick: () => { st.mode = 'off'; st.error = ''; st.info = ''; render(); } }, 'Turn PIN off')),
      h('button', { class: 'btn quiet small', id: 'pin-lock', onclick: () => { lock(); render(); } }, 'Lock now'));
  }

  function panel(extra) {
    if (!unlocked()) return lockedView();
    return wrap(
      h('div', { class: 'lock' }, icon('lock'), h('div', {}, h('h3', {}, 'Family admin'),
        h('p', { class: 'hint' }, hasPin() ? 'Unlocked. It locks again in 5 minutes.' : 'Open for now. Set a PIN below to lock it.'))),
      st.info ? h('p', { class: 'meta', role: 'status' }, st.info) : null,
      pinSection(),
      extra);
  }

  return { panel, leave, lock, hasPin };
}
