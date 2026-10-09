import { dayKey, msUntilNextMidnight, formatLongDate, formatTime } from './time.js';
import { parseVolume, recentSizes, addSizeToRecent } from './hydration.js';
import { createEventLog } from './events.js';
import { createIdbStore } from './store-idb.js';
import { THEMES, TEXT_SIZES, normalise, activeTheme, toggleDark } from './settings.js';
import { createHeadacheUI } from './headache-ui.js';
import { createDayUI } from './day-ui.js';
import { createIntakeUI } from './intake-ui.js';
import { createAdminUI } from './admin-ui.js';
import { createPatchUI } from './patchnotes-ui.js';
import { createTrackingUI } from './tracking-ui.js';
import { createLayoutUI } from './layout-ui.js';
import { checkNow, outcomeText, versionFrom, registerAuto, autoText, lastCheckedText } from './updatecheck.js';
import { trackedMap } from './tracking.js';
import { createTesterUI } from './tester-ui.js';
import { createDoctorUI } from './doctor-ui.js';
import { createMeasuresUI } from './measures-ui.js';
import { createTour } from './tour-ui.js';
import { rxMainCard } from './rx-ui.js';
import { createReminderUI } from './reminder-ui.js';
import { clockPicker } from './clock-ui.js';
import { SIT_CHOICES, validTimes } from './nudges.js';
import { dayStatuses } from './doctors.js';
import { STYLES, artElement, ART_KEYS } from './type-art.js';

const app = document.getElementById('app');
const TABS = [['prefs', 'My preferences'], ['track', 'Tracking'], ['doctors', 'Doctors'], ['admin', 'Admin'], ['tester', 'Tester notes']];
const state = { events: [], key: dayKey(Date.now()), recent: [], selected: 600, unit: 'ml', toast: '', view: 'main', draft: null, optTab: 'prefs', side: {}, settings: null };
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
let log;
let hui;
let dui;
let iui;
let aui;
let pn;
let trk;
let lay;
let tui;
let dcui;
let mui;
let rxCard;
let rem;
const tour = createTour({ h });
const helpButton = (key) => h('button', { class: 'help-btn', id: 'help', onclick: (ev) => tour.open(ev.currentTarget, key) }, icon('help'), h('span', {}, 'Help'));

/* ---------- small helpers ---------- */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const fmt = (n) => n.toLocaleString('en-AU');
const todaysWater = () =>
  state.events
    .filter((e) => e.type === 'water' && !e.deleted && dayKey(e.ms) === state.key)
    .sort((a, b) => b.ms - a.ms);

/* ---------- settings (personal preferences only) ---------- */
const getSetting = (k, d) => localStorage.getItem('hd.' + k) ?? d;
const setSetting = (k, v) => localStorage.setItem('hd.' + k, v);
function loadSettings() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem('hd.settings')); } catch { /* ignore */ }
  if (!raw) { const old = localStorage.getItem('hd.text'); if (old) raw = { text: old }; }
  state.settings = normalise(raw);
}
function saveSettings(patch) {
  state.settings = normalise({ ...state.settings, ...patch });
  localStorage.setItem('hd.settings', JSON.stringify(state.settings));
  applyLook();
  render();
}
function applyLook() {
  const theme = activeTheme(state.settings, darkQuery.matches);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.text = state.settings.text;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#17232b' : theme === 'bright' ? '#0b5cad' : '#2d5a4c');
}
darkQuery.addEventListener?.('change', () => { if (state.settings?.followSystem) { applyLook(); render(); } });
const time = (ms) => formatTime(ms, state.settings.clock);

/* ---------- actions ---------- */
async function reload() { state.events = await log.all(); }

async function refill() {
  await log.add({ type: 'water', ml: state.selected });
  if (!state.recent.includes(state.selected)) state.recent = addSizeToRecent(state.recent, state.selected);
  await reload();
  render();
  if (state.settings.savedCue) toast(`Saved · ${fmt(state.selected)} ml added`);
}

function useCustom() {
  const input = document.getElementById('custom-ml');
  const ml = parseVolume(input.value, state.unit);
  if (ml == null) { toast('Please type a size between 1 ml and 10 L.'); return; }
  state.selected = ml;
  setSetting('selected', ml);
  state.recent = addSizeToRecent(state.recent, ml);
  render();
}

function ask(titleText) {
  const dlg = document.getElementById('reason');
  const form = document.getElementById('reason-form');
  const text = document.getElementById('reason-text');
  const err = document.getElementById('reason-error');
  document.getElementById('reason-title').textContent = titleText;
  text.value = '';
  err.hidden = true;
  return new Promise((resolve) => {
    const done = (val) => {
      form.onsubmit = null;
      document.getElementById('reason-cancel').onclick = null;
      dlg.close();
      resolve(val);
    };
    form.onsubmit = (ev) => {
      ev.preventDefault();
      if (!text.value.trim()) { err.hidden = false; text.focus(); return; }
      done(text.value.trim());
    };
    document.getElementById('reason-cancel').onclick = () => done(null);
    dlg.addEventListener('cancel', () => done(null), { once: true });
    dlg.showModal();
    text.focus();
  });
}

async function removeEntry(e) {
  const reason = await ask('Remove this entry?');
  if (!reason) return;
  await log.remove(e.id, reason);
  await reload();
  render();
  if (state.settings.savedCue) toast('Saved · entry removed');
}

let toastTimer;
function toast(msg) {
  state.toast = msg;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = ''; render(); }, 3500);
}

/* ---------- icons ---------- */
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 17.8h.01"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name]; // fixed strings above, never user input
  return svg;
}

/* ---------- headache screens ---------- */
function renderHeadache() {
  const keep = document.activeElement?.id;
  app.replaceChildren(hui.renderForm());
  if (keep && document.getElementById(keep)) document.getElementById(keep).focus({ preventScroll: true });
}

function renderActivity() {
  const keep = document.activeElement?.id;
  app.replaceChildren(dui.renderForm());
  if (keep && document.getElementById(keep)) document.getElementById(keep).focus({ preventScroll: true });
}

function renderIntake() {
  const keep = document.activeElement?.id;
  app.replaceChildren(iui.renderForm());
  if (keep && document.getElementById(keep)) { const el = document.getElementById(keep); el.focus({ preventScroll: true }); if (el.setSelectionRange && el.type === 'text') { try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* ignore */ } } }
}

/* ---------- options screen ---------- */
function renderOptions() {
  const st = state.settings;
  const seg = (label, key, opts) =>
    h('div', { class: 'seg', role: 'group', 'aria-label': label },
      ...opts.map(([v, t]) => h('button', { 'aria-pressed': String(st[key] === v), onclick: () => saveSettings({ [key]: v }) }, t)));
  const view = h('div', {},
    h('header', { class: 'topbar' },
      h('div', { class: 'page-head' },
        h('button', { class: 'icon-btn', id: 'back', 'aria-label': 'Back to diary', onclick: () => { aui.leave(); dcui.leave(); state.view = 'main'; render(); } }, icon('back')),
        h('h2', {}, 'Options'),
        helpButton('options-' + state.optTab))),
    h('main', {},
      h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Options sections' },
        ...TABS.map(([k, t]) =>
          h('button', { class: 'tab', role: 'tab', id: 'tab-' + k, 'aria-selected': String(state.optTab === k), 'aria-controls': 'tabpanel',
            onclick: () => { if (k !== 'admin') aui.leave(); if (k !== 'doctors') dcui.leave(); state.optTab = k; render(); document.getElementById('tab-' + k)?.focus(); },
            onkeydown: (ev) => { if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { const i = TABS.findIndex(([x]) => x === k); state.optTab = TABS[(i + (ev.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0]; render(); document.getElementById('tab-' + state.optTab)?.focus(); } } }, t))),
      state.optTab === 'track' ? trackPanel() : state.optTab === 'doctors' ? dcui.panel() : state.optTab === 'admin' ? adminPanel() : state.optTab === 'tester' ? tui.panel() : h('section', { class: 'panel', id: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-prefs' },
        h('div', { class: 'setting' }, h('h3', {}, 'Colour theme'),
          h('div', { class: 'swatches' }, ...Object.entries(THEMES).map(([k, name]) =>
            h('button', { class: 'swatch', 'data-t': k, 'aria-pressed': String(st.theme === k), onclick: () => saveSettings({ theme: k, ...(k !== 'dark' ? { lightTheme: k } : {}) }) },
              h('i', {}), name)))),
        h('div', { class: 'setting' }, h('h3', {}, 'Head pictures'),
          h('div', { class: 'art-picks' }, ...Object.entries(STYLES).map(([k, name]) =>
            h('button', { class: 'art-pick', 'aria-pressed': String(st.artStyle === k), onclick: () => saveSettings({ artStyle: k }) },
              h('span', { class: 'art-mini' }, ...['cluster', 'sinus', 'oneSided', 'tmj'].map((t) => artElement(t, k))), h('span', { class: 'art-name' }, name)))),
          h('p', { class: 'hint' }, 'Only the look changes. The same six types are always there.')),
        h('div', { class: 'setting' }, h('h3', {}, 'Text size'), seg('Text size', 'text', [...TEXT_SIZES].reverse().map((t) => [t.key, t.label]))),
        h('div', { class: 'setting' }, h('h3', {}, 'Clock'), seg('Clock', 'clock', [['12', '12 hour'], ['24', '24 hour']])),
        lay.optionsSection(),
        updateSection(),
        h('div', { class: 'setting' },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.followSystem, onchange: (ev) => saveSettings({ followSystem: ev.target.checked }) }), 'Switch to dark when the tablet does'),
          h('p', { class: 'hint' }, 'Off by default. The moon button on the main page always works.')),
        h('div', { class: 'setting', id: 'reminder-prefs' }, h('h3', {}, 'Reminder level and sound'),
          seg('Reminder level', 'nag', [['gentle', 'Gentle'], ['normal', 'Normal'], ['persistent', 'Persistent']]),
          h('p', { class: 'hint' }, 'Gentle reminds once. Normal reminds 4 times, 10 minutes apart. Persistent reminds every 5 minutes until answered. A doctor can fix the level for a particular medicine.'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.chime, onchange: (ev) => saveSettings({ chime: ev.target.checked }) }), 'Play a chime with reminders'),
          h('p', { class: 'hint' }, 'Reminders only appear while the diary is open, so keep the tablet on its charger with the diary open.')),
        h('div', { class: 'setting', id: 'own-reminders' }, h('h3', {}, 'Other reminders'),
          h('p', { class: 'hint' }, 'All off until switched on. They use the reminder level above and give up after a while.'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'own-wake', checked: st.wakeOn, onchange: (ev) => saveSettings({ wakeOn: ev.target.checked }) }), 'Remind to tap WOKE UP'),
          st.wakeOn ? h('div', { class: 'num-field' }, h('span', { class: 'small-label' }, 'At'), clockPicker(h, { id: 'own-wake-at', value: st.wakeAt, clock: st.clock, onChange: (v) => saveSettings({ wakeAt: v }) })) : null,
          h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'own-glucose', checked: st.glucoseOn, onchange: (ev) => saveSettings({ glucoseOn: ev.target.checked }) }), 'Remind to check blood glucose'),
          st.glucoseOn ? h('div', { class: 'num-field' }, h('span', { class: 'small-label' }, 'At these times (up to 3)'),
            ...st.glucoseTimes.map((t, i) => h('div', { class: 'own-time', 'data-gt': String(i) },
              clockPicker(h, { id: `own-glucose-${i}`, value: t, clock: st.clock, onChange: (v) => saveSettings({ glucoseTimes: validTimes(st.glucoseTimes.map((x, j) => (j === i ? v : x))) }) }),
              st.glucoseTimes.length > 1 ? h('button', { class: 'btn quiet small', 'aria-label': `Remove time ${i + 1}`, onclick: () => saveSettings({ glucoseTimes: st.glucoseTimes.filter((_, j) => j !== i) }) }, 'Remove') : null)),
            st.glucoseTimes.length < 3 ? h('button', { class: 'btn quiet', id: 'own-glucose-add', onclick: () => { const used = new Set(st.glucoseTimes); const pick = ['12:00', '17:00', '20:00', '10:00', '15:00'].find((x) => !used.has(x)); saveSettings({ glucoseTimes: validTimes([...st.glucoseTimes, pick]) }); } }, 'Add a time') : null) : null,
          h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'own-sit', checked: st.sitOn, onchange: (ev) => saveSettings({ sitOn: ev.target.checked }) }), 'Remind after sitting for a while'),
          st.sitOn ? h('div', { class: 'num-field' }, h('label', { for: 'own-sit-mins' }, 'Sitting for'),
            h('select', { id: 'own-sit-mins', class: 'text', onchange: (ev) => saveSettings({ sitMins: Number(ev.target.value) }) },
              ...SIT_CHOICES.map((m) => h('option', { value: String(m), selected: m === st.sitMins }, m >= 60 && m % 60 === 0 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`))),
            h('p', { class: 'hint' }, 'A plain note after this long in the position "Sitting". It gives no advice.')) : null),
        h('div', { class: 'setting' },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.savedCue, onchange: (ev) => saveSettings({ savedCue: ev.target.checked }) }), 'Show "Saved" message'))),
      state.optTab === 'prefs' ? h('p', { class: 'meta' }, 'These are only display preferences. Health settings are kept separate.') : null));
  app.replaceChildren(view);
  if (!document.activeElement || document.activeElement === document.body) document.getElementById('back')?.focus();
}

/* Admin: locked behind a PIN once the family has set one up inside Admin itself. */
function trackPanel() {
  return h('section', { class: 'panel', id: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-track' }, h('h2', {}, 'Tracking'), trk.section('user'));
}
const tracked = () => trackedMap(state.events ?? [], state.settings?.track ?? {});

function adminPanel() { return aui.panel(state.adminUntil || !aui.hasPin() ? { screens: h('div', {}, iui.adminSwitches()), accounts: dcui.adminAccounts(), tracking: trk.section('admin') } : null); }

/* Fluid against the doctor's range: water refills plus every drink from the meal log. */
function waterStatus(total) {
  const st = dayStatuses(state.events, state.key, { running: true }).fluid;
  if (!st) return null;
  return h('p', { class: 'fluid-line' }, `All fluids today: ${fmt(st.value)} ml `, iui.statusBadge(st),
    st.value !== total ? h('span', { class: 'hint' }, ` (water ${fmt(total)} ml + other drinks)`) : null);
}

/* ---------- view ---------- */
function render() {
  queueMicrotask(() => { rem?.tick(); pn?.place(); lay?.sync(); });
  if (state.view === 'options') { renderOptions(); return; }
  if (state.view === 'headache') { renderHeadache(); return; }
  if (state.view === 'activity') { renderActivity(); return; }
  if (state.view === 'intake') { renderIntake(); return; }
  const tm = tracked();
  const entries = todaysWater();
  const total = entries.reduce((s, e) => s + e.ml, 0);
  const shown = activeTheme(state.settings, darkQuery.matches);
  const keepFocus = document.activeElement?.id;
  const keepValue = document.getElementById('custom-ml')?.value;

  const sizeLabel = (ml) => (ml >= 1000 && ml % 100 === 0 ? `${ml / 1000} L` : `${ml} ml`);

  const waterPanel =
    h('section', { class: 'panel', 'aria-labelledby': 'water-h' },
        h('h2', { id: 'water-h' }, 'Water today'),
        h('div', { class: 'total', 'aria-live': 'polite' },
          h('span', { class: 'big num' }, fmt(total)),
          h('span', { class: 'unit' }, 'ml'),
          h('span', { class: 'alt num' }, `${(total / 1000).toFixed(1)} L`)),
        waterStatus(total),
        h('p', { class: 'meta' }, entries.length === 1 ? '1 refill so far' : `${entries.length} refills so far`),
        h('div', { class: 'sizes', role: 'radiogroup', 'aria-label': 'Bottle size' },
          ...state.recent.map((ml) =>
            h('button', {
              class: 'size num', role: 'radio', 'aria-checked': String(ml === state.selected),
              onclick: () => { state.selected = ml; setSetting('selected', ml); render(); },
            }, sizeLabel(ml)))),
        h('div', { class: 'custom' },
          h('label', { for: 'custom-ml' }, 'Different size?'),
          h('input', { id: 'custom-ml', type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: 'e.g. 650' }),
          h('select', { 'aria-label': 'Unit', onchange: (ev) => { state.unit = ev.target.value; } },
            h('option', { value: 'ml', selected: state.unit === 'ml' }, 'ml'),
            h('option', { value: 'L', selected: state.unit === 'L' }, 'L')),
          h('button', { class: 'btn quiet', onclick: useCustom }, 'Use this size')),
        h('button', { class: 'btn primary', id: 'refill', onclick: refill }, `+1 Refill · ${fmt(state.selected)} ml`),
        entries.length
          ? h('button', { class: 'btn quiet small undo', id: 'undo', onclick: () => removeEntry(entries[0]) },
              `Undo last refill (${fmt(entries[0].ml)} ml at ${time(entries[0].ms)})`)
          : null);

  const view = h('div', {},
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' },
        h('img', { src: 'icons/icon.svg', alt: '' }),
        h('div', {}, h('h1', {}, 'Headache Diary'), h('p', { class: 'date' }, formatLongDate(Date.now())))),
      h('div', { class: 'tools' },
        h('button', {
          class: 'icon-btn toggle', id: 'dark-toggle', 'aria-pressed': String(shown === 'dark'),
          'aria-label': shown === 'dark' ? 'Dark mode is on. Tap to turn off' : 'Dark mode is off. Tap to turn on',
          onclick: () => saveSettings(toggleDark(state.settings, darkQuery.matches)),
        }, icon(shown === 'dark' ? 'moon' : 'sun')),
        lay.lockButton(),
        helpButton('main'),
        h('button', { class: 'icon-btn', id: 'cog', 'aria-label': 'Options', onclick: () => { state.view = 'options'; render(); window.scrollTo(0, 0); } }, icon('cog')))),
    lay.topBar(),
    h('main', { class: 'home' },
      lay.grid({
        water: tm.water ? waterPanel : null,
        headache: tm.headache ? hui.mainCard() : null,
        day: tm.day ? dui.mainCard() : null,
        glucose: tm.glucose ? mui.glucoseCard() : null,
        weight: tm.weight ? mui.weightCard() : null,
        meds: tm.meds ? rxCard() : null,
        today: tm.day ? dui.todayList() : null,
        intake: tm.intake ? iui.mainCard() : null,
        eaten: tm.intake ? iui.todayList() : null,
      }),
      Object.values(tm).some(Boolean) ? null : h('section', { class: 'panel', id: 'all-off' }, h('h2', {}, 'Nothing is being tracked'), h('p', {}, 'Every log is switched off. Logs can be turned back on in Options, under Tracking.'))),
    state.toast ? h('div', { class: 'toast', role: 'status' }, state.toast) : null);

  app.replaceChildren(view);
  const input = document.getElementById('custom-ml');
  if (input && keepValue) input.value = keepValue;
  if (keepFocus) document.getElementById(keepFocus)?.focus();
}

/* ---------- midnight rollover ---------- */
function scheduleMidnight() {
  setTimeout(() => { checkDay(); scheduleMidnight(); }, msUntilNextMidnight(Date.now()) + 500);
}
function checkDay() {
  const k = dayKey(Date.now());
  if (k !== state.key) { state.key = k; render(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });

/* ---------- start ---------- */
async function start() {
  loadSettings();
  applyLook();
  try {
    log = createEventLog(await createIdbStore());
    hui = createHeadacheUI({ h, state, log, reload, render, toast, time, icon, fmt, helpButton });
    dui = createDayUI({ h, state, log, reload, render, toast, time, icon, fmt, helpButton });
    tui = createTesterUI({ h, render, toast, time, pastUpdates: () => pn.pastList() });
    pn = createPatchUI({ h, state, render });
    lay = createLayoutUI({ h, state, render, icon });
    trk = createTrackingUI({ h, state, log, reload, render, saveSettings, actor: () => dcui.actorId() });
    aui = createAdminUI({ h, state, log, reload, render, toast, time, icon, doctorInfo: () => dcui.resetInfo() });
    dcui = createDoctorUI({ h, state, log, reload, render, toast, time, icon, ask, trackingSection: () => trk.section('doctor') });
    rem = createReminderUI({ h, state, log, reload, render, time, tracked });
    rxCard = rxMainCard({ h, state, log, reload, render, toast, time, icon, fmt, ask });
    mui = createMeasuresUI({ h, state, log, reload, render, toast, time, icon, fmt, ask });
    iui = createIntakeUI({ h, state, log, reload, render, toast, time, icon, fmt, ask, helpButton });
    await reload();
  } catch (err) {
    app.replaceChildren(h('p', { class: 'boot' }, 'Sorry, the diary could not open its storage on this device. ' + err.message));
    return;
  }
  state.recent = recentSizes(state.events);
  const saved = Number(getSetting('selected', state.recent[0]));
  state.selected = Number.isFinite(saved) && saved > 0 ? saved : state.recent[0];
  if (!state.recent.includes(state.selected)) state.recent = addSizeToRecent(state.recent, state.selected);
  render();
  rem.start();
  scheduleMidnight();
  navigator.storage?.persist?.();
  watchForUpdates();
}
start();

/* ---------- app updates ---------- */
let swReg = null;
let autoStatus = 'unknown';
const LAST_KEY = 'hd.lastUpdateCheck';
const lastCheck = () => { const v = Number(localStorage.getItem(LAST_KEY)); return Number.isFinite(v) && v > 0 ? v : null; };
const stampCheck = () => { localStorage.setItem(LAST_KEY, String(Date.now())); const n = document.getElementById('update-last'); if (n) n.textContent = lastCheckedText(lastCheck(), Date.now(), state.settings.clock); };
/** Options > My preferences: check for a new version now. The answer shows in place, so the screen is not redrawn. */
function updateSection() {
  const note = h('p', { class: 'hint', id: 'update-note', role: 'status', 'aria-live': 'polite' }, autoText(autoStatus));
  const last = h('p', { class: 'hint', id: 'update-last' }, lastCheckedText(lastCheck(), Date.now(), state.settings.clock));
  const btn = h('button', { class: 'btn', id: 'update-check', type: 'button' }, 'Check for update');
  btn.addEventListener('click', async () => {
    btn.setAttribute('aria-disabled', 'true'); note.textContent = outcomeText('checking');
    const outcome = await checkNow(swReg, { online: navigator.onLine });
    const version = versionFrom(await caches.keys().catch(() => []));
    note.textContent = outcomeText(outcome, version); if (outcome !== 'offline') stampCheck();
    btn.removeAttribute('aria-disabled');
    if (outcome === 'found') btn.after(h('button', { class: 'btn primary', id: 'update-now', type: 'button', onclick: () => location.reload() }, 'Refresh now'));
  });
  return h('div', { class: 'setting', id: 'update-setting' }, h('h3', {}, 'App updates'), btn, note, last);
}
function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateBanner(); });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    swReg = reg;
    registerAuto(reg).then((st) => { autoStatus = st; const n = document.getElementById('update-note'); if (n && n.textContent === autoText('unknown')) n.textContent = autoText(st); });
    const check = () => reg.update().then(stampCheck).catch(() => {});
    check();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 60 * 60 * 1000);
  }).catch(() => {});
}
function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const b = h('div', { id: 'update-banner', class: 'update', role: 'status' },
    h('span', {}, 'A new version is ready.'),
    h('button', { class: 'btn small', onclick: () => location.reload() }, 'Tap to refresh'));
  document.body.prepend(b);
}
