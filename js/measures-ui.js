// Weight (once a day after WOKE UP) and blood glucose screens, plus the Admin switch for showing weight back to her.
import { validateWeight, validateGlucose, GLUCOSE_TAGS, needsWeight, weightToday, weightNeedsCheck, glucoseToday, glucoseStatus, weightShown, weightShownEvent } from './measures.js';
import { targets, urgentFor, fasting } from './doctors.js';

export function createMeasuresUI(ctx) {
  const { h, state, log, reload, render, toast, time, icon, fmt, ask } = ctx;
  const st = { stage: 'enter', kg: null, error: '', recheck: false, gError: '', gTag: null, gDone: '' };
  const val = (id) => document.getElementById(id)?.value ?? '';
  const saved = (m) => { if (state.settings.savedCue) toast(m); };
  const reset = () => { st.stage = 'enter'; st.kg = null; st.error = ''; st.recheck = false; };

  /* ---------- weight: asked once, after WOKE UP ---------- */
  function checkWeight() {
    const { errors, kg } = validateWeight(val('w-kg'));
    if (errors.length) { st.error = 'Please type the weight in kilograms, for example 61.4.'; render(); return; }
    st.kg = kg; st.error = ''; st.stage = 'confirm';
    st.recheck = weightNeedsCheck(state.events, kg, state.key);
    render();
    document.getElementById('w-yes')?.focus();
  }
  async function confirmWeight() {
    await log.add({ type: 'measure', kind: 'weight', kg: st.kg });
    reset(); await reload(); render(); saved('Saved · weight');
  }
  async function skipWeight() {
    await log.add({ type: 'measure', kind: 'weight-skip' });
    reset(); await reload(); render(); saved('Saved · no weight today');
  }

  function weightCard() {
    const done = weightToday(state.events, state.key);
    if (!needsWeight(state.events, state.key)) {
      if (!done) return null;
      return h('section', { class: 'panel', 'aria-labelledby': 'wt-h' }, h('h2', { id: 'wt-h' }, 'Weight'),
        weightShown(state.events) ? h('p', { class: 'active-line strong', id: 'wt-shown' }, `Today: ${fmt(done.kg)} kg`) : h('p', { class: 'active-line' }, 'Weight is saved for the doctor.'));
    }
    if (st.stage === 'confirm') {
      return h('section', { class: 'panel', 'aria-labelledby': 'wt-h' }, h('h2', { id: 'wt-h' }, 'Weight'),
        h('p', { class: 'active-line strong' }, `Entered: ${fmt(st.kg)} kg. Is that right?`),
        st.recheck ? h('p', { class: 'hint', id: 'wt-recheck' }, 'This is quite different from recent numbers. Please look at the scales again.') : null,
        h('div', { class: 'two' },
          h('button', { class: 'btn quiet', id: 'w-no', onclick: () => { st.stage = 'enter'; render(); document.getElementById('w-kg')?.focus(); } }, 'No, change it'),
          h('button', { class: 'btn primary', id: 'w-yes', onclick: confirmWeight }, 'Yes, that is right')));
    }
    return h('section', { class: 'panel', 'aria-labelledby': 'wt-h' }, h('h2', { id: 'wt-h' }, 'Weight'),
      h('p', { class: 'hint' }, 'Once a day, after waking up.'),
      st.error ? h('p', { class: 'error', role: 'alert' }, st.error) : null,
      h('div', { class: 'custom' },
        h('label', { class: 'small-label', for: 'w-kg' }, 'Weight (kg)'),
        h('input', { id: 'w-kg', type: 'text', inputmode: 'decimal', class: 'text', placeholder: 'e.g. 61.4', value: st.kg ?? '', onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); checkWeight(); } } }),
        h('button', { class: 'btn primary', id: 'w-save', onclick: checkWeight }, 'Check')),
      h('button', { class: 'btn quiet small', id: 'w-skip', onclick: skipWeight }, 'Not today'));
  }

  /* ---------- glucose ---------- */
  async function saveGlucose() {
    const tagOn = fasting(state.events);
    const { errors, mmol, tag } = validateGlucose(val('g-mmol'), tagOn ? st.gTag : null);
    if (errors.includes('mmol')) { st.gError = 'Please type the number from the meter, for example 6.8.'; render(); return; }
    st.gError = '';
    await log.add({ type: 'measure', kind: 'glucose', mmol, tag });
    st.gTag = null; await reload();
    st.gDone = String(mmol);
    render(); saved(`Saved · glucose ${fmt(mmol)}`);
  }
  async function removeGlucose(e) {
    const reason = await ask('Remove this reading?');
    if (!reason) return;
    await log.remove(e.id, reason); await reload(); render(); saved('Saved · reading removed');
  }

  function glucoseCard() {
    const list = glucoseToday(state.events, state.key);
    const target = targets(state.events).glucose;
    const tagOn = fasting(state.events);
    const latest = list[0];
    const urgent = latest ? urgentFor(state.events, latest.mmol) : null;
    return h('section', { class: 'panel', 'aria-labelledby': 'gl-h' }, h('h2', { id: 'gl-h' }, 'Blood glucose'),
      st.gError ? h('p', { class: 'error', role: 'alert' }, st.gError) : null,
      urgent ? h('div', { class: 'urgent-box', role: 'alert', id: 'urgent' },
        h('h3', {}, 'From doctor'), h('p', { class: 'relief-text' }, urgent.text),
        h('p', { class: 'meta' }, urgent.by === 'open' ? 'Written by doctor' : `Written by ${urgent.byName}`)) : null,
      tagOn ? h('div', { class: 'chips', role: 'group', 'aria-label': 'When was this reading?' },
        ...GLUCOSE_TAGS.map((t) => h('button', { class: 'chip', 'data-tag': t.key, 'aria-pressed': String(st.gTag === t.key), onclick: () => { st.gTag = st.gTag === t.key ? null : t.key; render(); document.getElementById('g-mmol').value = ''; } }, t.label))) : null,
      h('div', { class: 'custom' },
        h('label', { class: 'small-label', for: 'g-mmol' }, 'Reading (mmol/L)'),
        h('input', { id: 'g-mmol', type: 'text', inputmode: 'decimal', class: 'text', placeholder: 'e.g. 6.8', onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); saveGlucose(); } } }),
        h('button', { class: 'btn primary', id: 'g-save', onclick: saveGlucose }, 'Save reading')),
      list.length ? h('ol', { class: 'act-list', id: 'g-list' }, ...list.map((e) => {
        const s = target ? glucoseStatus(e.mmol, target) : null;
        const tag = GLUCOSE_TAGS.find((t) => t.key === e.tag)?.label;
        return h('li', {},
          h('span', { class: 'act-time num' }, time(e.ms)),
          h('span', { class: 'act-what' }, h('strong', { class: 'num' }, `${fmt(e.mmol)} mmol/L`), tag ? ` · ${tag}` : '',
            s && s.status !== 'none' ? h('span', { class: `badge st-${s.status}` }, h('span', { 'aria-hidden': 'true' }, s.mark + ' '), s.word) : null),
          h('button', { class: 'btn quiet small', 'aria-label': `Remove reading ${fmt(e.mmol)}`, onclick: () => removeGlucose(e) }, 'Remove'));
      })) : h('p', { class: 'hint' }, 'No readings yet today.'));
  }

  /* ---------- Admin: show weight back to her? ---------- */
  function adminSwitch() {
    const on = weightShown(state.events);
    const flip = async (shown) => { await log.add({ type: 'config', ...weightShownEvent(shown) }); await reload(); render(); };
    return h('div', { class: 'setting', id: 'weight-switch' }, h('h3', {}, 'Weight on screen'),
      h('p', { class: 'hint' }, 'Weight is asked once a day and doctors always see every number. This only decides whether today\'s number is shown back after it is confirmed.'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'weight-shown', checked: on, 'aria-label': 'Show today\'s weight', onchange: (ev) => flip(ev.target.checked) }), 'Show today\'s weight'));
  }

  return { weightCard, glucoseCard, adminSwitch };
}
