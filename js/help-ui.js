// The Help overlay for the main page: dims the screen, rings real buttons, draws an arrow and a short sentence
// beside each. Long pages are shown in groups ("Next" scrolls to the next group). If a group cannot be laid out
// without covering things, the sentences are shown as a numbered list instead.
import { MAIN_STEPS, layoutCallouts, pageFrom } from './help.js';

const NS = 'http://www.w3.org/2000/svg';
const BAR = 104;            // height kept free at the bottom for the Back / Next / Close buttons
const TOP = 96;             // room kept above the first target of a group (sticky top bar)

export function createHelpUI(ctx) {
  const { h } = ctx;
  let root = null; let opener = null; let pageStart = 0; let timer = null;

  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const find = (step) => { for (const s of step.selectors) { const el = document.querySelector(s); if (el && visible(el)) return el; } return null; };
  const fontPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 20;
  const svg = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

  /** Steps that exist on this page right now, with their elements and document positions. */
  function liveSteps() {
    return MAIN_STEPS.map((s) => ({ ...s, el: find(s) })).filter((s) => s.el).map((s) => {
      const r = s.el.getBoundingClientRect();
      return { ...s, doc: { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height } };
    });
  }

  function close() {
    clearTimeout(timer);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey, true);
    root?.remove(); root = null;
    document.documentElement.classList.remove('help-open');
    opener?.focus();
  }
  const onKey = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    if (ev.key === 'Tab' && root) {                         // keep focus inside the overlay
      const f = [...root.querySelectorAll('button')];
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  };
  const onResize = () => { clearTimeout(timer); timer = setTimeout(() => { if (root) draw(true); }, 150); };

  function open() {
    if (root) return;
    opener = document.getElementById('help');
    pageStart = 0;
    document.documentElement.classList.add('help-open');
    root = h('div', { class: 'help-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Help for this page' });
    document.body.append(root);
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey, true);
    window.scrollTo(0, 0);
    setTimeout(() => draw(false), 60);
  }

  function draw(keepScroll) {
    const steps = liveSteps();
    if (!steps.length) { close(); return; }
    if (pageStart >= steps.length) pageStart = 0;
    const vw = window.innerWidth; const vh = window.innerHeight - BAR;
    const idx = pageFrom(steps.map((s) => s.doc), pageStart, vh - TOP - 8, 5);
    const first = steps[idx[0]];
    if (!keepScroll) window.scrollTo(0, Math.max(0, first.doc.y - TOP));
    // After scrolling, read where each target really is on screen.
    const targets = idx.map((i) => {
      const r = steps[i].el.getBoundingClientRect();
      return { id: steps[i].id, text: steps[i].text, rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
    }).filter((t) => t.rect.y + t.rect.h > 0 && t.rect.y < vh);
    const { placed, failed } = layoutCallouts(targets, { w: vw, h: vh }, { fontPx: fontPx() });
    const nextStart = idx[idx.length - 1] + 1;
    const pages = []; for (let s = 0; s < steps.length; s = pageFrom(steps.map((x) => x.doc), s, vh - TOP - 8, 5).slice(-1)[0] + 1) pages.push(s);
    const pageNo = pages.indexOf(pageStart) + 1 || 1;

    const layer = svg('svg', { class: 'help-svg', width: vw, height: window.innerHeight, viewBox: `0 0 ${vw} ${window.innerHeight}`, 'aria-hidden': 'true' });
    const pad = 6;
    let d = `M0 0H${vw}V${window.innerHeight}H0Z`;
    for (const t of targets) { const r = t.rect; d += `M${r.x - pad} ${r.y - pad}h${r.w + 2 * pad}v${r.h + 2 * pad}h${-(r.w + 2 * pad)}Z`; }
    layer.append(svg('path', { d, 'fill-rule': 'evenodd', class: 'help-dim' }));
    const defs = svg('defs'); const mk = svg('marker', { id: 'help-head', markerWidth: '10', markerHeight: '10', refX: '8', refY: '5', orient: 'auto', markerUnits: 'userSpaceOnUse' });
    mk.append(svg('path', { d: 'M0 0L10 5L0 10Z', class: 'help-arrow-head' })); defs.append(mk); layer.append(defs);
    for (const t of targets) { const r = t.rect; layer.append(svg('rect', { x: r.x - pad, y: r.y - pad, width: r.w + 2 * pad, height: r.h + 2 * pad, rx: 10, class: 'help-ring' })); }
    for (const p of placed) layer.append(svg('line', { x1: p.arrow.from.x, y1: p.arrow.from.y, x2: p.arrow.to.x, y2: p.arrow.to.y, class: 'help-arrow', 'marker-end': 'url(#help-head)' }));

    const cards = placed.map((p) => h('div', { class: 'help-callout', style: `left:${p.box.x}px;top:${p.box.y}px;width:${p.box.w}px;min-height:${p.box.h}px` },
      h('span', { class: 'help-n' }, String(p.n)), h('span', { class: 'help-text' }, p.text)));
    // Fallback: a number on the target and the sentence in a list.
    const badges = failed.map((f) => h('span', { class: 'help-n help-n-pin', style: `left:${Math.max(4, f.rect.x - 4)}px;top:${Math.max(4, f.rect.y - 4)}px` }, String(f.n)));
    const list = failed.length ? h('ol', { class: 'help-list', 'aria-label': 'More help on this page' }, ...failed.map((f) => h('li', { value: f.n }, f.text))) : null;

    const hasPrev = pageStart > 0;
    const hasNext = nextStart < steps.length;
    const bar = h('div', { class: 'help-bar' },
      h('span', { class: 'help-page', 'aria-live': 'polite' }, `Help ${pageNo} of ${pages.length}`),
      h('div', { class: 'help-btns' },
        h('button', { class: 'btn quiet', id: 'help-prev', disabled: !hasPrev, onclick: () => { pageStart = pages[Math.max(0, pageNo - 2)]; draw(false); } }, 'Back'),
        hasNext ? h('button', { class: 'btn primary', id: 'help-next', onclick: () => { pageStart = nextStart; draw(false); } }, 'Next')
          : h('button', { class: 'btn primary', id: 'help-done', onclick: close }, 'Done'),
        h('button', { class: 'btn quiet', id: 'help-close', onclick: close }, 'Close')));
    root.replaceChildren(h('div', { class: 'help-backdrop', onclick: close }), layer, ...cards, ...badges, list, bar);
    root.dataset.placed = String(placed.length); root.dataset.failed = String(failed.length);
    (document.getElementById('help-next') ?? document.getElementById('help-done'))?.focus({ preventScroll: true });
  }

  const button = () => h('button', { class: 'help-btn', id: 'help', 'aria-label': 'Help for this page', onclick: open }, h('span', { 'aria-hidden': 'true', class: 'help-q' }, '?'), 'Help');
  return { button, open, close };
}
