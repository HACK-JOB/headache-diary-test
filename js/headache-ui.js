// Headache screens: start form, status-change form, and the "headache active" card.
// Receives the shared helpers from app.js so there is one place that owns state and rendering.
import { TYPES, SEVERITY, WEATHER, SYMPTOMS, validateStart, validateUpdate, describeChanges, activeEpisode } from './episodes.js';
import { recentItems, suggest, canonical } from './memory.js';
import { artElement } from './type-art.js';
import { msFromClock, clockValue, dayKey } from './time.js';

const newEpisodeId = () => globalThis.crypto?.randomUUID?.() ?? `ep-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function createHeadacheUI(ctx) {
  const { h, state, log, reload, render, toast, time, icon, fmt } = ctx;

  const FIELD_LABEL = { severity: 'How bad is it? (1 to 5)', weather: 'Weather', headacheType: 'What does it feel like?', notes: 'Please describe it' };

  /* ---------- opening the forms ---------- */
  function openStart() {
    state.draft = { mode: 'start', severity: null, weather: '', headacheType: '', symptoms: [], notes: '', meds: [], relief: [], clock: clockValue(Date.now()), errors: [] };
    state.view = 'headache';
    render();
    window.scrollTo(0, 0);
  }

  function openUpdate() {
    const ep = activeEpisode(state.events);
    if (!ep) return;
    state.draft = {
      mode: 'update', episodeId: ep.id, prev: { ...ep.current },
      severity: ep.current.severity, weather: ep.current.weather, headacheType: ep.current.headacheType,
      symptoms: [...ep.symptoms], notes: '', meds: [], relief: [], clock: clockValue(Date.now()), errors: [],
    };
    state.view = 'headache';
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- saving ---------- */
  async function save() {
    const d = state.draft;
    const now = Date.now();
    // If the clock still shows the current minute, use the exact time so entries keep their true order.
    const at = d.clock === clockValue(now) ? now : (msFromClock(dayKey(now), d.clock, now) ?? now);
    const medObjs = d.meds.map((name) => ({ name, at }));
    const base = { type: 'headache', symptoms: d.symptoms, meds: medObjs, relief: d.relief };

    if (d.mode === 'start') {
      const bad = validateStart({ severity: d.severity, weather: d.weather, headacheType: d.headacheType, notes: d.notes });
      if (bad.length) { d.errors = bad; render(); focusFirstError(); return; }
      await log.add({ ...base, kind: 'start', episodeId: newEpisodeId(), severity: d.severity, weather: d.weather, headacheType: d.headacheType, notes: canonical(d.notes) || undefined }, at);
      await reload();
      state.view = 'main';
      render();
      if (state.settings.savedCue) toast('Saved · headache started');
      return;
    }

    const changes = {};
    for (const k of ['severity', 'weather', 'headacheType']) if (d[k] !== d.prev[k]) changes[k] = d[k];
    if (canonical(d.notes)) changes.notes = canonical(d.notes);
    const bad = validateUpdate(changes, d.prev);
    if (bad.length) { d.errors = bad; render(); focusFirstError(); return; }
    const anything = Object.keys(changes).length || d.meds.length || d.relief.length || d.symptoms.length !== (activeEpisode(state.events)?.symptoms.length ?? 0);
    if (!anything) { state.view = 'main'; render(); return; }
    await log.add({ ...base, kind: 'update', episodeId: d.episodeId, ...changes }, at);
    await reload();
    state.view = 'main';
    render();
    if (state.settings.savedCue) toast('Saved · headache updated');
  }

  async function resolve() {
    const ep = activeEpisode(state.events);
    if (!ep) return;
    await log.add({ type: 'headache', kind: 'resolve', episodeId: ep.id }, Date.now());
    await reload();
    render();
    if (state.settings.savedCue) toast('Saved · headache ended');
  }

  function focusFirstError() {
    const first = state.draft.errors[0];
    const el = document.getElementById('f-' + first);
    el?.scrollIntoView({ block: 'center' });
    el?.querySelector?.('button, textarea, input')?.focus();
  }

  /* ---------- pieces ---------- */
  const err = (key) => state.draft.errors.includes(key)
    ? h('p', { class: 'error', role: 'alert' }, key === 'notes' ? 'Please tell us a little about it.' : 'Please choose one.') : null;

  function field(key, children, optionalNote) {
    const d = state.draft;
    const label = d.mode === 'update' && key !== 'notes' ? FIELD_LABEL[key] : FIELD_LABEL[key];
    return h('section', { class: 'panel field' + (d.errors.includes(key) ? ' has-error' : ''), id: 'f-' + key, 'aria-labelledby': 'l-' + key },
      h('h2', { id: 'l-' + key }, label, optionalNote ? h('span', { class: 'opt' }, ' ' + optionalNote) : null),
      err(key), children);
  }

  const wasTag = (key, shown) => {
    const d = state.draft;
    if (d.mode !== 'update' || d.prev[key] == null) return null;
    return d[key] !== d.prev[key]
      ? h('p', { class: 'was changed' }, `Changed. Was: ${shown(d.prev[key])}`)
      : h('p', { class: 'was' }, `Now: ${shown(d.prev[key])}`);
  };

  function choose(key, value) { state.draft[key] = value; state.draft.errors = state.draft.errors.filter((e) => e !== key); render(); }

  function severityField() {
    const d = state.draft;
    const chosen = d.severity ? SEVERITY[d.severity - 1] : null;
    return field('severity', h('div', {},
      wasTag('severity', (n) => `${n} · ${SEVERITY[n - 1].name}`),
      h('div', { class: 'sev', role: 'radiogroup', 'aria-labelledby': 'l-severity' },
        ...SEVERITY.map((s) => h('button', { class: 'sev-btn', role: 'radio', 'aria-checked': String(d.severity === s.n), onclick: () => choose('severity', s.n) },
          h('span', { class: 'sev-n num' }, s.n), h('span', { class: 'sev-name' }, s.name)))),
      h('p', { class: 'sev-desc', 'aria-live': 'polite' }, chosen ? chosen.hint : 'Tap a number. 1 is mild, 5 is the worst.')));
  }

  function weatherField() {
    const d = state.draft;
    const custom = d.weather && !WEATHER.includes(d.weather) ? d.weather : '';
    return field('weather', h('div', {},
      wasTag('weather', (w) => w),
      h('div', { class: 'seg wrap', role: 'radiogroup', 'aria-labelledby': 'l-weather' },
        ...WEATHER.map((w) => h('button', { role: 'radio', 'aria-checked': String(d.weather === w), onclick: () => choose('weather', w) }, w))),
      h('label', { class: 'small-label', for: 'weather-other' }, 'Something else?'),
      h('input', { id: 'weather-other', type: 'text', class: 'text', placeholder: 'e.g. humid and still', value: custom,
        oninput: (ev) => { d.weather = ev.target.value; d.errors = d.errors.filter((e) => e !== 'weather'); } }),
      h('p', { class: 'hint' }, 'Later this will fill in by itself. You can always change it.')));
  }

  function typeField() {
    const d = state.draft;
    const tile = (k, t) => h('button', { class: 'type', id: 'type-' + k, role: 'radio', 'aria-checked': String(d.headacheType === k), onclick: () => choose('headacheType', k) },
      artElement(k, state.settings.artStyle) ?? h('span', { class: 'type-other', 'aria-hidden': 'true' }, '?'),
      h('span', { class: 'type-name' }, t.name), h('span', { class: 'type-hint' }, t.hint));
    const preset = Object.entries(TYPES).filter(([k]) => k !== 'other');
    const needed = d.headacheType === 'other';
    const notesBad = d.errors.includes('notes');
    return field('headacheType', h('div', {},
      wasTag('headacheType', (t) => TYPES[t]?.name ?? t),
      h('div', { class: 'types', role: 'radiogroup', 'aria-labelledby': 'l-headacheType', 'aria-owns': 'type-other' },
        ...preset.map(([k, t]) => tile(k, t))),
      h('div', { class: 'other-row' },
        tile('other', TYPES.other),
        h('div', { class: 'other-notes' + (notesBad ? ' has-error' : ''), id: 'f-notes' },
          h('label', { class: 'notes-label', for: 'notes' }, needed ? 'Please describe it' : 'Anything else to add?', h('span', { class: 'opt' }, needed ? ' Needed for "Other"' : ' Optional')),
          notesBad ? h('p', { class: 'error', role: 'alert' }, 'Please tell us a little about it.') : null,
          h('textarea', { id: 'notes', class: 'text area', rows: '3', placeholder: needed ? 'Tell us what it feels like' : 'Optional',
            oninput: (ev) => {
              d.notes = ev.target.value;
              if (d.errors.includes('notes') && d.notes.trim()) {
                d.errors = d.errors.filter((e) => e !== 'notes');
                document.getElementById('f-notes')?.classList.remove('has-error');
                document.querySelector('#f-notes .error')?.remove();
              }
            } }, d.notes)))));
  }

  function symptomField() {
    const d = state.draft;
    return h('section', { class: 'panel field', id: 'f-symptoms', 'aria-labelledby': 'l-symptoms' },
      h('h2', { id: 'l-symptoms' }, 'Anything else you notice?', h('span', { class: 'opt' }, ' Optional')),
      h('div', { class: 'seg wrap' },
        ...SYMPTOMS.map((s) => h('button', { 'aria-pressed': String(d.symptoms.includes(s)),
          onclick: () => { d.symptoms = d.symptoms.includes(s) ? d.symptoms.filter((x) => x !== s) : [...d.symptoms, s]; render(); } }, s))));
  }

  /* Remembering chips: last 5 + type-ahead. kind = 'meds' | 'relief' */
  function memoryField(kind, title, placeholder) {
    const d = state.draft;
    const picked = d[kind];
    const recent = recentItems(state.events, kind);
    const chips = [...new Set([...picked, ...recent])];
    const id = 'mem-' + kind;
    const list = h('div', { class: 'sugg', id: id + '-sugg', role: 'listbox', 'aria-label': 'Matches from before' });

    const add = (name) => {
      const n = canonical(name);
      if (!n) return;
      if (!picked.some((p) => p.toLowerCase() === n.toLowerCase())) picked.push(n);
      render();
      document.getElementById(id)?.focus();
    };
    const showSugg = (text) => {
      list.replaceChildren(...suggest(state.events, kind, text).filter((s) => !picked.some((p) => p.toLowerCase() === s.toLowerCase())).slice(0, 5)
        .map((s) => h('button', { class: 'chip', role: 'option', onclick: () => add(s) }, s)));
    };
    return h('section', { class: 'panel field', id: 'f-' + kind, 'aria-labelledby': 'l-' + kind },
      h('h2', { id: 'l-' + kind }, title, h('span', { class: 'opt' }, ' Optional')),
      chips.length ? h('div', { class: 'seg wrap' },
        ...chips.map((c) => h('button', { 'aria-pressed': String(picked.includes(c)),
          onclick: () => { if (picked.includes(c)) d[kind] = picked.filter((x) => x !== c); else picked.push(c); render(); } }, c))) : h('p', { class: 'hint' }, 'Nothing yet. Type one below and it will be remembered.'),
      h('div', { class: 'custom' },
        h('label', { class: 'small-label', for: id }, 'Something else?'),
        h('input', { id, type: 'text', class: 'text', placeholder, autocomplete: 'off', oninput: (ev) => showSugg(ev.target.value),
          onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(ev.target.value); } } }),
        h('button', { class: 'btn quiet', type: 'button', onclick: () => add(document.getElementById(id).value) }, 'Add')),
      list);
  }

  /* ---------- the form screen ---------- */
  function renderForm() {
    const d = state.draft;
    const isStart = d.mode === 'start';
    const view = h('div', {},
      h('header', { class: 'topbar' },
        h('div', { class: 'page-head' },
          h('button', { class: 'icon-btn', id: 'back', 'aria-label': 'Cancel and go back', onclick: () => { state.view = 'main'; render(); } }, icon('back')),
          h('h2', {}, isStart ? 'Headache started' : 'Change status of headache'))),
      h('main', { class: 'form' },
        isStart ? null : h('p', { class: 'meta' }, 'Only change what is different. Leave the rest.'),
        h('div', { class: 'top-row' },
          h('section', { class: 'panel field time-panel' },
            h('h2', {}, isStart ? 'When did it start?' : 'What time is it now?'),
            h('div', { class: 'custom' },
              h('input', { id: 'clock', type: 'time', class: 'text', value: d.clock, 'aria-label': 'Time', onchange: (ev) => { d.clock = ev.target.value; } }),
              h('button', { class: 'btn quiet', type: 'button', onclick: () => { d.clock = clockValue(Date.now()); render(); } }, 'Now')),
            h('p', { class: 'hint' }, 'Set to now. Change it only if it started earlier.')),
          severityField()),
        h('div', { class: 'form-grid' },
          h('div', { class: 'form-col' }, typeField(), memoryField('relief', 'Other things that helped', 'e.g. ice pack, rest, water')),
          h('div', { class: 'form-col' }, weatherField(), symptomField(),
            memoryField('meds', 'Medicine taken', 'Type a medicine name'))),
        d.errors.length ? h('p', { class: 'error big-error', role: 'alert' }, 'A few things still need an answer. They are marked above.') : null,
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn quiet', onclick: () => { state.view = 'main'; render(); } }, 'Cancel'),
          h('button', { class: 'btn alert-btn', id: 'save', onclick: save }, isStart ? 'Start headache and save' : 'Save status update'))));
    return view;
  }

  /* ---------- main-page cards ---------- */
  function mainCard() {
    const ep = activeEpisode(state.events);
    if (!ep) {
      return h('section', { class: 'panel', 'aria-labelledby': 'hd-h' },
        h('h2', { id: 'hd-h' }, 'Headache'),
        h('button', { class: 'btn headache', id: 'headache-start', onclick: openStart }, 'HEADACHE START'));
    }
    const sev = SEVERITY[(ep.current.severity ?? 1) - 1];
    const mins = Math.max(1, Math.round((Date.now() - ep.startMs) / 60000));
    const dur = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
    return h('section', { class: 'panel active-card', 'aria-labelledby': 'hd-h' },
      h('h2', { id: 'hd-h' }, 'Headache active'),
      h('p', { class: 'active-line' }, `Since ${time(ep.startMs)} · ${dur}`),
      h('p', { class: 'active-line strong' }, `${ep.current.severity} of 5 · ${sev.name} · ${TYPES[ep.current.headacheType]?.name ?? ''}`),
      h('p', { class: 'meta' }, ep.changeCount ? `${ep.changeCount} update${ep.changeCount === 1 ? '' : 's'} so far` : 'No updates yet'),
      h('div', { class: 'two' },
        h('button', { class: 'btn update', id: 'headache-update', onclick: openUpdate }, 'CHANGE STATUS'),
        h('button', { class: 'btn resolve', id: 'headache-resolve', onclick: resolve }, 'RESOLVE')));
  }

  return { renderForm, mainCard, openStart, openUpdate, resolve };
}
