// Prescriptions screens: the doctor's form (Doctors tab) and her dose card (main page).
// Every medicine, dose and instruction is typed by a doctor. The app adds no wording about medicines.
import { clockPicker } from './clock-ui.js';
import { validateRx, prescriptions, dosesFor, NAGS, FOOD, WEEKDAYS, describeRx, rxChanges, RX_INSTR_MAX, MAX_SLOTS } from './prescriptions.js';
import { doctors } from './doctors.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0];          // Monday first
const MESSAGES = {
  name: 'Please type the medicine name (up to 60 letters).',
  dose: 'Please type the dose, for example 500 mg.',
  food: 'Please choose one of the food options.',
  days: 'Please choose at least one day.',
  slots: 'Check the times: each one needs a window that opens before it closes, an exact time inside that window, and windows must not overlap.',
  instructions: `Instructions can be up to ${RX_INSTR_MAX} letters.`,
  nag: 'Please choose one of the reminder levels.',
};
const blank = () => ({ rxId: null, name: '', dose: '', food: '', days: 'daily', slots: [{ start: '07:00', end: '09:00', at: '08:00' }], instructions: '', nag: '', errors: [] });
const newId = () => 'rx' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------------- her card on the main page ---------------- */
export function rxMainCard(ctx) {
  const { h, state, log, reload, render, toast, time, ask } = ctx;
  const nameOf = (by) => (by === 'open' ? 'doctor' : doctors(state.events).find((d) => d.id === by)?.name ?? 'doctor');
  const answer = async (d, action) => {
    await log.add({ type: 'dose', rxId: d.rxId, slot: d.slot, forDay: state.key, action });
    await reload(); render();
    if (state.settings.savedCue) toast(action === 'taken' ? `Saved · ${d.name} taken` : `Saved · ${d.name} skipped`);
  };
  const undo = async (d) => {
    const reason = await ask(`Undo the answer for ${d.name}?`);
    if (!reason) return;
    const e = [...state.events].reverse().find((x) => x.type === 'dose' && !x.deleted && x.rxId === d.rxId && x.slot === d.slot && x.forDay === state.key);
    if (e) { await log.remove(e.id, reason); await reload(); render(); }
  };
  const pill = (d) => {
    const m = {
      taken: ['badge st-in', '✓ ', 'Taken'], late: ['badge st-near', '! ', 'Taken late'], skipped: ['badge', '– ', 'Skipped'],
      overdue: ['badge st-near', '! ', 'Overdue'], due: ['badge', '● ', 'Due now'], upcoming: ['badge', '', 'Later today'],
    }[d.state];
    return h('span', { class: m[0] }, h('span', { 'aria-hidden': 'true' }, m[1]), m[2]);
  };
  return function card() {
    const list = dosesFor(state.events, state.key, Date.now());
    if (!list.length) return null;
    return h('section', { class: 'panel', 'aria-labelledby': 'rx-h', id: 'rx-card' }, h('h2', { id: 'rx-h' }, 'Medicines today'),
      h('ul', { class: 'rx-list' }, ...list.map((d) => h('li', { class: 'rx-row', 'data-state': d.state, 'data-rx': d.rxId, 'data-slot': String(d.slot) },
        h('div', { class: 'rx-main' },
          h('p', { class: 'rx-name' }, h('strong', {}, d.name), ` · ${d.dose}`),
          h('p', { class: 'meta num' }, `${time(d.startMs)} to ${time(d.endMs)}`, d.food ? ` · ${FOOD.find((f) => f.key === d.food).label}` : ''),
          d.instructions ? h('p', { class: 'relief-text' }, d.instructions) : null,
          d.instructions ? h('p', { class: 'meta' }, `Written by ${nameOf(d.by)}`) : null,
          h('p', {}, pill(d), d.answeredMs ? h('span', { class: 'meta num' }, ` at ${time(d.answeredMs)}`) : null)),
        d.answeredMs
          ? h('div', { class: 'rx-actions' }, h('button', { class: 'btn quiet small', 'aria-label': `Undo answer for ${d.name}`, onclick: () => undo(d) }, 'Undo'))
          : (d.state === 'due' || d.state === 'overdue')
            ? h('div', { class: 'rx-actions' },
              h('button', { class: 'btn primary', 'data-act': 'taken', 'aria-label': `${d.name} taken`, onclick: () => answer(d, 'taken') }, 'Taken'),
              h('button', { class: 'btn quiet', 'data-act': 'skipped', 'aria-label': `${d.name} skipped`, onclick: () => answer(d, 'skipped') }, 'Skipped'))
            : null))));
  };
}

/* ---------------- the doctor's section ---------------- */
export function createRxDoctor(ctx, getHelpers) {
  const { h, state, log, reload, render, ask } = ctx;
  const f = { form: null };                      // the open form, or null
  const H = () => getHelpers();
  const rows = () => prescriptions(state.events);
  const sel = (id) => document.getElementById(id);
  const sync = () => {                           // keep what is typed before any redraw
    if (!f.form) return;
    const v = (id) => sel(id)?.value;
    if (v('rx-name') != null) f.form.name = v('rx-name');
    if (v('rx-dose') != null) f.form.dose = v('rx-dose');
    if (v('rx-instr') != null) f.form.instructions = v('rx-instr');
    if (v('rx-nag') != null) f.form.nag = v('rx-nag');
  };
  const redraw = () => { sync(); render(); };

  const edit = (p) => { f.form = p ? { ...blank(), ...p, days: p.days === 'daily' ? 'daily' : [...p.days], slots: p.slots.map((s) => ({ ...s })), errors: [] } : blank(); render(); };
  const cancel = () => { f.form = null; render(); };

  async function save() {
    sync();
    const { errors, value } = validateRx(f.form);
    if (errors.length) { f.form.errors = errors; render(); sel('rx-errors')?.scrollIntoView({ block: 'nearest' }); return; }
    const prev = rows().find((p) => p.rxId === f.form.rxId);
    if (prev && !rxChanges(prev, value).length) { f.form = null; H().say(`${value.name}: no change to save.`); return; }
    await log.add({ type: 'clinical', kind: 'rx', rxId: f.form.rxId ?? newId(), status: prev?.status ?? 'active', ...value, by: H().actor() });
    const msg = prev ? `${value.name}: saved.` : `${value.name} added.`;
    f.form = null; await reload(); H().say(msg);
  }

  async function setStatus(p, status) {
    let reason = '';
    if (status === 'ended') { reason = await ask(`End ${p.name}? It stops appearing. The history stays.`); if (!reason) return; }
    const { rxId, name, dose, food, days, slots, instructions, nag } = p;
    await log.add({ type: 'clinical', kind: 'rx', rxId, status, name, dose, food, days, slots, instructions, nag, reason, by: H().actor() });
    await reload(); H().say(`${name}: ${status === 'active' ? 'resumed' : status}.`);
  }

  const err = (k) => (f.form.errors.includes(k) ? h('p', { class: 'error', role: 'alert' }, MESSAGES[k]) : null);

  function formView() {
    const x = f.form; const clock = state.settings.clock;
    const toggleDay = (d) => { sync(); if (x.days === 'daily') x.days = []; x.days = x.days.includes(d) ? x.days.filter((n) => n !== d) : [...x.days, d]; render(); };
    return h('div', { class: 'rx-form panel', id: 'rx-form' },
      h('h3', {}, x.rxId ? `Edit ${x.name || 'prescription'}` : 'New prescription'),
      x.errors.length ? h('div', { id: 'rx-errors' }, ...x.errors.map(err)) : null,
      h('div', { class: 'num-field' }, h('label', { for: 'rx-name' }, 'Medicine name'), h('input', { id: 'rx-name', class: 'text', type: 'text', maxlength: '60', placeholder: 'e.g. the name as written on the prescription', value: x.name })),
      h('div', { class: 'num-field' }, h('label', { for: 'rx-dose' }, 'Dose'), h('input', { id: 'rx-dose', class: 'text', type: 'text', maxlength: '60', placeholder: 'e.g. 500 mg', value: x.dose })),
      h('div', { class: 'seg wrap', role: 'radiogroup', 'aria-label': 'Food instruction' },
        ...FOOD.map((o) => h('button', { class: 'chip', role: 'radio', 'aria-checked': String(x.food === o.key), 'data-food': o.key, onclick: () => { sync(); x.food = o.key; render(); } }, o.label))),
      h('fieldset', { class: 'rx-days' }, h('legend', {}, 'Days'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'rx-daily', checked: x.days === 'daily', onchange: (ev) => { sync(); x.days = ev.target.checked ? 'daily' : []; render(); } }), 'Every day'),
        x.days === 'daily' ? null : h('div', { class: 'seg wrap', role: 'group', 'aria-label': 'Choose days' },
          ...ORDER.map((d) => h('button', { class: 'chip', 'data-day': String(d), 'aria-pressed': String(x.days.includes(d)), onclick: () => toggleDay(d) }, WEEKDAYS[d])))),
      h('fieldset', { class: 'rx-slots' }, h('legend', {}, 'Times'),
        h('p', { class: 'hint' }, 'Each time has a window (when the dose may be taken) and an exact time inside it.'),
        ...x.slots.map((s, i) => h('div', { class: 'rx-slot', 'data-slot': String(i) },
          h('div', {}, h('span', { class: 'small-label' }, 'Window opens'), clockPicker(h, { id: `rx-s${i}-start`, value: s.start, clock, onChange: (v) => { s.start = v; } })),
          h('div', {}, h('span', { class: 'small-label' }, 'Exact time'), clockPicker(h, { id: `rx-s${i}-at`, value: s.at, clock, onChange: (v) => { s.at = v; } })),
          h('div', {}, h('span', { class: 'small-label' }, 'Window closes'), clockPicker(h, { id: `rx-s${i}-end`, value: s.end, clock, onChange: (v) => { s.end = v; } })),
          x.slots.length > 1 ? h('button', { class: 'btn quiet small', 'aria-label': `Remove time ${i + 1}`, onclick: () => { sync(); x.slots.splice(i, 1); render(); } }, 'Remove') : null)),
        err('slots'),
        x.slots.length < MAX_SLOTS ? h('button', { class: 'btn quiet', id: 'rx-add-slot', onclick: () => { sync(); x.slots.push({ start: '12:00', end: '14:00', at: '13:00' }); render(); } }, 'Add a time') : null),
      h('div', { class: 'num-field' }, h('label', { for: 'rx-instr' }, 'Instructions'),
        h('textarea', { id: 'rx-instr', class: 'text note-box', rows: '3', maxlength: String(RX_INSTR_MAX + 50), placeholder: 'e.g. the wording to show with this medicine' }, x.instructions)),
      h('div', { class: 'num-field' }, h('label', { for: 'rx-nag' }, 'Reminder level for this medicine'),
        h('select', { id: 'rx-nag', class: 'text' },
          h('option', { value: '', selected: x.nag === '' }, 'User\'s own setting (default)'),
          ...Object.entries(NAGS).map(([k, n]) => h('option', { value: k, selected: x.nag === k }, `${n.label} (fixed)`))),
        h('p', { class: 'hint' }, "Leave on the user's own setting to let them choose. A level chosen here is fixed for this medicine and cannot be changed from the Reminders tab.")),
      h('div', { class: 'two' }, h('button', { class: 'btn quiet', id: 'rx-cancel', onclick: cancel }, 'Cancel'), h('button', { class: 'btn primary', id: 'rx-save', onclick: save }, 'Save prescription')));
  }

  function section() {
    const ps = rows();
    const clock = state.settings.clock;
    return h('details', { class: 'setting fold', id: 'prescriptions', ...H().foldAttrs('prescriptions') }, h('summary', {}, 'Prescriptions and reminders'),
      h('p', { class: 'hint' }, 'Written by a doctor. The diary shows each dose with Taken and Skipped buttons and the doctor\'s instructions. It never suggests or changes anything.'),
      ps.length ? h('ul', { class: 'rx-doc-list' }, ...ps.map((p) => h('li', { class: 'rx-doc', 'data-rx': p.rxId, 'data-status': p.status },
        h('div', {}, h('strong', {}, p.name), ` · ${p.dose}`, p.status === 'active' ? null : h('span', { class: 'badge' }, ` ${p.status === 'paused' ? 'Paused' : 'Ended'}`)),
        h('p', { class: 'meta' }, describeRx(p, clock), p.nag ? ` · Reminders: ${NAGS[p.nag].label} (fixed)` : " · Reminders: user's own setting"),
        h('div', { class: 'rx-doc-actions' },
          p.status === 'ended' ? null : h('button', { class: 'btn quiet small', 'data-edit': p.rxId, onclick: () => edit(p) }, 'Edit'),
          p.status === 'active' ? h('button', { class: 'btn quiet small', 'data-pause': p.rxId, onclick: () => setStatus(p, 'paused') }, 'Pause') : null,
          p.status === 'paused' ? h('button', { class: 'btn quiet small', 'data-resume': p.rxId, onclick: () => setStatus(p, 'active') }, 'Resume') : null,
          p.status === 'ended' ? null : h('button', { class: 'btn quiet small', 'data-end': p.rxId, onclick: () => setStatus(p, 'ended') }, 'End'))))) : h('p', { class: 'hint' }, 'No prescriptions yet.'),
      f.form ? formView() : h('button', { class: 'btn quiet', id: 'rx-new', onclick: () => edit(null) }, 'Add a prescription'));
  }
  return { section };
}
