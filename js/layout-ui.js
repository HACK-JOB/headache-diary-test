// The main page grid, the lock, and moving panels. Locked by default: nothing can be moved or resized by accident.
// Unlocked: every panel shows a bar to move it (Earlier / Later buttons, or drag the handle) and its contents are switched off,
// so nothing can be entered or tapped by mistake. Portrait and landscape keep separate layouts. Saved on this tablet only.
import { PANELS, COLS, TEXT_PX, PANEL_TEXT, TALL_STEP_REM, GRIPS, normaliseLayout, defaultLayout, orientationOf, orderFor, spanFor, rowsFor, moveStep, moveTo,
  textFor, setText, zoomFor, minPx, minSpan, panelWidth, setSpan, heightBy, snapSpan, snapTall, isFree, setFree, isLoose, anyLoose, setLoose, isLocked, setLocked, planHeights, growBlocked, blocksOf, settleLayout, masonrySpan } from './layout.js';

const KEY = 'hd.layout';

export function createLayoutUI({ h, state, render, icon }) {
  let layout = (() => { try { return normaliseLayout(JSON.parse(localStorage.getItem(KEY))); } catch { return defaultLayout(); } })();
  let drag = null;                       // { id, item, target, after }
  let open = null;                       // the panel whose size and text settings are open
  const globalText = () => document.documentElement.dataset.text || 'big';
  const ownText = (id) => { const t = textFor(layout, id); return t === 'same' ? globalText() : t; };
  const TEXT_NAMES = { same: 'Same as all', big: 'Biggest', medium: 'Medium', small: 'Small' };
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
      const item = h('div', { class: 'pg-item' + (editing ? ' is-edit' : '') + (editing && open === id ? ' is-selected' : ''), 'data-panel': id });
      item.style.gridColumn = `span ${spanFor(layout, o, id)}`;
      const rows = rowsFor(layout, o, id, visible);
      if (rows > 1) item.style.gridRow = `span ${rows}`;
      const z = zoomFor(textFor(layout, id), globalText());
      const body = h('div', { class: 'pg-body' }, nodes[id]);
      if (z !== 1) body.style.zoom = String(z);
      const tall = layout[o].tall[id] ?? 0;
      if (tall) body.style.paddingBottom = `${tall * TALL_STEP_REM}rem`;
      if (editing) body.setAttribute('inert', '');
      item.append(...(editing ? [bar(id, i, order.length, visible), body, ...GRIPS.map((g) => grip(id, g))] : [body]));
      return item;
    });
    return h('div', { class: 'pgrid' + (anyLoose(layout, o) ? ' is-free' : ''), id: 'pgrid', 'data-orient': o }, ...items);
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

  /** Any loose panel: pack on a fine row grid. Each panel gets just enough small rows for its height, and snapped panels that
   *  sit side by side are first levelled to the tallest, so only loose panels let the one below slide up. */
  function pack(m) {
    const o = orient();
    const on = anyLoose(layout, o) && m.cols === COLS;
    const unit = 4;
    m.g.style.gridAutoRows = on ? `${unit}px` : '';
    m.g.style.rowGap = on ? '0px' : '';
    const items = [...m.g.querySelectorAll('.pg-item')];
    for (const item of items) { item.style.minHeight = ''; if (!on) { if (item.dataset.packed) { item.style.gridRow = ''; delete item.dataset.packed; } item.style.alignSelf = ''; } }
    if (!on) return;
    const measure = (item) => {
      const top = item.getBoundingClientRect().top;
      return Math.max(0, ...[...item.children].filter((c) => !c.classList.contains('pg-grip')).map((c) => c.getBoundingClientRect().bottom - top));
    };
    for (const item of items) { item.dataset.packed = '1'; item.style.gridRow = 'auto'; item.style.alignSelf = 'start'; item.style.minHeight = ''; }
    // Place the panels, read where they landed, plan the blocks from that, and repeat until nothing changes. One pass is not enough:
    // a taller panel lets the one below slide into another column, and a plan made from the old positions then no longer fits.
    const place = (heights) => {
      for (const item of items) { const h = heights[item.dataset.panel]; item.style.minHeight = `${h}px`; item.style.gridRow = `span ${masonrySpan({ heightPx: h, gapPx: m.gap, unitPx: unit })}`; }
      return geometry(m, items);
    };
    const natural = Object.fromEntries(items.map((item) => [item.dataset.panel, measure(item)]));
    const result = settleLayout(natural, place);
    place(result.heights);
    m.g.dataset.settled = result.stable ? String(result.rounds) : 'no';
  }

  /** Where every panel sits now, in columns and pixels, for the block logic. */
  function geometry(m, items = [...m.g.querySelectorAll('.pg-item')]) {
    const o = orient(), gr = m.g.getBoundingClientRect(), step = m.colW + m.gap;
    return items.map((item) => {
      const r = item.getBoundingClientRect(), id = item.dataset.panel;
      const c0 = Math.round((r.left - gr.left) / step), c1 = c0 + Math.max(spanFor(layout, o, id), minSpanOf(id, m));
      return { id, snap: !isLoose(layout, o, id), locked: isLocked(layout, o, id), c0, c1, top: r.top, bottom: r.bottom };
    });
  }
  /** Growing this panel would need the panels beside it to grow, and they are all size-locked. */
  const growStopped = (id) => { const m = gridMetrics(); return !!m && m.cols === COLS && growBlocked(geometry(m), id); };

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
      h('div', { class: 'setting-row' },
        h('button', { class: 'btn' + (isLoose(layout, o, id) ? '' : ' on'), type: 'button', id: `pg-snap-${id}`, 'aria-pressed': String(!isLoose(layout, o, id)),
          onclick: () => set(setLoose(layout, o, id, !isLoose(layout, o, id))) }, (isLoose(layout, o, id) ? '' : '✓ ') + 'Snap to neighbours'),
        h('p', { class: 'hint' }, isLoose(layout, o, id) ? 'Loose: keeps its own height, and the panel below slides up beside it.' : 'Snapped: stays tied to every panel it touches, and they resize together.')),
      h('div', { class: 'setting-row' },
        h('button', { class: 'btn' + (isLocked(layout, o, id) ? ' on' : ''), type: 'button', id: `pg-lock-${id}`, 'aria-pressed': String(isLocked(layout, o, id)),
          onclick: () => set(setLocked(layout, o, id, !isLocked(layout, o, id))) }, (isLocked(layout, o, id) ? '✓ ' : '') + 'Lock size'),
        h('p', { class: 'hint' }, isLocked(layout, o, id) ? 'Size locked: this panel stays the same height when the panels it is tied to grow.' : 'Not locked: this panel can take extra height when the panels it is tied to grow.')),
      growStopped(id) ? h('p', { class: 'hint pg-warn', id: `pg-blocked-${id}`, role: 'status' }, 'Cannot grow: everything beside this panel is size-locked.') : null,
      h('div', { class: 'two' },
        step('◀ Narrower', 'narrower', span <= min, () => set(setSpan(layout, o, id, span - 1, min))),
        step('Wider ▶', 'wider', span >= COLS, () => set(setSpan(layout, o, id, span + 1, min)))),
      h('div', { class: 'two' },
        step('▲ Shorter', 'shorter', heightBy(layout, o, id, -1) === layout || isLocked(layout, o, id), () => set(heightBy(layout, o, id, -1))),
        step('Taller ▼', 'taller', heightBy(layout, o, id, 1) === layout || isLocked(layout, o, id) || growStopped(id), () => set(heightBy(layout, o, id, 1)))));
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
    const stopped = growStopped(id);                   // everything beside it is size-locked: it may shrink but not grow
    const start = { x: ev.clientX, y: ev.clientY, span: Math.max(spanFor(layout, o, id), min), tall: layout[o].tall[id] ?? 0 };
    let now = layout;
    const base = layout;
    // Nothing on the page moves while dragging: an outline shows the new size and the page updates once, on release.
    const r0 = item.getBoundingClientRect();
    const ghost = h('div', { class: 'pg-ghost', 'aria-hidden': 'true' }, h('span', { class: 'pg-ghost-tag' }, ''));
    document.body.append(ghost);
    item.classList.add('is-resizing');
    const showGhost = (next, dsteps) => {
      const span = Math.max(spanFor(next, o, id), min), cur = Math.max(spanFor(base, o, id), min);
      const wNew = one ? r0.width : panelWidth(span, m.width, m.gap) - panelWidth(cur, m.width, m.gap) + r0.width;
      const hNew = Math.max(48, r0.height + dsteps * TALL_STEP_REM * rem);
      const left = g.x < 0 ? r0.right - wNew : r0.left, top = g.y < 0 ? r0.bottom - hNew : r0.top;
      Object.assign(ghost.style, { left: `${left}px`, top: `${top}px`, width: `${wNew}px`, height: `${hNew}px` });
      const bits = [];
      if (g.x && !one) bits.push(`${span} of ${COLS} wide`);
      if (g.y) bits.push(dsteps === 0 || isLocked(layout, o, id) ? 'height same' : dsteps > 0 ? `taller by ${dsteps}` : `shorter by ${-dsteps}`);
      ghost.firstChild.textContent = bits.join(', ');
    };
    const move = (e) => {
      let next = base;
      if (g.x && !one) next = setSpan(next, o, id, snapSpan({ startSpan: start.span, dxPx: e.clientX - start.x, sign: g.x, colW: m.colW, gap: m.gap, min }), min);
      let dsteps = Math.round(((e.clientY - start.y) * g.y) / (TALL_STEP_REM * rem));
      if (isLocked(layout, o, id) || (stopped && dsteps > 0)) dsteps = 0;
      if (g.y && dsteps) next = heightBy(next, o, id, dsteps);
      now = next;
      showGhost(next, g.y ? dsteps : 0);
    };
    const end = (e, cancel) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancelUp); window.removeEventListener('keydown', key);
      ghost.remove(); item.classList.remove('is-resizing');
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
      h('p', { class: 'hint' }, isFree(layout, orient()) ? 'Free flow: every panel keeps its own height.' : anyLoose(layout, orient()) ? 'Mixed: each panel has its own Snap to neighbours switch in its Size box.' : 'Snapped: every panel is tied to the panels it touches and they resize together.'),
      h('div', { class: 'seg' },
        h('button', { class: 'btn' + (!anyLoose(layout, orient()) ? ' on' : ''), type: 'button', id: 'pg-flow-snap', 'aria-pressed': String(!anyLoose(layout, orient())), onclick: () => save(setFree(layout, orient(), false)) }, (!anyLoose(layout, orient()) ? '✓ ' : '') + 'Snapped rows'),
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
  /** The Size settings live in a bar docked at the bottom of the screen, so opening them never changes any panel's size. */
  function sheet() {
    document.getElementById('pg-sheet')?.remove();
    const on = unlocked() && open && state.view === 'main' && document.querySelector(`[data-panel="${open}"]`);
    document.documentElement.style.setProperty('--sheet-h', '0px');
    document.documentElement.classList.toggle('sheet-open', !!on);
    if (!on) return;
    const el = h('section', { id: 'pg-sheet', class: 'pg-sheet', role: 'region', 'aria-label': `Size settings for ${label(open)}` },
      h('div', { class: 'pg-sheet-head' },
        h('strong', {}, `${label(open)}: size and text`),
        h('button', { class: 'btn primary', type: 'button', id: 'pg-sheet-close', onclick: () => { open = null; render(); } }, 'Close')),
      settings(open));
    document.body.append(el);
    document.documentElement.style.setProperty('--sheet-h', `${el.getBoundingClientRect().height}px`);
    const item = document.querySelector(`[data-panel="${open}"]`), r = item.getBoundingClientRect(), room = window.innerHeight - el.getBoundingClientRect().height;
    if (r.top < 0 || r.top > room - 80) window.scrollBy({ top: r.top - 90, behavior: 'instant' });
  }

  /** The panel being edited, and the panels it is tied to, are marked so it is clear what will resize together. */
  function markTied() {
    document.querySelectorAll('.is-tied').forEach((x) => x.classList.remove('is-tied'));
    const m = gridMetrics();
    if (!unlocked() || !open || !m || m.cols !== COLS) return;
    const block = blocksOf(geometry(m)).find((ids) => ids.includes(open));
    for (const id of block ?? []) if (id !== open) document.querySelector(`[data-panel="${id}"]`)?.classList.add('is-tied');
  }

  const sync = () => { fit(); sheet(); markTied(); document.getElementById('reminder-bar')?.toggleAttribute('inert', unlocked()); document.documentElement.classList.toggle('layout-edit', unlocked()); };

  const reload = () => { layout = (() => { try { return normaliseLayout(JSON.parse(localStorage.getItem(KEY))); } catch { return defaultLayout(); } })(); };
  let last = orient();
  window.addEventListener('resize', () => { const o = orient(); if (o !== last) { last = o; if (state.view === 'main') render(); } else fit(); });

  /** Help opens over the page, so the docked Size bar is put away first (the tour would sit on top of it). */
  const closeSize = () => { if (open) { open = null; render(); } };
  return { grid, lockButton, topBar, optionsSection, sync, unlocked, reload, closeSize };
}
