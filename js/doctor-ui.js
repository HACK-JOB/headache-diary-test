// The Doctors tab (accounts + change log) and the family-admin tools for managing doctor accounts.
// PINs are convenience locks (see pin.js). The family admin manages accounts but sees no clinical data.
import { validPinFormat, makeRecord, checkPin, afterFail, afterSuccess, lockedFor, unlockUntil, isUnlocked } from './pin.js';
import { doctors, validateDoctor, changeLog } from './doctors.js';
import { formatLongDate } from './time.js';

const TRIES = 'hd.doctorTries';
const readTries = () => { try { return JSON.parse(localStorage.getItem(TRIES)) ?? {}; } catch { return {}; } };

export function createDoctorUI(ctx) {
  const { h, state, log, reload, render, icon, ask, time } = ctx;
  const st = { mode: 'view', error: '', info: '', pick: '', resetId: '' };   // view | add | mine
  let timer;

  const list = () => doctors(state.events);
  const me = () => list().find((d) => d.id === state.doctorId) ?? null;
  const unlocked = () => !!me() && isUnlocked(state.doctorUntil, Date.now());

  function lock() { state.doctorUntil = 0; state.doctorId = null; st.mode = 'view'; st.error = ''; st.info = ''; clearTimeout(timer); }
  function unlock(id) {
    state.doctorId = id; state.doctorUntil = unlockUntil(Date.now());
    clearTimeout(timer);
    timer = setTimeout(() => { lock(); if (state.view === 'options') render(); }, state.doctorUntil - Date.now() + 50);
  }
  const leave = () => { if (state.doctorId) lock(); };

  const val = (id) => document.getElementById(id)?.value ?? '';
  const err = () => st.error ? h('p', { class: 'error', role: 'alert' }, st.error) : null;
  const pinField = (id, label, extra = {}) => h('div', { class: 'num-field' },
    h('label', { for: id }, label),
    h('input', { id, type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '6', autocomplete: 'off', class: 'text pin-input', ...extra }));
  const textField = (id, label, hint, extra = {}) => h('div', { class: 'num-field' },
    h('label', { for: id }, label), h('input', { id, type: 'text', class: 'text', autocomplete: 'off', placeholder: hint, ...extra }));
  const panel = (...kids) => h('section', { class: 'panel', id: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-doctors' }, ...kids);
  const fail = (m) => { st.error = m; render(); };

  /* ----- actions ----- */
  async function addDoctor(by) {
    const name = val('d-name'); const role = val('d-role'); const a = val('d-pin'); const b = val('d-pin2');
    if (validateDoctor({ name, role }).length) return fail('Please type a name and a role, for example "Dr Lee" and "GP".');
    if (!validPinFormat(a)) return fail('Please use 4 to 6 digits for the PIN, numbers only.');
    if (a !== b) return fail('The two PINs are different. Please type them again.');
    const id = (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    await log.add({ type: 'doctor', kind: 'add', doctorId: id, name: name.trim(), role: role.trim(), pin: await makeRecord(a), by });
    await reload();
    st.mode = 'view'; st.error = ''; st.info = `${name.trim()} was added.`;
    if (by !== 'admin' && by !== 'setup') { /* an unlocked doctor stays signed in */ } else if (by === 'setup') unlock(id);
    render();
  }

  async function signIn() {
    const id = val('d-pick') || list()[0]?.id; const d = list().find((x) => x.id === id);
    if (!d) return fail('Please choose a name.');
    const all = readTries(); const tries = all[id] ?? { fails: 0, until: 0 };
    const wait = lockedFor(tries, Date.now());
    if (wait) return fail(`Too many tries. Please wait ${Math.ceil(wait / 1000)} seconds.`);
    if (await checkPin(d.pin, val('d-pin-in'))) {
      all[id] = afterSuccess(); localStorage.setItem(TRIES, JSON.stringify(all));
      st.error = ''; st.pick = id; unlock(id); render();
    } else {
      const next = afterFail(tries, Date.now()); all[id] = next; localStorage.setItem(TRIES, JSON.stringify(all));
      const w = lockedFor(next, Date.now());
      st.pick = id;
      fail(w ? `That PIN is not right. Please wait ${Math.ceil(w / 1000)} seconds before trying again.` : 'That PIN is not right.');
    }
  }

  async function changeMine() {
    const d = me(); if (!d) return;
    const a = val('m-new'); const b = val('m-again');
    if (!(await checkPin(d.pin, val('m-old')))) return fail('The current PIN is not right.');
    if (!validPinFormat(a)) return fail('Please use 4 to 6 digits, numbers only.');
    if (a !== b) return fail('The two PINs are different. Please type them again.');
    await log.add({ type: 'doctor', kind: 'pin', doctorId: d.id, pin: await makeRecord(a), by: d.id });
    await reload(); st.mode = 'view'; st.error = ''; st.info = 'Your PIN was changed.'; render();
  }

  async function adminReset(id) {
    const a = val('r-new'); const b = val('r-again');
    if (!validPinFormat(a)) return fail('Please use 4 to 6 digits, numbers only.');
    if (a !== b) return fail('The two PINs are different. Please type them again.');
    await log.add({ type: 'doctor', kind: 'pin', doctorId: id, pin: await makeRecord(a), by: 'admin' });
    const all = readTries(); delete all[id]; localStorage.setItem(TRIES, JSON.stringify(all));
    await reload(); st.resetId = ''; st.error = ''; st.info = 'The PIN was reset.'; render();
  }

  async function adminRemove(d) {
    const reason = await ask(`Remove ${d.name}?`);
    if (!reason) return;
    await log.add({ type: 'doctor', kind: 'remove', doctorId: d.id, by: 'admin', reason });
    if (state.doctorId === d.id) lock();
    await reload(); st.info = `${d.name} was removed.`; render();
  }

  /* ----- views ----- */
  const addForm = (by, title) => h('div', { class: 'setting' },
    h('h3', {}, title),
    h('p', { class: 'hint' }, 'The name and role are shown next to anything this person writes. The PIN is theirs: please do not share it.'),
    err(),
    textField('d-name', 'Name', 'e.g. Dr Lee'),
    textField('d-role', 'Role', 'e.g. GP or Dietitian'),
    pinField('d-pin', 'PIN (4 to 6 numbers)'),
    pinField('d-pin2', 'Type the PIN again', { onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addDoctor(by); } } }),
    h('div', { class: 'two' },
      list().length ? h('button', { class: 'btn quiet', id: 'd-cancel', onclick: () => { st.mode = 'view'; st.error = ''; render(); } }, 'Cancel') : h('span', {}),
      h('button', { class: 'btn primary', id: 'd-save', onclick: () => addDoctor(by) }, 'Add doctor')));

  function loginView() {
    const ds = list();
    return panel(
      h('div', { class: 'lock' }, icon('lock'), h('div', {}, h('h3', {}, 'Doctors'), h('p', { class: 'hint' }, 'For her doctor or dietitian. Choose your name and type your PIN.'))),
      err(),
      h('div', { class: 'num-field' }, h('label', { for: 'd-pick' }, 'Name'),
        h('select', { id: 'd-pick', class: 'text', onchange: (ev) => { st.pick = ev.target.value; } },
          ...ds.map((d) => h('option', { value: d.id, selected: d.id === st.pick }, `${d.name} (${d.role})`)))),
      pinField('d-pin-in', 'PIN', { onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); signIn(); } } }),
      h('button', { class: 'btn primary', id: 'd-go', onclick: signIn }, 'Open doctors'),
      h('p', { class: 'hint' }, 'A lost PIN is reset by the family in the Admin tab.'));
  }

  function logView() {
    const entries = changeLog(state.events);
    const nameOf = (e) => e.byName;
    return h('div', { class: 'setting' }, h('h3', {}, 'Change log'),
      h('p', { class: 'hint' }, 'Every change, who made it and when. It cannot be edited.'),
      entries.length ? h('ul', { class: 'change-list' }, ...entries.map((e) => h('li', {},
        h('strong', {}, e.what), e.from || e.to ? h('span', {}, ` from ${e.from || 'nothing'} to ${e.to || 'nothing'}`) : null,
        h('span', { class: 'meta' }, ` ${nameOf(e)}, ${`${formatLongDate(e.ms)} ${time(e.ms)}`}`)))) : h('p', { class: 'hint' }, 'Nothing has been changed yet.'));
  }

  function mineForm() {
    return h('div', { class: 'setting' }, h('h3', {}, 'Change my PIN'), err(),
      pinField('m-old', 'Current PIN'), pinField('m-new', 'New PIN'),
      pinField('m-again', 'Type the new PIN again', { onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); changeMine(); } } }),
      h('div', { class: 'two' },
        h('button', { class: 'btn quiet', id: 'm-cancel', onclick: () => { st.mode = 'view'; st.error = ''; render(); } }, 'Cancel'),
        h('button', { class: 'btn primary', id: 'm-save', onclick: changeMine }, 'Save PIN')));
  }

  function doctorsPanel(sections = []) {
    if (!list().length) {
      return panel(h('div', { class: 'lock' }, icon('lock'), h('div', {}, h('h3', {}, 'Doctors'), h('p', { class: 'hint' }, 'No doctor has been added yet. The first person to add one, you or the doctor, sets up the first account.'))), addForm('setup', 'Add the first doctor'));
    }
    if (!unlocked()) return loginView();
    const d = me();
    return panel(
      h('div', { class: 'lock' }, icon('lock'), h('div', {}, h('h3', {}, `${d.name} (${d.role})`), h('p', { class: 'hint' }, 'Unlocked. It locks again in 5 minutes, or when you leave Options.'))),
      st.info ? h('p', { class: 'meta', role: 'status' }, st.info) : null,
      h('div', { class: 'two' },
        h('button', { class: 'btn quiet', id: 'd-mine', onclick: () => { st.mode = 'mine'; st.error = ''; st.info = ''; render(); } }, 'Change my PIN'),
        h('button', { class: 'btn quiet', id: 'd-lock', onclick: () => { lock(); render(); } }, 'Lock now')),
      st.mode === 'mine' ? mineForm() : null,
      st.mode === 'add' ? addForm(d.id, 'Add a new doctor')
        : h('div', { class: 'setting' }, h('h3', {}, 'Doctors on this diary'),
          h('ul', { class: 'plain-list' }, ...list().map((x) => h('li', {}, `${x.name} (${x.role})`))),
          h('button', { class: 'btn quiet', id: 'd-add', onclick: () => { st.mode = 'add'; st.error = ''; st.info = ''; render(); } }, 'Add new doctor')),
      ...sections,
      logView());
  }

  /** Family-admin tools, shown inside the Admin tab: no clinical data here. */
  function adminAccounts() {
    const ds = list();
    return h('div', { class: 'setting', id: 'admin-accounts' }, h('h3', {}, 'Doctor accounts'),
      h('p', { class: 'hint' }, 'You can add or remove a doctor and reset a PIN here. You cannot see anything clinical.'),
      st.info ? h('p', { class: 'meta', role: 'status' }, st.info) : null,
      st.mode === 'add' && !unlocked() ? addForm('admin', 'Add a doctor') : null,
      ds.length ? h('ul', { class: 'account-list' }, ...ds.map((d) => h('li', {},
        h('span', { class: 'who' }, `${d.name} (${d.role})`),
        st.resetId === d.id
          ? h('div', { class: 'reset-form' }, err(), pinField('r-new', 'New PIN'), pinField('r-again', 'Type it again', { onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); adminReset(d.id); } } }),
            h('div', { class: 'two' }, h('button', { class: 'btn quiet', onclick: () => { st.resetId = ''; st.error = ''; render(); } }, 'Cancel'), h('button', { class: 'btn primary', id: 'r-save', onclick: () => adminReset(d.id) }, 'Save new PIN')))
          : h('div', { class: 'two' },
            h('button', { class: 'btn quiet', 'data-reset': d.id, onclick: () => { st.resetId = d.id; st.error = ''; st.info = ''; render(); } }, 'Reset PIN'),
            h('button', { class: 'btn quiet', 'data-remove': d.id, onclick: () => adminRemove(d) }, 'Remove'))))) : h('p', { class: 'hint' }, 'No doctors yet.'),
      st.mode !== 'add' ? h('button', { class: 'btn quiet', id: 'a-add', onclick: () => { st.mode = 'add'; st.error = ''; st.info = ''; render(); } }, 'Add a doctor') : null);
  }

  return { panel: doctorsPanel, adminAccounts, leave, lock };
}
