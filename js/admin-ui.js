// The Admin tab. Open until a PIN has been set up here; after that it is locked behind the PIN.
// The PIN is a convenience lock for the family (see pin.js). There is no "forgot PIN" in v1.
import { sideTabs } from './sidetabs.js';
import { RESET_WORD, confirmsReset, diaryKeys, backupFile, backupName, SCOPES, scopeByKey, countScope, scopeAllowed, applyScope, resetNote } from './reset.js';
import { validPinFormat, makeRecord, checkPin, afterFail, afterSuccess, lockedFor, unlockUntil, isUnlocked } from './pin.js';

const KEY = 'hd.adminPin';
const RESET_TEXT = { mode: 'closed', typed: '', error: '' };
const ONE = { key: '', typed: '', error: '' };
const TRIES = 'hd.adminTries';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

export function createAdminUI(ctx) {
  const { h, state, log, reload, render, icon, time } = ctx;
  const st = { mode: 'view', error: '', info: '' };   // view | setup | change | off
  let timer;

  const record = () => read(KEY);
  const hasPin = () => !!record();
  const unlocked = () => !hasPin() || isUnlocked(state.adminUntil, Date.now());

  function lock() { ONE.key = ''; ONE.typed = ''; ONE.error = ''; RESET_TEXT.mode = 'closed'; RESET_TEXT.typed = ''; RESET_TEXT.error = ''; state.adminUntil = 0; st.mode = 'view'; st.error = ''; st.info = ''; clearTimeout(timer); }
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

  /* ---------- master reset ---------- */
  async function saveBackup() {
    const file = backupFile({ events: await log.all(), history: await log.allHistory() },
      Object.fromEntries(diaryKeys(Object.keys(localStorage)).map((k) => [k, localStorage.getItem(k)])));
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    const a = h('a', { href: url, download: backupName() });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    RESET_TEXT.error = ''; ONE.error = ''; st.info = 'Backup saved to the Downloads folder.'; render();
  }
  async function doReset() {
    if (!confirmsReset(RESET_TEXT.typed)) { RESET_TEXT.error = `Type ${RESET_WORD} in capital letters to reset.`; render(); return; }
    await log.clearAll();
    for (const k of diaryKeys(Object.keys(localStorage))) localStorage.removeItem(k);
    try { for (const c of await caches.keys()) await caches.delete(c); } catch { /* no cache to clear */ }
    location.reload();
  }
  /* ---------- individual resets ---------- */
  const doctorGate = () => ctx.doctorInfo?.() ?? { pinHolders: 0, doctorSignedIn: false };
  const closeOne = () => { ONE.key = ''; ONE.typed = ''; ONE.error = ''; };
  async function doOne() {
    const scope = scopeByKey(ONE.key);
    if (!scope) return;
    if (!confirmsReset(ONE.typed)) { ONE.error = `Type ${RESET_WORD} in capital letters to reset.`; render(); return; }
    if (!scopeAllowed(scope, doctorGate())) { ONE.error = 'Doctor data is locked while a doctor has a PIN. A doctor can sign in under Doctors first.'; render(); return; }
    const n = await applyScope(scope, { log, storage: localStorage });
    closeOne();
    await reload();
    st.info = scope.forget ? `${scope.label} cleared.` : `${scope.label} reset${scope.types ? `: ${n} ${n === 1 ? 'entry' : 'entries'} removed` : ''}.`;
    render();
  }
  function oneRow(scope) {
    const n = countScope(state.events, scope, localStorage);
    const allowed = scopeAllowed(scope, doctorGate());
    return h('li', { class: 'reset-row', 'data-scope': scope.key },
      h('div', { class: 'reset-info' }, h('strong', {}, scope.label), h('span', { class: 'meta' }, n === 0 ? ' · nothing to remove' : scope.types ? ` · ${n} ${n === 1 ? 'entry' : 'entries'}` : scope.forget ? ` · ${n} remembered` : ` · ${n} saved`),
        h('p', { class: 'hint' }, scope.what)),
      h('button', { class: 'btn quiet', id: `reset-${scope.key}`, disabled: n === 0 || !allowed, 'aria-disabled': String(n === 0 || !allowed),
        'aria-label': `Reset ${scope.label}`, onclick: () => { closeOne(); ONE.key = scope.key; st.info = ''; render(); document.getElementById('one-type')?.focus(); } }, 'Reset…'),
      !allowed ? h('p', { class: 'hint' }, 'Locked while a doctor has a PIN. Sign in under Doctors to allow it.') : null);
  }
  function oneConfirm() {
    const scope = scopeByKey(ONE.key);
    const n = countScope(state.events, scope, localStorage);
    const ok = confirmsReset(ONE.typed);
    return h('div', { class: 'setting danger', id: 'one-zone', role: 'group', 'aria-labelledby': 'one-h' },
      h('h3', { id: 'one-h' }, `⚠ Reset ${scope.label}: this cannot be undone`),
      h('p', {}, h('strong', {}, 'Removes: '), scope.what, scope.types ? ` (${n} ${n === 1 ? 'entry' : 'entries'} now.)` : ''),
      h('p', {}, h('strong', {}, 'Keeps: '), scope.keeps),
      scope.types ? h('p', { class: 'hint' }, 'The entries and their change history are deleted from this tablet. A backup file keeps them.') : null,
      scope.types ? h('button', { class: 'btn', id: 'one-backup', onclick: saveBackup }, 'Save a backup file first') : null,
      h('div', { class: 'num-field' }, h('label', { for: 'one-type' }, `To continue, type ${RESET_WORD}`),
        h('input', { id: 'one-type', class: 'text', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', value: ONE.typed,
          oninput: (ev) => { ONE.typed = ev.target.value; const b = document.getElementById('one-go'); if (b) { const yes = confirmsReset(ONE.typed); b.disabled = !yes; b.setAttribute('aria-disabled', String(!yes)); } } })),
      ONE.error ? h('p', { class: 'error', role: 'alert' }, ONE.error) : null,
      h('div', { class: 'two' },
        h('button', { class: 'btn quiet', id: 'one-cancel', onclick: () => { closeOne(); render(); } }, 'Cancel'),
        h('button', { class: 'btn danger', id: 'one-go', disabled: !ok, 'aria-disabled': String(!ok), onclick: doOne }, "Delete these")));
  }
  function oneSection() {
    const recent = state.events.filter((e) => e.type === 'config' && e.kind === 'reset').slice(-5).reverse();
    return h('div', { class: 'setting', id: 'one-resets' },
      h('h3', {}, 'Reset one kind of data'),
      h('p', { class: 'hint' }, 'Each reset removes only what is listed, asks for DELETE, and leaves everything else alone.'),
      ONE.key ? oneConfirm() : h('ul', { class: 'reset-rows' }, ...SCOPES.map(oneRow)),
      recent.length ? h('details', { class: 'changes' }, h('summary', {}, 'Recent resets'),
        h('ul', {}, ...recent.map((e) => h('li', {}, `${resetNote(e)} · ${new Date(e.ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}, ${time(e.ms)}`)))) : null);
  }

  function resetSection() {
    if (RESET_TEXT.mode === 'closed') {
      return h('div', { class: 'setting danger', id: 'reset-zone' }, h('h3', {}, 'Master reset'),
        h('p', { class: 'hint' }, 'Wipes everything on this tablet and starts fresh.'),
        h('button', { class: 'btn', id: 'reset-open', onclick: () => { RESET_TEXT.mode = 'open'; RESET_TEXT.typed = ''; RESET_TEXT.error = ''; render(); } }, 'Reset everything…'));
    }
    const ok = confirmsReset(RESET_TEXT.typed);
    return h('div', { class: 'setting danger', id: 'reset-zone', role: 'group', 'aria-labelledby': 'reset-h' }, h('h3', { id: 'reset-h' }, '⚠ Master reset: this cannot be undone'),
      h('p', {}, 'This permanently deletes from this tablet:'),
      h('ul', { class: 'reset-list' },
        ...['every diary entry (water, meals, headaches, activities, weight, glucose, medicine answers)', 'all doctor accounts, targets, prescriptions and notes', 'the Admin and Doctor PINs', 'remembered foods and notes', 'all settings'].map((t) => h('li', {}, t))),
      h('p', { class: 'hint' }, 'A backup file keeps the diary entries and their history. It does not keep PINs. It cannot be loaded back in yet.'),
      h('button', { class: 'btn', id: 'reset-backup', onclick: saveBackup }, 'Save a backup file first'),
      h('div', { class: 'num-field' }, h('label', { for: 'reset-type' }, `To continue, type ${RESET_WORD}`),
        h('input', { id: 'reset-type', class: 'text', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', value: RESET_TEXT.typed,
          oninput: (ev) => { RESET_TEXT.typed = ev.target.value; const b = document.getElementById('reset-go'); if (b) { const yes = confirmsReset(RESET_TEXT.typed); b.disabled = !yes; b.setAttribute('aria-disabled', String(!yes)); } } })),
      RESET_TEXT.error ? h('p', { class: 'error', role: 'alert' }, RESET_TEXT.error) : null,
      h('div', { class: 'two' },
        h('button', { class: 'btn quiet', id: 'reset-cancel', onclick: () => { RESET_TEXT.mode = 'closed'; RESET_TEXT.typed = ''; RESET_TEXT.error = ''; render(); } }, 'Cancel'),
        h('button', { class: 'btn danger', id: 'reset-go', disabled: !ok, 'aria-disabled': String(!ok), onclick: doReset }, 'Delete everything')));
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
      h('p', { class: 'hint' }, 'A PIN is set. Admin locks itself after 5 minutes, and whenever Options is closed.'),
      buttons(
        h('button', { class: 'btn quiet', id: 'pin-change', onclick: () => { st.mode = 'change'; st.error = ''; st.info = ''; render(); } }, 'Change PIN'),
        h('button', { class: 'btn quiet', id: 'pin-off', onclick: () => { st.mode = 'off'; st.error = ''; st.info = ''; render(); } }, 'Turn PIN off')),
      h('button', { class: 'btn quiet small', id: 'pin-lock', onclick: () => { lock(); render(); } }, 'Lock now'));
  }

  /** extra: { screens, accounts } nodes from the other modules. Four side-tab groups; the PIN form forces the PIN group open. */
  function panel(extra) {
    if (!unlocked()) return lockedView();
    state.side ??= {};
    const groups = [
      { key: 'screens', label: 'Diary screens', nodes: [extra?.screens] },
      { key: 'accounts', label: 'Doctor accounts', nodes: [extra?.accounts] },
      { key: 'pin', label: 'Admin PIN', nodes: [pinSection()] },
      { key: 'reset', label: 'Reset data', nodes: [oneSection(), resetSection()] },
    ];
    const active = st.mode !== 'view' ? 'pin' : state.side.admin;
    return wrap(
      h('div', { class: 'lock' }, icon('lock'), h('div', {}, h('h3', {}, 'Family admin'),
        h('p', { class: 'hint' }, hasPin() ? 'Unlocked. It locks again in 5 minutes.' : 'Open for now. Set a PIN in the Admin PIN section to lock it.'))),
      st.info ? h('p', { class: 'meta', role: 'status' }, st.info) : null,
      sideTabs(h, { id: 'admin', label: 'Admin sections', groups, active,
        onPick: (k, focus) => { state.side.admin = k; render(); if (focus) document.getElementById('st-admin-' + k)?.focus(); } }));
  }

  return { panel, leave, lock, hasPin };
}
