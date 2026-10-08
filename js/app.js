import { dayKey, msUntilNextMidnight, formatLongDate, formatTime } from './time.js';
import { parseVolume, recentSizes, addSizeToRecent } from './hydration.js';
import { createEventLog } from './events.js';
import { createIdbStore } from './store-idb.js';

const app = document.getElementById('app');
const state = { events: [], key: dayKey(Date.now()), recent: [], selected: 600, unit: 'ml', toast: '' };
let log;

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

/* ---------- settings ---------- */
const getSetting = (k, d) => localStorage.getItem('hd.' + k) ?? d;
const setSetting = (k, v) => localStorage.setItem('hd.' + k, v);
const applyTextSize = (v) => { document.documentElement.dataset.text = v; };

/* ---------- actions ---------- */
async function reload() { state.events = await log.all(); }

async function refill() {
  await log.add({ type: 'water', ml: state.selected });
  if (!state.recent.includes(state.selected)) state.recent = addSizeToRecent(state.recent, state.selected);
  await reload();
  render();
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
  toast('Entry removed.');
}

let toastTimer;
function toast(msg) {
  state.toast = msg;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = ''; render(); }, 3500);
}

/* ---------- view ---------- */
function render() {
  const entries = todaysWater();
  const total = entries.reduce((s, e) => s + e.ml, 0);
  const text = getSetting('text', 'normal');
  const keepFocus = document.activeElement?.id;
  const keepValue = document.getElementById('custom-ml')?.value;

  const sizeLabel = (ml) => (ml >= 1000 && ml % 100 === 0 ? `${ml / 1000} L` : `${ml} ml`);

  const view = h('div', {},
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' },
        h('img', { src: 'icons/icon.svg', alt: '' }),
        h('div', {}, h('h1', {}, 'Headache Diary'), h('p', { class: 'date' }, formatLongDate(Date.now())))),
      h('div', { class: 'textsize', role: 'group', 'aria-label': 'Text size' },
        ...[['normal', 'a1'], ['large', 'a2'], ['largest', 'a3']].map(([v, c]) =>
          h('button', {
            class: c, 'aria-pressed': String(text === v), 'aria-label': `Text size ${v}`,
            onclick: () => { setSetting('text', v); applyTextSize(v); render(); },
          }, 'A')))),
    h('main', {},
      h('section', { class: 'panel', 'aria-labelledby': 'water-h' },
        h('h2', { id: 'water-h' }, 'Water today'),
        h('div', { class: 'total', 'aria-live': 'polite' },
          h('span', { class: 'big num' }, fmt(total)),
          h('span', { class: 'unit' }, 'ml'),
          h('span', { class: 'alt num' }, `${(total / 1000).toFixed(1)} L`)),
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
        h('button', { class: 'btn primary', id: 'refill', onclick: refill }, `+1 Refill · ${fmt(state.selected)} ml`)),
      h('section', { class: 'panel', 'aria-labelledby': 'log-h' },
        h('h2', { id: 'log-h' }, "Today's water"),
        entries.length === 0
          ? h('p', { class: 'empty' }, 'Nothing logged yet today.')
          : h('ul', { class: 'log' }, ...entries.map((e) =>
              h('li', {},
                h('span', { class: 't num' }, formatTime(e.ms)),
                h('span', { class: 'v num' }, `${fmt(e.ml)} ml`),
                h('button', {
                  class: 'btn quiet small',
                  'aria-label': `Remove ${fmt(e.ml)} ml entry at ${formatTime(e.ms)}`,
                  onclick: () => removeEntry(e),
                }, 'Remove')))))),
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
  applyTextSize(getSetting('text', 'normal'));
  try {
    log = createEventLog(await createIdbStore());
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
  scheduleMidnight();
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
