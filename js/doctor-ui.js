// The Doctors tab (accounts + change log) and the family-admin tools for managing doctor accounts.
// PINs are convenience locks (see pin.js). The family admin manages accounts but sees no clinical data.
import { validPinFormat, makeRecord, checkPin, afterFail, afterSuccess, lockedFor, unlockUntil, isUnlocked } from './pin.js';
import { doctors, validateDoctor, changeLog, needsLogin, targets, validateTarget, TARGET_KEYS, DEFAULT_MARGIN, MAX_MARGIN,
  reliefTypes, reliefFor, validateRelief, RELIEF_MAX, urgentGlucose, validateUrgent, URGENT_MAX, fasting, notes } from './doctors.js';
import { formatLongDate } from './time.js';

const TRIES = 'hd.doctorTries';
const readTries = () => { try { return JSON.parse(localStorage.getItem(TRIES)) ?? {}; } catch { return {}; } };

export function createDoctorUI(ctx) {
  const { h, state, log, reload, render, icon, ask, time } = ctx;
  const st = { openFold: {}, cmsg: '', cerr: '', tmsg: '', terr: '', tbad: {}, mode: 'view', error: '', info: '', pick: '', resetId: '', setId: '' };   // view | add | mine
  let timer;

  const list = () => doctors(state.events);
  const me = () => list().find((d) => d.id === state.doctorId) ?? null;
  const open = () => !needsLogin(state.events);      // nobody has a PIN yet: the tab is open
  const unlocked = () => open() || (!!me() && isUnlocked(state.doctorUntil, Date.now()));
  const actor = () => (open() ? 'open' : me()?.id ?? 'open');

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
    const skipPin = open() && a === '' && b === '';       // while the tab is open a PIN can be added later
    if (!skipPin && !validPinFormat(a)) return fail('Please use 4 to 6 digits for the PIN, numbers only.');
    if (!skipPin && a !== b) return fail('The two PINs are different. Please type them again.');
    const id = (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    await log.add({ type: 'doctor', kind: 'add', doctorId: id, name: name.trim(), role: role.trim(), pin: skipPin ? null : await makeRecord(a), by: open() ? 'open' : by });
    await reload();
    st.mode = 'view'; st.error = ''; st.info = skipPin ? `${name.trim()} was added. Set a PIN below to lock this tab.` : `${name.trim()} was added.`;
    if (by === 'setup' && !skipPin) unlock(id);
    render();
  }

  async function setPinFor(d) {
    const a = val('s-new'); const b = val('s-again');
    if (!validPinFormat(a)) return fail('Please use 4 to 6 digits, numbers only.');
    if (a !== b) return fail('The two PINs are different. Please type them again.');
    await log.add({ type: 'doctor', kind: 'pin', doctorId: d.id, pin: await makeRecord(a), by: 'open' });
    await reload(); st.setId = ''; st.error = '';
    st.info = `A PIN was set for ${d.name}. ${needsLogin(state.events) ? 'This tab now asks for a name and PIN.' : ''}`;
    lock(); render();
  }

  async function signIn() {
    const id = val('d-pick') || list().find((x) => x.pin)?.id; const d = list().find((x) => x.id === id);
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
    await reload(); st.mode = 'view'; st.error = ''; st.info = 'The PIN was changed.'; render();
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
    pinField('d-pin', open() ? 'PIN (4 to 6 numbers, or leave empty for now)' : 'PIN (4 to 6 numbers)'),
    pinField('d-pin2', 'Type the PIN again', { onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addDoctor(by); } } }),
    h('div', { class: 'two' },
      list().length ? h('button', { class: 'btn quiet', id: 'd-cancel', onclick: () => { st.mode = 'view'; st.error = ''; render(); } }, 'Cancel') : h('span', {}),
      h('button', { class: 'btn primary', id: 'd-save', onclick: () => addDoctor(by) }, 'Add doctor')));

  function loginView() {
    const ds = list().filter((d) => d.pin);
    return panel(
      h('div', { class: 'lock' }, icon('lock'), h('div', {}, h('h3', {}, 'Doctors'), h('p', { class: 'hint' }, 'For doctor or dietitian. Choose a name and type the PIN.'))),
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


  /* Sections fold away so the tab is not one very long page; the open/closed choice survives re-rendering. */
  const foldAttrs = (id) => ({ open: !!st.openFold[id], ontoggle: (ev) => { st.openFold[id] = ev.target.open; } });

  /* ----- targets (5b) ----- */
  async function saveTarget(key) {
    const g = (p) => document.getElementById(`t-${key}-${p}`)?.value ?? '';
    const raw = { min: g('min'), max: g('max'), margin: g('margin') };
    const { errors, value } = validateTarget(raw);
    const label = TARGET_KEYS.find((k) => k.key === key).label;
    st.tmsg = ''; st.terr = ''; st.tbad = {};
    if (errors.length) {
      st.tbad = { [key]: errors };
      st.terr = errors.includes('max') && !errors.includes('min') && raw.min !== '' && raw.max !== '' && Number(String(raw.min).replace(',', '.')) > Number(String(raw.max).replace(',', '.'))
        ? `${label}: the minimum is higher than the maximum. Please check the two numbers.`
        : errors.includes('margin') ? `${label}: the warning margin must be a number from 0 to ${MAX_MARGIN}.` : `${label}: please type numbers only, for example 1500.`;
      st.draftT = raw; st.draftKey = key; render(); return;
    }
    const cur = targets(state.events)[key];
    const same = cur ? cur.min === value.min && cur.max === value.max && cur.margin === value.margin : value.min == null && value.max == null;
    if (same) { st.draftT = null; st.tmsg = `${label}: no change to save.`; render(); return; }
    await log.add({ type: 'clinical', kind: 'target', key, min: value.min, max: value.max, margin: value.margin, by: actor() });
    st.draftT = null; await reload();
    st.tmsg = value.min == null && value.max == null ? `${label} target cleared.` : `${label} target saved.`;
    render();
  }

  function targetsSection() {
    const tg = targets(state.events);
    return h('details', { class: 'setting fold', id: 'targets', ...foldAttrs('targets') }, h('summary', {}, 'Daily targets'),
      h('p', { class: 'hint' }, 'Only what a doctor sets here is used. Leave both boxes empty for no target. A total turns orange when it is within the margin of a limit, and red when it is past it. Each status also shows a word and a sign.'),
      st.tmsg ? h('p', { class: 'meta', role: 'status' }, st.tmsg) : null,
      st.terr ? h('p', { class: 'error', role: 'alert' }, st.terr) : null,
      h('ul', { class: 'target-list' }, ...TARGET_KEYS.map(({ key, label, unit }) => {
        const t = tg[key]; const dr = st.draftKey === key && st.draftT ? st.draftT : null; const bad = st.tbad[key] ?? [];
        const field = (p, lab, v, hint) => h('div', { class: 'num-field' }, h('label', { for: `t-${key}-${p}` }, lab),
          h('input', { id: `t-${key}-${p}`, type: 'text', inputmode: 'decimal', class: 'text' + (bad.includes(p) ? ' bad' : ''), value: v, placeholder: hint, 'aria-invalid': String(bad.includes(p)) }));
        return h('li', { class: 'target-row', 'data-key': key },
          h('span', { class: 'who' }, `${label} (${unit})`, t ? h('span', { class: 'hint' }, ` set by ${t.by === 'open' ? 'open access' : (doctors(state.events).find((d) => d.id === t.by)?.name ?? 'a doctor')}`) : null),
          h('div', { class: 'target-fields' },
            field('min', 'At least', dr ? dr.min : (t?.min ?? ''), 'e.g. 1500'),
            field('max', 'No more than', dr ? dr.max : (t?.max ?? ''), 'e.g. 2500'),
            field('margin', 'Warn within %', dr ? dr.margin : (t?.margin ?? DEFAULT_MARGIN), '20'),
            h('button', { class: 'btn quiet', 'data-save-target': key, onclick: () => saveTarget(key) }, 'Save')));
      })));
  }

  /* ----- doctor-written content (5c) ----- */
  const say = (m) => { st.cmsg = m; st.cerr = ''; render(); };
  const complain = (m) => { st.cerr = m; st.cmsg = ''; render(); };
  const byLabel = (by) => (by === 'open' ? 'open access' : doctors(state.events).find((d) => d.id === by)?.name ?? 'a doctor');

  async function saveRelief(key, name) {
    const { errors, text } = validateRelief(val('rl-' + key));
    if (errors.length) return complain(`${name}: please keep it under ${RELIEF_MAX} letters so it fits on screen.`);
    const cur = reliefFor(state.events, key)?.text ?? '';
    if (cur === text) return say(`${name}: no change to save.`);
    await log.add({ type: 'clinical', kind: 'relief', headacheType: key, text, by: actor() });
    await reload(); say(text ? `${name}: relief text saved.` : `${name}: relief text cleared.`);
  }

  async function saveUrgent() {
    const { errors, value } = validateUrgent({ threshold: val('ug-threshold'), text: val('ug-text') });
    if (errors.includes('threshold')) return complain('Urgent message: please type the glucose number it applies below, for example 4.');
    if (errors.includes('text')) return complain(`Urgent message: please type the wording (up to ${URGENT_MAX} letters).`);
    const cur = urgentGlucose(state.events);
    if ((cur?.threshold ?? null) === value.threshold && (cur?.text ?? '') === value.text) return say('Urgent message: no change to save.');
    await log.add({ type: 'clinical', kind: 'urgent', threshold: value.threshold, text: value.text, by: actor() });
    await reload(); say(value.threshold == null ? 'Urgent message cleared.' : 'Urgent message saved.');
  }

  async function flipFasting(on) {
    await log.add({ type: 'clinical', kind: 'fasting', on, by: actor() });
    await reload(); say(on ? 'Fasting tags are on.' : 'Fasting tags are off.');
  }

  async function addNote() {
    const text = val('note-text').trim();
    if (!text) return complain('Please type the note first.');
    await log.add({ type: 'clinical', kind: 'note', text, by: actor() });
    await reload(); say('Note added.');
  }

  function clinicalSections() {
    const u = urgentGlucose(state.events);
    const ns = notes(state.events);
    const area = (id, label, value, hint, extra = {}) => h('div', { class: 'num-field' }, h('label', { for: id }, label),
      h('textarea', { id, class: 'text note-box', rows: '3', placeholder: hint, ...extra }, value));
    return [
      st.cmsg ? h('p', { class: 'meta', role: 'status', id: 'c-status' }, st.cmsg) : null,
      st.cerr ? h('p', { class: 'error', role: 'alert' }, st.cerr) : null,
      h('details', { class: 'setting fold', id: 'relief', ...foldAttrs('relief') }, h('summary', {}, 'Common remedies for each headache type'),
        h('p', { class: 'hint' }, 'Written by a doctor, in the doctor\'s own words. It appears on screen while that type of headache is active, with the doctor\'s name. If nothing is written, nothing is shown. The app never adds advice of its own.'),
        h('ul', { class: 'relief-list' }, ...reliefTypes().map(({ key, name }) => {
          const r = reliefFor(state.events, key);
          return h('li', { class: 'relief-row', 'data-type': key },
            h('span', { class: 'who' }, name, r ? h('span', { class: 'hint' }, ` written by ${r.byName}`) : null),
            area('rl-' + key, `Text for ${name}`, r?.text ?? '', 'e.g. the text to show for this type', { maxlength: String(RELIEF_MAX + 50) }),
            h('button', { class: 'btn quiet', 'data-save-relief': key, onclick: () => saveRelief(key, name) }, 'Save'));
        }))),
      h('details', { class: 'setting fold', id: 'glucose-set', ...foldAttrs('glucose-set') }, h('summary', {}, 'Blood glucose settings'),
        h('p', { class: 'hint' }, 'Used when glucose readings are added. The wording below is shown exactly as written, only when a reading is below the number set here.'),
        h('div', { class: 'num-field' }, h('label', { for: 'ug-threshold' }, 'Show the message when a reading is below (mmol/L)'),
          h('input', { id: 'ug-threshold', type: 'text', inputmode: 'decimal', class: 'text', placeholder: 'e.g. 4', value: u?.threshold ?? '' })),
        area('ug-text', 'Wording to show', u?.text ?? '', 'e.g. the instruction to show', { maxlength: String(URGENT_MAX + 50) }),
        h('button', { class: 'btn quiet', id: 'ug-save', onclick: saveUrgent }, 'Save urgent message'),
        h('label', { class: 'check', style: 'margin-top:0.9rem' }, h('input', { type: 'checkbox', id: 'fasting-on', checked: fasting(state.events), onchange: (ev) => flipFasting(ev.target.checked) }), 'Ask whether a reading was fasting, before a meal or after a meal'),
        h('p', { class: 'hint' }, 'Off by default. No fasting instructions are given by the app.')),
      h('details', { class: 'setting fold', id: 'notes', ...foldAttrs('notes') }, h('summary', {}, 'Clinical notes'),
        h('p', { class: 'hint' }, 'For doctors. These are not shown on the diary screens. Notes cannot be edited after they are added.'),
        area('note-text', 'New note', '', 'e.g. what you want the next doctor to know'),
        h('button', { class: 'btn quiet', id: 'note-add', onclick: addNote }, 'Add note'),
        ns.length ? h('ul', { class: 'change-list' }, ...ns.map((n) => h('li', {}, h('span', {}, n.text), h('span', { class: 'meta' }, ` ${n.byName === 'Open access (no PIN set)' ? n.byName : n.byName}, ${formatLongDate(n.ms)} ${time(n.ms)}`)))) : h('p', { class: 'hint' }, 'No notes yet.')),
    ];
  }

  function openPanel(sections) {
    const ds = list();
    return panel(
      h('div', { class: 'lock' }, icon('unlock'), h('div', {}, h('h3', {}, 'Doctors'),
        h('p', { class: 'hint' }, 'Open for now: nobody has set a PIN yet, so anyone using this tablet can see and change this tab. Set a PIN for a doctor to lock it.'))),
      st.info ? h('p', { class: 'meta', role: 'status' }, st.info) : null,
      ds.length ? h('div', { class: 'setting' }, h('h3', {}, 'Doctors on this diary'),
        h('ul', { class: 'account-list' }, ...ds.map((d) => h('li', {},
          h('span', { class: 'who' }, `${d.name} (${d.role})`),
          st.setId === d.id
            ? h('div', { class: 'reset-form' }, err(), pinField('s-new', 'New PIN (4 to 6 numbers)'),
              pinField('s-again', 'Type it again', { onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); setPinFor(d); } } }),
              h('div', { class: 'two' }, h('button', { class: 'btn quiet', onclick: () => { st.setId = ''; st.error = ''; render(); } }, 'Cancel'), h('button', { class: 'btn primary', id: 's-save', onclick: () => setPinFor(d) }, 'Save PIN')))
            : h('button', { class: 'btn quiet', 'data-setpin': d.id, onclick: () => { st.setId = d.id; st.error = ''; st.info = ''; render(); } }, 'Set a PIN'))))) : null,
      st.mode === 'add' || !ds.length ? addForm('open', ds.length ? 'Add a new doctor' : 'Add the first doctor')
        : h('button', { class: 'btn quiet', id: 'd-add', onclick: () => { st.mode = 'add'; st.error = ''; st.info = ''; render(); } }, 'Add new doctor'),
      targetsSection(),
      ...clinicalSections(),
      ...sections,
      logView());
  }

  function doctorsPanel(sections = []) {
    if (open()) return openPanel(sections);
    if (!unlocked()) return loginView();
    const d = me();
    return panel(
      h('div', { class: 'lock' }, icon('lock'), h('div', {}, h('h3', {}, `${d.name} (${d.role})`), h('p', { class: 'hint' }, 'Unlocked. It locks again in 5 minutes, or when Options is closed.'))),
      st.info ? h('p', { class: 'meta', role: 'status' }, st.info) : null,
      h('div', { class: 'two' },
        h('button', { class: 'btn quiet', id: 'd-mine', onclick: () => { st.mode = 'mine'; st.error = ''; st.info = ''; render(); } }, 'Change my PIN'),
        h('button', { class: 'btn quiet', id: 'd-lock', onclick: () => { lock(); render(); } }, 'Lock now')),
      st.mode === 'mine' ? mineForm() : null,
      st.mode === 'add' ? addForm(d.id, 'Add a new doctor')
        : h('div', { class: 'setting' }, h('h3', {}, 'Doctors on this diary'),
          h('ul', { class: 'plain-list' }, ...list().map((x) => h('li', {}, `${x.name} (${x.role})${x.pin ? '' : ' - no PIN yet'}`))),
          h('button', { class: 'btn quiet', id: 'd-add', onclick: () => { st.mode = 'add'; st.error = ''; st.info = ''; render(); } }, 'Add new doctor')),
      targetsSection(),
      ...clinicalSections(),
      ...sections,
      logView());
  }

  /** Family-admin tools, shown inside the Admin tab: no clinical data here. */
  function adminAccounts() {
    const ds = list();
    return h('div', { class: 'setting', id: 'admin-accounts' }, h('h3', {}, 'Doctor accounts'),
      h('p', { class: 'hint' }, 'Doctors can be added or removed and PINs reset here. Nothing clinical is shown in this section.'),
      st.info ? h('p', { class: 'meta', role: 'status' }, st.info) : null,
      st.mode === 'add' && !unlocked() ? addForm('admin', 'Add a doctor') : null,
      ds.length ? h('ul', { class: 'account-list' }, ...ds.map((d) => h('li', {},
        h('span', { class: 'who' }, `${d.name} (${d.role})`),
        st.resetId === d.id
          ? h('div', { class: 'reset-form' }, err(), pinField('r-new', 'New PIN'), pinField('r-again', 'Type it again', { onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); adminReset(d.id); } } }),
            h('div', { class: 'two' }, h('button', { class: 'btn quiet', onclick: () => { st.resetId = ''; st.error = ''; render(); } }, 'Cancel'), h('button', { class: 'btn primary', id: 'r-save', onclick: () => adminReset(d.id) }, 'Save new PIN')))
          : h('div', { class: 'two' },
            h('button', { class: 'btn quiet', 'data-reset': d.id, onclick: () => { st.resetId = d.id; st.error = ''; st.info = ''; render(); } }, d.pin ? 'Reset PIN' : 'Set PIN'),
            h('button', { class: 'btn quiet', 'data-remove': d.id, onclick: () => adminRemove(d) }, 'Remove'))))) : h('p', { class: 'hint' }, 'No doctors yet.'),
      st.mode !== 'add' ? h('button', { class: 'btn quiet', id: 'a-add', onclick: () => { st.mode = 'add'; st.error = ''; st.info = ''; render(); } }, 'Add a doctor') : null);
  }

  return { panel: doctorsPanel, adminAccounts, leave, lock };
}
