// Help tour overlay: dims the page, points arrows at real elements, scrolls through the page in stops.
import { TOURS, layoutCallouts, pagesFor } from './tour.js';

const NS = 'http://www.w3.org/2000/svg';
const BAR = 92;          // height reserved for the Back / Next / Close bar
const CW = () => (window.innerWidth < 700 ? 210 : 290);

export function createTour({ h }) {
  let layer = null;
  let stop = 0;
  let stops = 1;
  let opener = null;
  let steps = TOURS.main;

  const close = () => {
    layer?.remove(); layer = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    document.body.classList.remove('touring');
    window.scrollTo(0, 0);
    opener?.focus(); opener = null;
  };
  const onResize = () => { stopsPlan = []; draw(); };
  const onKey = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); go(1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); go(-1); }
    else if (ev.key === 'Tab' && layer) {
      const f = [...layer.querySelectorAll('button:not([disabled])')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      ev.preventDefault();
      f[(i + (ev.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    }
  };
  const go = (d) => {
    const n = Math.max(0, Math.min(stops - 1, stop + d));
    if (n === stop) { if (d > 0) close(); return; }
    stop = n; draw();
    layer.querySelector(d > 0 ? '#tour-next' : '#tour-back')?.focus();
  };

  function allSteps() {
    const out = [];
    const sy = window.scrollY;
    steps.forEach((s) => {
      for (const q of s.sel) {
        const el = document.querySelector(q);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        out.push({ step: s, n: out.length, el, doc: { x: r.left, y: r.top + sy, w: r.width, h: r.height } });
        break;
      }
    });
    out.sort((p, q) => (Math.round(p.doc.y / 40) - Math.round(q.doc.y / 40)) || (p.doc.x - q.doc.x));
    out.forEach((f, i) => { f.n = i; });
    return out;
  }

  // Plan the stops: each feature belongs to the first stop where its top edge is clearly on screen. Empty stops are dropped.
  /** Height of the fixed medicine-reminder bar when it is showing, so callouts never sit under it. */
  const barH = () => { const b = document.getElementById('reminder-bar'); return b && getComputedStyle(b).display !== 'none' ? Math.ceil(b.getBoundingClientRect().height) : 0; };

  function plan() {
    const vh = window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    const step = vh - BAR - 48;
    const total = pagesFor(docH, vh, 8);
    const feats = allSteps();
    const tops = Array.from({ length: total }, (_, k) => (k === total - 1 ? Math.max(0, docH - vh) : k * step));
    const groups = tops.map(() => []);
    for (const f of feats) {
      const k = tops.findIndex((t) => f.doc.y >= t + 4 && f.doc.y <= t + vh - BAR - 40);
      groups[k < 0 ? total - 1 : k].push(f);
    }
    const keep = groups.map((g, k) => ({ top: tops[k], feats: g })).filter((g) => g.feats.length);
    return keep.length ? keep : [{ top: 0, feats: [] }];
  }

  let stopsPlan = [];
  let listHint = 0;

  function draw() {
    if (!layer) return;
    const vh = window.innerHeight; const vw = window.innerWidth;
    if (!stopsPlan.length || stopsPlan.stale) { stopsPlan = plan(); }
    stops = stopsPlan.length;
    stop = Math.min(stop, stops - 1);
    const cur = stopsPlan[stop];
    window.scrollTo(0, cur.top);
    const clipTop = 4 + barH(); const clipBot = vh - BAR;
    const todo = cur.feats.map((f) => {
      const y = f.doc.y - window.scrollY; const top = Math.max(y, clipTop); const bottom = Math.min(y + f.doc.h, clipBot - 4);
      const tall = f.doc.h > 130;
      const full = Math.max(24, bottom - top);
      return { step: f.step, n: f.n, rect: { x: f.doc.x, y: top, w: tall ? Math.min(f.doc.w, 260) : f.doc.w, h: tall ? Math.min(full, 52) : full } };
    });
    const shortOnes = todo; const tallOnes = [];
    const cw = CW();
    // measure each card's real height first, so the layout never guesses
    const probe = h('div', { class: 'tour', style: 'visibility:hidden;background:none' },
      ...shortOnes.map((v) => h('div', { class: 'tour-card', 'data-n': String(v.n), style: `width:${cw}px;position:absolute;left:0;top:0` },
        h('span', { class: 'tour-num' }, '0'), h('p', {}, v.step.text))));
    document.body.appendChild(probe);
    const hts = new Map([...probe.querySelectorAll('.tour-card')].map((c) => [Number(c.dataset.n), Math.ceil(c.getBoundingClientRect().height)]));
    probe.remove();
    const items = shortOnes.map((v) => ({ id: v.n, rect: v.rect, cw, ch: hts.get(v.n) || 78 }));
    // lay out; if some points do not fit they go in a list above the bar, so lay out again above that list
    let listH = 0;
    let { placed, overflow } = layoutCallouts(items, { w: vw, h: vh - BAR, top: 8 + barH() });
    for (let pass = 0; pass < 3 && overflow.length; pass++) {
      const need = Math.max(listHint, 62 + overflow.length * Math.ceil(30 * (window.innerWidth < 700 ? 1.6 : 1.25)) + 16);
      if (need === listH) break;
      listH = need;
      ({ placed, overflow } = layoutCallouts(items, { w: vw, h: vh - BAR - listH, top: 8 + barH() }));
    }
    const byN = new Map(todo.map((v) => [v.n, v]));
    const kids = [];
    // numbered rings around the targets and arrows from callouts
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'tour-svg'); svg.setAttribute('width', vw); svg.setAttribute('height', vh); svg.setAttribute('aria-hidden', 'true');
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<marker id="tour-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker>';
    svg.appendChild(defs);
    for (const v of todo) {
      const ring = document.createElementNS(NS, 'rect');
      ring.setAttribute('x', v.rect.x - 4); ring.setAttribute('y', v.rect.y - 4);
      ring.setAttribute('width', v.rect.w + 8); ring.setAttribute('height', v.rect.h + 8); ring.setAttribute('rx', 10);
      ring.setAttribute('class', 'tour-ring'); svg.appendChild(ring);
    }
    for (const p of placed) {
      const v = byN.get(p.id);
      const t = v.rect;
      let x1; let y1; let x2; let y2;
      if (p.side === 'right') { x1 = p.x; y1 = p.y + hts.get(p.id) / 2; x2 = t.x + t.w + 5; y2 = t.y + t.h / 2; }
      else if (p.side === 'left') { x1 = p.x + cw; y1 = p.y + hts.get(p.id) / 2; x2 = t.x - 5; y2 = t.y + t.h / 2; }
      else if (p.side === 'below') { x1 = p.x + cw / 2; y1 = p.y; x2 = t.x + t.w / 2; y2 = t.y + t.h + 5; }
      else { x1 = p.x + cw / 2; y1 = p.y + hts.get(p.id); x2 = t.x + t.w / 2; y2 = t.y - 5; }
      const ln = document.createElementNS(NS, 'line');
      for (const [k, val] of [['x1', x1], ['y1', y1], ['x2', x2], ['y2', y2]]) ln.setAttribute(k, val);
      ln.setAttribute('class', 'tour-arrow'); ln.setAttribute('marker-end', 'url(#tour-head)');
      svg.appendChild(ln);
    }
    kids.push(svg);
    for (const p of placed) {
      const v = byN.get(p.id);
      kids.push(h('div', { class: 'tour-card', style: `left:${p.x}px;top:${p.y}px;width:${cw}px` },
        h('span', { class: 'tour-num', 'aria-hidden': 'true' }, String(p.id + 1)),
        h('p', {}, v.step.text)));
    }
    const listIds = [...overflow].sort((a, b) => a - b);
    if (listIds.length) {
      kids.push(h('div', { class: 'tour-more' }, h('strong', {}, 'Numbered on the page'),
        h('ol', {}, ...listIds.map((id) => h('li', { value: id + 1 }, byN.get(id).step.text)))));
    }
    for (const v of tallOnes) kids.push(h('span', { class: 'tour-badge', 'aria-hidden': 'true', style: `left:${v.rect.x + v.rect.w - 34}px;top:${v.rect.y - 12}px` }, String(v.n + 1)));
    for (const id of overflow) { const v = byN.get(id); kids.push(h('span', { class: 'tour-badge', 'aria-hidden': 'true', style: `left:${v.rect.x + v.rect.w - 34}px;top:${v.rect.y - 12}px` }, String(v.n + 1))); }
    if (!todo.length) kids.push(h('p', { class: 'tour-empty' }, 'Nothing new to point at on this part of the page.'));
    kids.push(h('div', { class: 'tour-bar' },
      h('button', { class: 'btn quiet', id: 'tour-back', disabled: stop === 0, onclick: () => go(-1) }, 'Back'),
      h('p', { class: 'tour-step num', 'aria-live': 'polite' }, `Part ${stop + 1} of ${stops}`),
      h('button', { class: 'btn primary', id: 'tour-next', onclick: () => go(1) }, stop === stops - 1 ? 'Done' : 'Next'),
      h('button', { class: 'btn quiet', id: 'tour-close', onclick: close }, 'Close')));
    layer.replaceChildren(...kids);
    const more = layer.querySelector('.tour-more');
    if (more) {
      const cardsEls = [...layer.querySelectorAll('.tour-card')];
      const mt = more.getBoundingClientRect().top;
      if (cardsEls.some((c) => c.getBoundingClientRect().bottom > mt)) {
        // a card ended up under the list: shrink the area for cards by the list's real height and draw again
        const need = Math.ceil(window.innerHeight - BAR - mt) + 12;
        if (need > listHint) { listHint = need; draw(); }
      }
    }
  }


  function open(from, key = 'main') {
    if (layer) return;
    steps = TOURS[key] || TOURS.main;
    opener = from || document.getElementById('help');
    stopsPlan = []; stop = 0; listHint = 0;
    layer = h('div', { class: 'tour', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Guide to this page' });
    layer.addEventListener('click', (ev) => { if (ev.target === layer) close(); });
    document.body.classList.add('touring');
    document.body.appendChild(layer);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    window.scrollTo(0, 0);
    draw();
    layer.querySelector('#tour-next')?.focus();
  }
  return { open, close, isOpen: () => !!layer };
}
