// The main page grid, the lock, and moving panels. Locked by default: nothing can be moved or resized by accident.
// Unlocked: every panel shows a bar to move it (Earlier / Later buttons, or drag the handle) and its contents are switched off,
// so nothing can be entered or tapped by mistake. Portrait and landscape keep separate layouts. Saved on this tablet only.
import { PANELS, COLS, TEXT_PX, PANEL_TEXT, TALL_STEP_REM, GRIPS, normaliseLayout, defaultLayout, orientationOf, orderFor, spanFor, rowsFor, moveStep, moveTo,
  textFor, setText, zoomFor, minPx, minSpan, setSpan, heightBy, snapSpan, snapTall, isFree, setFree, masonrySpan } from './layout.js';

const KEY = 'hd.layout';

export function createLayoutUI({ h, state, render, icon }) {
  let layout = (() => { try { return normaliseLayout(JSON.parse(localStorage.getItem(KEY))); } catch { return defaultLayout(); } })();
  let drag = null;                       // { id, item, target, after }
  let open = null;                       // the panel whose size and text settings are open
  const globalText = () => document.documentElement.dataset.text || 'big';
  const ownText = (id) => { const t = textFor(layout, id); return t === 'same' ? globalText() : t; };
  const TEXT_NAMES = { same: 'Same as everywhere', big: 'Biggest', medium: 'Medium', small: 'Small' };
  const orient = () => orientationOf(window.innerWidth, window.innerHeight);
  const save = (l) => { layout = l; localStorage.setItem(KEY, JSON.stringify(l)); render(); };
  const label = (id) => PANELS.find((p) => p.id === id)?.label ?? id;
  const unlocked = () => !!state.layoutOpen;
  const setUnlocked = (on) => { state.layoutOpen = !!on; drag = null; open = null; render(); };

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
      const z = zoomFor(textFor(layout, id), globalText());
      const body = h('div', { class: 'pg-body' }, nodes[id]);
      if (z !== 1) body.style.zoom = String(z);
      const tall = layout[o].tall[id] ?? 0;
      if (tall) body.style.paddingBottom = `${tall * TALL_STEP_REM}rem`;
      if (editing) body.setAttribute('inert', '');
      item.append(...(editing ? [bar(id, i, order.length, visible), ...(open === id ? [settings(id)] : []), body, ...GRIPS.map((g) => grip(id, g))] : [body]));
      return item;
    });
    return h('div', { class: 'pgrid' + (isFree(layout, o) ? ' is-free' : ''), id: 'pgrid', 'data-orient': o }, ...items);
  }

  /* ---------- the bar on each panel while unlocked ---------- */
  function bar(id, i, n, visible) {
    const go = (dir) => { const next = moveStep(layout, orient(), id, dir, visible); if (next !== layout) save(next); };
    return h('div', { class: 'pg-bar', role: 'group', 'aria-label': `${label(id)} layout` },
      h('button', { class: 'pg-handle', type: 'button', id: `pg-handle-${id}`, 'aria-label': `Drag ${label(id)} to move it`, onpointerdown: (ev) => startDrag(ev, id) },
        h('span', { 'aria-hidden': 'true' }, '⠿ '), label(id)),
      h('button', { class: 'btn quiet', type: 'button', id: `pg-earlier-${id}`, 'aria-label': `Move ${label(id)} earlier`, ...(i === 0 ? { 'aria-disabled': 'true' } : {}), onclick: () => go(-1) }, '◀ Earlier'),
      h('button', { class: 'btn quiet', type: 'button', id: `pg-later-${id}`, 'aria-label': `Move ${label(id)} later`, ...(i === n - 1 ? { 'aria-disabled': 'true' } : {}), onclick: () => go(1) }, 'Later ▶'),
      h('button', { class: 'btn quiet', type: 'button', id: `pg-set-${id}`, 'aria-expanded': String(open === id), 'aria-label': `Size and text settings for ${label(id)}`, onclick: () => { open = open === id ? null : id; render(); } }, '⚙ Size'));
  }

  /* ---------- the smallest width a panel may have, from its own text size, measured against the real grid ---------- */
  const gridMetrics = () => {
    const g = document.getElementById('pgrid'); if (!g) return null;
    const cs = getComputedStyle(g);
    const gap = parseFloat(cs.columnGap) || 0, width = g.clientWidth;
    return { g, gap, width, colW: (width - (COLS - 1) * gap) / COLS, cols: cs.gridTemplateColumns.split(' ').length };
  };
  const minSpanOf = (id, m) => (m && m.cols === COLS ? minSpan({ minPx: minPx(id, ownText(id)), gridWidth: m.width, gap: m.gap }) : 1);

  /** After each render: widen any panel that is saved narrower than it can show properly (the saved value is left alone). */
  function fit() {
    const m = gridMetrics(); if (!m) return;
    const o = orient();
    for (const item of m.g.querySelectorAll('.pg-item')) {
      const id = item.dataset.panel;
      item.style.gridColumn = `span ${Math.max(spanFor(layout, o, id), minSpanOf(id, m))}`;
    }
    pack(m);
  }

  /** Free flow: give each panel just enough small rows for its own height, so the panel below can slide up beside it. */
  function pack(m) {
    const free = isFree(layout, orient()) && m.cols === COLS;
    const unit = 4, gapPx = m.gap;
    m.g.style.gridAutoRows = free ? `${unit}px` : '';
    m.g.style.rowGap = free ? '0px' : '';
    for (const item of m.g.querySelectorAll('.pg-item')) {
      if (!free) { item.style.marginBottom = ''; if (item.dataset.packed) { item.style.gridRow = item.dataset.packed === 'x' ? '' : item.dataset.packed; delete item.dataset.packed; } continue; }
      item.dataset.packed = item.dataset.packed || 'x';
      item.style.gridRow = 'auto';
      item.style.alignSelf = 'start';
      // Measure the content (bar, settings, body), never the grips that stick out past the edge
      const top = item.getBoundingClientRect().top;
      const natural = Math.max(0, ...[...item.children].filter((c) => !c.classList.contains('pg-grip')).map((c) => c.getBoundingClientRect().bottom - top));
      item.style.gridRow = `span ${masonrySpan({ heightPx: natural, gapPx, unitPx: unit })}`;
    }
  }

  /* ---------- the settings under a panel's bar: text size, width and height buttons ---------- */
  function settings(id) {
    const o = orient(), m = gridMetrics(), min = minSpanOf(id, m);
    const span = Math.max(spanFor(layout, o, id), min), tall = layout[o].tall[id] ?? 0;
    const set = (next) => { if (next !== layout) save(next); };
    const step = (lbl, name, disabled, fn) => h('button', { class: 'btn quiet', type: 'button', id: `pg-${name}-${id}`, ...(disabled ? { 'aria-disabled': 'true' } : {}), onclick: () => { if (!disabled) fn(); } }, lbl);
    return h('div', { class: 'pg-set', role: 'group', 'aria-label': `${label(id)} size and text` },
      h('p', { class: 'hint' }, `Width ${span} of ${COLS} columns (at least ${min} here). Height ${layout[o].rows[id]} row${layout[o].rows[id] > 1 ? 's' : ''}${tall ? `, +${tall}` : ''}.`),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Text size of this panel' },
        ...PANEL_TEXT.map((t) => h('button', { class: 'btn' + (textFor(layout, id) === t ? ' on' : ''), type: 'button', id: `pg-text-${id}-${t}`, 'aria-pressed': String(textFor(layout, id) === t),
          onclick: () => set(setText(layout, id, t)) }, (textFor(layout, id) === t ? '✓ ' : '') + TEXT_NAMES[t]))),
      h('div', { class: 'two' },
        step('◀ Narrower', 'narrower', span <= min, () => set(setSpan(layout, o, id, span - 1, min))),
        step('Wider ▶', 'wider', span >= COLS, () => set(setSpan(layout, o, id, span + 1, min)))),
      h('div', { class: 'two' },
        step('▲ Shorter', 'shorter', heightBy(layout, o, id, -1) === layout, () => set(heightBy(layout, o, id, -1))),
        step('Taller ▼', 'taller', heightBy(layout, o, id, 1) === layout, () => set(heightBy(layout, o, id, 1)))));
  }

  /* ---------- resizing by dragging an edge or corner ---------- */
  const GRIP_NAMES = { n: 'top edge', e: 'right edge', s: 'bottom edge', w: 'left edge', ne: 'top right corner', se: 'bottom right corner', sw: 'bottom left corner', nw: 'top left corner' };
  function grip(id, g) {
    return h('div', { class: `pg-grip pg-grip-${g.key}`, 'data-grip': g.key, 'data-panel-grip': id, role: 'presentation', title: `Drag the ${GRIP_NAMES[g.key]} to resize`,
      onpointerdown: (ev) => startResize(ev, id, g) });
  }
  function startResize(ev, id, g) {
    if (ev.button > 0) return;
    ev.preventDefault();
    const m = gridMetrics(); if (!m) return;
    const one = m.cols !== COLS;                       // phone: a single column, so only height can change
    const o = orient(), item = ev.currentTarget.closest('.pg-item');
    const zoom = parseFloat(item.querySelector('.pg-body')?.style.zoom) || 1, rem = parseFloat(getComputedStyle(document.documentElement).fontSize) * zoom;
    const min = minSpanOf(id, m);
    const start = { x: ev.clientX, y: ev.clientY, span: Math.max(spanFor(layout, o, id), min), tall: layout[o].tall[id] ?? 0 };
    let now = layout;
    const base = layout;
    const move = (e) => {
      let next = base;
      if (g.x && !one) next = setSpan(next, o, id, snapSpan({ startSpan: start.span, dxPx: e.clientX - start.x, sign: g.x, colW: m.colW, gap: m.gap, min }), min);
      if (g.y) next = heightBy(next, o, id, Math.round(((e.clientY - start.y) * g.y) / (TALL_STEP_REM * rem)));
      now = next;
      item.style.gridColumn = `span ${Math.max(spanFor(next, o, id), min)}`;
      const body = item.querySelector('.pg-body'); if (body) body.style.paddingBottom = `${(next[o].tall[id] ?? 0) * TALL_STEP_REM}rem`;
      const rw = rowsFor(next, o, id, [...document.querySelectorAll('.pg-item')].map((x) => x.dataset.panel)); item.style.gridRow = rw > 1 ? `span ${rw}` : '';
    };
    const end = (e, cancel) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelUp); window.removeEventListener('keydown', key);
      if (!cancel && now !== layout) save(now); else render();
    };
    const up = (e) => end(e, false), cancelUp = (e) => end(e, true), key = (e) => { if (e.key === 'Escape') end(e, true); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancelUp); window.addEventListener('keydown', key);
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
    h('p', {}, h('strong', {}, 'Layout is unlocked. '), 'Nothing can be entered while it is. Move a panel with its Earlier and Later buttons or its handle. Resize by dragging an edge or corner, or open its Size settings.'),
    h('div', { class: 'pg-flow', role: 'group', 'aria-label': 'How panels line up' },
      h('p', { class: 'hint' }, isFree(layout, orient()) ? 'Free flow: each panel keeps its own height and the one below slides up into any gap.' : 'Snapped rows: panels side by side stay level with each other.'),
      h('div', { class: 'seg' },
        h('button', { class: 'btn' + (!isFree(layout, orient()) ? ' on' : ''), type: 'button', id: 'pg-flow-snap', 'aria-pressed': String(!isFree(layout, orient())), onclick: () => save(setFree(layout, orient(), false)) }, (!isFree(layout, orient()) ? '✓ ' : '') + 'Snapped rows'),
        h('button', { class: 'btn' + (isFree(layout, orient()) ? ' on' : ''), type: 'button', id: 'pg-flow-free', 'aria-pressed': String(isFree(layout, orient())), onclick: () => save(setFree(layout, orient(), true)) }, (isFree(layout, orient()) ? '✓ ' : '') + 'Free flow'))),
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
  const sync = () => { fit(); document.getElementById('reminder-bar')?.toggleAttribute('inert', unlocked()); document.documentElement.classList.toggle('layout-edit', unlocked()); };

  const reload = () => { layout = (() => { try { return normaliseLayout(JSON.parse(localStorage.getItem(KEY))); } catch { return defaultLayout(); } })(); };
  let last = orient();
  window.addEventListener('resize', () => { const o = orient(); if (o !== last) { last = o; if (state.view === 'main') render(); } else fit(); });

  return { grid, lockButton, topBar, optionsSection, sync, unlocked, reload };
}
