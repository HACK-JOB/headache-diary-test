// "What's new" cards, one per screen that changed, plus a Past updates list for the Tester notes tab.
import { RELEASES } from './releases.js';
import { unseenFor, markSeen, freshSeen, notesFor, SCREENS } from './patchnotes.js';

const KEY = 'hd.notesSeen';
// A tablet with nothing saved yet is a new install: it starts caught up. Decided at load, before the app saves anything.
if (localStorage.getItem(KEY) == null && ![...Array(localStorage.length).keys()].some((i) => localStorage.key(i).startsWith('hd.'))) {
  localStorage.setItem(KEY, JSON.stringify(freshSeen(RELEASES)));
}
const loadSeen = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };

export function createPatchUI({ h, state, render }) {
  const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const dismiss = (screen) => { localStorage.setItem(KEY, JSON.stringify(markSeen(loadSeen(), RELEASES, screen))); render(); };

  function card(screen) {
    const notes = unseenFor(RELEASES, loadSeen(), screen);
    if (!notes.length) return null;
    const id = `pn-${screen}`;
    return h('section', { class: 'pn-card', id, role: 'region', 'aria-labelledby': `${id}-h`, 'data-screen': screen },
      h('h3', { id: `${id}-h` }, 'What\'s new on this screen'),
      h('ul', {}, ...notes.map((n) => h('li', {}, n.text))),
      h('button', { class: 'btn quiet', id: `${id}-ok`, onclick: () => dismiss(screen) }, 'Got it'));
  }

  /** Which screen keys are on show right now (the page, plus the open side-tab group if any). */
  function current() {
    const v = state.view;
    if (v !== 'options') return { page: v === 'main' ? 'main' : v, sub: null };
    const page = state.optTab;
    const side = state.side?.[page];
    return { page, sub: page === 'admin' && side === 'reset' ? 'admin-reset' : page === 'doctors' && side === 'rx' ? 'doctors-rx' : null };
  }

  /** Put the cards where they belong. Runs after every render; safe to run repeatedly. */
  function place() {
    document.querySelectorAll('.pn-card').forEach((el) => el.remove());
    const { page, sub } = current();
    const top = document.getElementById('tabpanel') ?? document.querySelector('main');
    const c = card(page);
    if (c && top) top.prepend(c);
    const s = sub ? card(sub) : null;
    const body = document.querySelector('.side-body');
    if (s && body) body.prepend(s);
  }

  function pastList() {
    const all = [...RELEASES].sort((a, b) => b.id - a.id);
    return h('div', { class: 'setting', id: 'pn-past' }, h('h3', {}, 'Past updates'),
      all.length ? h('div', {}, ...all.map((r) => h('details', { class: 'pn-rel' }, h('summary', {}, `${r.title} · ${fmtDate(r.date)}`),
        h('ul', {}, ...r.notes.map((n) => h('li', {}, h('strong', {}, `${SCREENS.find((x) => x.key === n.screen)?.label ?? n.screen}: `), n.text))))))
        : h('p', { class: 'hint' }, 'No updates have been published yet.'));
  }
  return { place, card, pastList, count: (screen) => notesFor(RELEASES, screen).length };
}
