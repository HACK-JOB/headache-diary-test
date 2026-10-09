// The main page grid, the lock, and moving panels. Locked by default: nothing can be moved or resized by accident.
// Unlocked: every panel shows a bar to move it (Earlier / Later buttons, or drag the handle) and its contents are switched off,
// so nothing can be entered or tapped by mistake. Portrait and landscape keep separate layouts. Saved on this tablet only.
import { PANELS, normaliseLayout, defaultLayout, orientationOf, orderFor, spanFor, rowsFor, moveStep, moveTo } from './layout.js';

const KEY = 'hd.layout';

export function createLayoutUI({ h, state, render, icon }) {
  let layout = (() => { try { return normaliseLayout(JSON.parse(localStorage.getItem(KEY))); } catch { return defaultLayout(); } })();
  let drag = null;                       // { id, item, target, after }
  const orient = () => orientationOf(window.innerWidth, window.innerHeight);
  const save = (l) => { layout = l; localStorage.setItem(KEY, JSON.stringify(l)); render(); };
  const label = (id) => PANELS.find((p) => p.id === id)?.label ?? id;
  const unlocked = () => !!state.layoutOpen;
  const setUnlocked = (on) => { state.layoutOpen = !!on; drag = null; render(); };

  /* ---------- the grid ---------- */
  /** nodes: { panelId: element | null }. Panels that are switched off, or have nothing to show, are simply left out. */
  function grid(nodes) {
    const o = orient();
    const visible = PANELS.map((p) => p.id).filter((id) => nodes[id]);
    const order = orderFor(layout, o, visible);
    const editing = unlocked();
    const items = order.map((id, i) => {
      const item = h('div', { class: 'pg-item' + (editing ? ' is-edit' : ''), 'data-panel': id });
      item.style.gridColumn = `span ${spanFor(layout, o, id)}`;
      const rows = rowsFor(layout, o, id, visible);
      if (rows > 1) item.style.gridRow = `span ${rows}`;
      const body = h('div', { class: 'pg-body' }, nodes[id]);
      if (editing) body.setAttribute('inert', '');
      item.append(...(editing ? [bar(id, i, order.length, visible), body] : [body]));
      return item;
    });
    return h('div', { class: 'pgrid', id: 'pgrid', 'data-orient': o }, ...items);
  }

  /* ---------- the bar on each panel while unlocked ---------- */
  function bar(id, i, n, visible) {
    const go = (dir) => { const next = moveStep(layout, orient(), id, dir, visible); if (next !== layout) save(next); };
    return h('div', { class: 'pg-bar', role: 'group', 'aria-label': `${label(id)} layout` },
      h('button', { class: 'pg-handle', type: 'button', id: `pg-handle-${id}`, 'aria-label': `Drag ${label(id)} to move it`, onpointerdown: (ev) => startDrag(ev, id) },
        h('span', { 'aria-hidden': 'true' }, '⠿ '), label(id)),
      h('button', { class: 'btn quiet', type: 'button', id: `pg-earlier-${id}`, 'aria-label': `Move ${label(id)} earlier`, ...(i === 0 ? { 'aria-disabled': 'true' } : {}), onclick: () => go(-1) }, '◀ Earlier'),
      h('button', { class: 'btn quiet', type: 'button', id: `pg-later-${id}`, 'aria-label': `Move ${label(id)} later`, ...(i === n - 1 ? { 'aria-disabled': 'true' } : {}), onclick: () => go(1) }, 'Later ▶'));
  }

  /* ---------- dragging by the handle ---------- */
  function startDrag(ev, id) {
    if (ev.button > 0) return;
    ev.preventDefault();
    const item = ev.currentTarget.closest('.pg-item');
    drag = { id, item, target: null, after: false };
    item.classList.add('is-dragging');
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    const move = (e) => {
      const under = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest?.('.pg-item')).find((x) => x && x !== item);
      document.querySelectorAll('.pg-drop-before, .pg-drop-after').forEach((x) => x.classList.remove('pg-drop-before', 'pg-drop-after'));
      drag.target = under?.dataset.panel ?? null;
      if (under) {
        const r = under.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        drag.after = Math.abs(dy) > Math.abs(dx) ? dy > 0 : dx > 0;
        under.classList.add(drag.after ? 'pg-drop-after' : 'pg-drop-before');
      }
    };
    const end = (e, cancel) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelUp); window.removeEventListener('keydown', key);
      const d = drag; drag = null;
      item.classList.remove('is-dragging');
      document.querySelectorAll('.pg-drop-before, .pg-drop-after').forEach((x) => x.classList.remove('pg-drop-before', 'pg-drop-after'));
      if (!cancel && d?.target) { const next = moveTo(layout, orient(), d.id, d.target, d.after); if (next !== layout) save(next); }
    };
    const up = (e) => end(e, false);
    const cancelUp = (e) => end(e, true);
    const key = (e) => { if (e.key === 'Escape') end(e, true); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancelUp); window.addEventListener('keydown', key);
  }

  /* ---------- the lock, and the bar across the top while unlocked ---------- */
  const lockButton = () => h('button', {
    class: 'icon-btn toggle', id: 'layout-lock', 'aria-pressed': String(unlocked()),
    'aria-label': unlocked() ? 'Page layout is unlocked. Tap to lock it' : 'Page layout is locked. Tap to unlock it',
    onclick: () => setUnlocked(!unlocked()),
  }, icon(unlocked() ? 'unlock' : 'lock'));

  const topBar = () => !unlocked() ? null : h('section', { class: 'pg-top', id: 'pg-top', role: 'region', 'aria-label': 'Page layout is unlocked' },
    h('p', {}, h('strong', {}, 'Layout is unlocked. '), 'Nothing can be entered while it is. Move a panel with its Earlier and Later buttons, or drag its handle.'),
    h('div', { class: 'two' },
      h('button', { class: 'btn quiet', id: 'pg-reset', onclick: () => save({ ...layout, [orient()]: defaultLayout()[orient()] }) }, 'Reset this layout'),
      h('button', { class: 'btn primary', id: 'pg-done', onclick: () => setUnlocked(false) }, 'Done, lock it')));

  /** Options > My preferences. */
  const optionsSection = () => h('div', { class: 'setting', id: 'layout-setting' }, h('h3', {}, 'Main page layout'),
    h('p', { class: 'hint' }, 'The panels on the main page can be moved while the layout is unlocked. It starts locked. Portrait and landscape keep their own layouts.'),
    h('div', { class: 'two' },
      h('button', { class: 'btn', id: 'layout-open', onclick: () => { state.view = 'main'; setUnlocked(true); window.scrollTo(0, 0); } }, 'Unlock the layout'),
      h('button', { class: 'btn quiet', id: 'layout-reset-all', onclick: () => save(defaultLayout()) }, 'Reset both layouts')));

  /** After each render: the reminder bar goes quiet while unlocked, like everything else. */
  const sync = () => { document.getElementById('reminder-bar')?.toggleAttribute('inert', unlocked()); document.documentElement.classList.toggle('layout-edit', unlocked()); };

  const reload = () => { layout = (() => { try { return normaliseLayout(JSON.parse(localStorage.getItem(KEY))); } catch { return defaultLayout(); } })(); };
  let last = orient();
  window.addEventListener('resize', () => { const o = orient(); if (o !== last) { last = o; if (state.view === 'main') render(); } });

  return { grid, lockButton, topBar, optionsSection, sync, unlocked, reload };
}
