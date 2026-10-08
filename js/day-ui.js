// Day-flow screens: the day card (WOKE UP / START ACTIVITY / CHANGE ACTIVITY + END THE DAY),
// the activity form, and today's list of activities. Shares helpers with the rest of the app via ctx.
import { dayPhase, openActivity, buildDay, validateActivity, pickList, pastValues } from './day.js';
import { canonical } from './memory.js';
import { clockPicker } from './clock-ui.js';
import { msFromClock, clockValue, dayKey } from './time.js';

const LABEL = { activity: 'What are you doing?', location: 'Where are you?', position: 'Are you laying, sitting or standing?' };

export function createDayUI(ctx) {
  const { h, state, log, reload, render, toast, time, icon } = ctx;

  const minsText = (mins) => (mins < 60 ? `${Math.max(1, mins)} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`);
  const lastMark = () => state.events.filter((e) => !e.deleted && (e.type === 'day' || e.type === 'activity')).slice(-1)[0];

  /* ---------- actions ---------- */
  async function wakeUp() {
    await log.add({ type: 'day', kind: 'wake' });
    await reload(); state.confirmEnd = false; render();
    if (state.settings.savedCue) toast('Saved · good morning');
  }
  async function endDay() {
    await log.add({ type: 'day', kind: 'end' });
    await reload(); state.confirmEnd = false; render();
    if (state.settings.savedCue) toast('Saved · day ended');
  }
  function openActivityForm() {
    state.draft = { mode: 'activity', activity: '', location: '', position: '', clock: clockValue(Date.now()), errors: [] };
    state.view = 'activity';
    render();
    window.scrollTo(0, 0);
  }

  async function save() {
    const d = state.draft;
    const bad = validateActivity(d);
    const now = Date.now();
    const at = d.clock === clockValue(now) ? now : (msFromClock(dayKey(now), d.clock, now) ?? now);
    const prev = lastMark();
    if (!bad.length && prev && at < prev.ms) bad.push('clock');
    if (bad.length) { d.errors = bad; render(); focusFirstError(); return; }
    await log.add({ type: 'activity', activity: canonical(d.activity), location: canonical(d.location), position: canonical(d.position) }, at);
    await reload();
    state.view = 'main';
    render();
    if (state.settings.savedCue) toast('Saved · activity logged');
  }

  function focusFirstError() {
    const el = document.getElementById('f-' + state.draft.errors[0]);
    el?.scrollIntoView({ block: 'center' });
    el?.querySelector?.('button, input')?.focus();
  }

  /* ---------- form pieces ---------- */
  function choice(kind, field) {
    const d = state.draft;
    const chips = pickList(state.events, kind);
    const typed = canonical(d[field]);
    const isListed = chips.some((c) => c.toLowerCase() === typed.toLowerCase());
    const shown = typed && !isListed ? [...chips, typed] : chips;
    const bad = d.errors.includes(field);
    const id = 'in-' + field;
    const sugg = h('div', { class: 'sugg', id: id + '-sugg', role: 'listbox', 'aria-label': 'Matches from before' });
    const pick = (value) => { d[field] = value; d.errors = d.errors.filter((e) => e !== field); render(); };
    const showSugg = (text) => {
      const q = canonical(text).toLowerCase();
      sugg.replaceChildren(...(q ? pastValues(state.events, kind).filter((v) => v.toLowerCase().includes(q) && v.toLowerCase() !== q).slice(0, 5) : [])
        .map((v) => h('button', { class: 'chip', role: 'option', onclick: () => pick(v) }, v)));
    };
    const useTyped = () => { const v = canonical(document.getElementById(id).value); if (v) pick(v); };
    return h('section', { class: 'panel field' + (bad ? ' has-error' : ''), id: 'f-' + field, 'aria-labelledby': 'l-' + field },
      h('h2', { id: 'l-' + field }, LABEL[field]),
      bad ? h('p', { class: 'error', role: 'alert' }, 'Please choose one.') : null,
      h('div', { class: 'seg wrap', role: 'radiogroup', 'aria-labelledby': 'l-' + field },
        ...shown.map((c) => h('button', { role: 'radio', 'aria-checked': String(c.toLowerCase() === typed.toLowerCase()), onclick: () => pick(c) }, c))),
      h('div', { class: 'custom' },
        h('label', { class: 'small-label', for: id }, 'Something else?'),
        h('input', { id, type: 'text', class: 'text', autocomplete: 'off', placeholder: 'Type it, it will be remembered',
          oninput: (ev) => showSugg(ev.target.value), onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); useTyped(); } } }),
        h('button', { class: 'btn quiet', type: 'button', onclick: useTyped }, 'Use this')),
      sugg);
  }

  function renderForm() {
    const d = state.draft;
    const clockBad = d.errors.includes('clock');
    const prev = lastMark();
    const open = openActivity(state.events);
    return h('div', {},
      h('header', { class: 'topbar' },
        h('div', { class: 'page-head' },
          h('button', { class: 'icon-btn', id: 'back', 'aria-label': 'Cancel and go back', onclick: () => { state.view = 'main'; render(); } }, icon('back')),
          h('h2', {}, open ? 'Change activity' : 'Start activity'))),
      h('main', { class: 'form' },
        open ? h('p', { class: 'meta' }, `Now: ${open.activity} · ${open.location} · ${open.position}. Saving this ends it.`) : null,
        h('div', { class: 'top-row' },
          h('section', { class: 'panel field time-panel' + (clockBad ? ' has-error' : ''), id: 'f-clock' },
            h('h2', {}, 'What time?'),
            clockBad ? h('p', { class: 'error', role: 'alert' }, `That is before your last entry (${time(prev.ms)}).`) : null,
            h('div', { class: 'custom' },
              clockPicker(h, { id: 'clock', value: d.clock, clock: state.settings.clock, onChange: (v) => { d.clock = v; d.errors = d.errors.filter((e) => e !== 'clock'); } }),
              h('button', { class: 'btn quiet', type: 'button', onclick: () => { d.clock = clockValue(Date.now()); d.errors = d.errors.filter((e) => e !== 'clock'); render(); } }, 'Now')),
            h('p', { class: 'hint' }, 'Set to now. Change it only if it started earlier.')),
          choice('positions', 'position')),
        h('div', { class: 'form-grid' },
          h('div', { class: 'form-col' }, choice('activities', 'activity')),
          h('div', { class: 'form-col' }, choice('locations', 'location'))),
        d.errors.length ? h('p', { class: 'error big-error', role: 'alert' }, 'A few things still need an answer. They are marked above.') : null,
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn quiet', onclick: () => { state.view = 'main'; render(); } }, 'Cancel'),
          h('button', { class: 'btn alert-btn save-act', id: 'save', onclick: save }, open ? 'Save and change activity' : 'Save and start activity'))));
  }

  /* ---------- main page ---------- */
  function mainCard() {
    const phase = dayPhase(state.events);
    const open = openActivity(state.events);
    if (phase === 'asleep') {
      return h('section', { class: 'panel', 'aria-labelledby': 'day-h' },
        h('h2', { id: 'day-h' }, 'Your day'),
        h('button', { class: 'btn primary', id: 'wake', onclick: wakeUp }, 'WOKE UP'));
    }
    if (phase === 'awake') {
      return h('section', { class: 'panel', 'aria-labelledby': 'day-h' },
        h('h2', { id: 'day-h' }, 'Your day'),
        h('button', { class: 'btn primary', id: 'activity-start', onclick: openActivityForm }, 'START ACTIVITY'));
    }
    const mins = Math.round((Date.now() - open.ms) / 60000);
    return h('section', { class: 'panel', 'aria-labelledby': 'day-h' },
      h('h2', { id: 'day-h' }, 'Your day'),
      h('p', { class: 'active-line strong' }, open.activity),
      h('p', { class: 'active-line' }, `${open.location} · ${open.position}`),
      h('p', { class: 'meta' }, `Since ${time(open.ms)} · ${minsText(mins)}`),
      state.confirmEnd
        ? h('div', { class: 'confirm', role: 'alert' },
            h('p', { class: 'active-line strong' }, 'End your day now?'),
            h('div', { class: 'two' },
              h('button', { class: 'btn quiet', id: 'end-no', onclick: () => { state.confirmEnd = false; render(); } }, 'Not yet'),
              h('button', { class: 'btn primary', id: 'end-yes', onclick: endDay }, 'Yes, end my day')))
        : h('div', { class: 'two' },
            h('button', { class: 'btn primary', id: 'activity-change', onclick: openActivityForm }, 'CHANGE ACTIVITY'),
            h('button', { class: 'btn quiet', id: 'end-day', onclick: () => { state.confirmEnd = true; render(); } }, 'END THE DAY')));
  }

  function todayList() {
    const day = buildDay(state.events, state.key, Date.now());
    const rows = day.segments;
    const phase = dayPhase(state.events);
    return h('section', { class: 'panel', 'aria-labelledby': 'acts-h' },
      h('h2', { id: 'acts-h' }, 'Today so far'),
      day.wake ? h('p', { class: 'meta' }, `Woke up at ${time(day.wake)}`) : null,
      rows.length
        ? h('ol', { class: 'act-list' }, ...rows.map((s) => h('li', {},
            h('span', { class: 'act-time num' }, `${time(s.start)}${s.carriedIn ? '*' : ''}`),
            h('span', { class: 'act-what' }, h('strong', {}, s.activity), ` · ${s.location} · ${s.position}`),
            h('span', { class: 'act-dur num' }, minsText(Math.round((s.end - s.start) / 60000))))))
        : h('p', { class: 'hint' }, phase === 'asleep' ? 'Nothing yet today.' : 'No activities yet today.'),
      rows.some((s) => s.carriedIn) ? h('p', { class: 'hint' }, '* carried over from before midnight') : null,
      day.end ? h('p', { class: 'meta' }, `Day ended at ${time(day.end)}`) : null);
  }

  return { renderForm, mainCard, todayList, openActivityForm };
}
