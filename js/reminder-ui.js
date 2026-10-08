// The reminder banner: sits at the top of every screen while a medicine reminder is showing.
// It follows js/reminders.js. It only works while the app is open (see the plan: keep the tablet on the charger).
import { activeReminders } from './reminders.js';
import { FOOD } from './prescriptions.js';

export function createReminderUI(ctx) {
  const { h, state, log, reload, render, time } = ctx;
  const dismissed = new Map();       // reminder id -> when "Remind me later" was tapped (lost on reload; the next one simply shows)
  const chimed = new Set();          // `${id}@${fireMs}` already chimed
  let host = null; let signature = ''; let audio = null; let watcher = null;

  const chime = () => {
    if (!state.settings.chime) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      [[660, 0], [880, 0.22]].forEach(([f, dt]) => {
        const o = audio.createOscillator(); const g = audio.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.25, t0 + dt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.35);
        o.connect(g); g.connect(audio.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.4);
      });
    } catch { /* no sound available: the banner still shows */ }
  };

  const answer = async (d, action) => {
    await log.add({ type: 'dose', rxId: d.rxId, slot: d.slot, forDay: state.key, action });
    await reload(); render(); tick();
  };

  const draw = (list) => {
    if (!host) {
      host = h('section', { id: 'reminder-bar', class: 'reminder-bar', 'aria-live': 'assertive', 'aria-label': 'Medicine reminder' });
      document.body.prepend(host);
    }
    if (!list.length) { host.replaceChildren(); host.hidden = true; document.documentElement.style.setProperty('--rb-h', '0px'); return; }
    const r = list[0]; const d = r.dose;
    const food = d.food ? FOOD.find((f) => f.key === d.food)?.label : '';
    host.hidden = false;
    host.replaceChildren(
      h('div', { class: 'rb-text' },
        h('p', { class: 'rb-title' }, `Time for ${d.name} · ${d.dose}`),
        h('p', { class: 'meta num' }, d.mode === 'exact' ? `At ${time(d.startMs)}` : `${time(d.startMs)} to ${time(d.endMs)}`, food ? ` · ${food}` : ''),
        d.instructions ? h('p', { class: 'rb-instr' }, d.instructions) : null,
        list.length > 1 ? h('p', { class: 'meta' }, `${list.length - 1} more to answer after this`) : null),
      h('div', { class: 'rb-actions' },
        h('button', { class: 'btn primary', 'data-rb': 'taken', onclick: () => answer(d, 'taken') }, 'Taken'),
        h('button', { class: 'btn', 'data-rb': 'skipped', onclick: () => answer(d, 'skipped') }, 'Skipped'),
        r.hasMore ? h('button', { class: 'btn quiet', 'data-rb': 'later', onclick: () => { dismissed.set(r.id, Date.now()); tick(); } }, 'Remind me later') : null));
    requestAnimationFrame(() => document.documentElement.style.setProperty('--rb-h', `${host.getBoundingClientRect().height}px`));
    if (!watcher && window.ResizeObserver) {
      watcher = new ResizeObserver(() => { if (!host.hidden) document.documentElement.style.setProperty('--rb-h', `${host.getBoundingClientRect().height}px`); });
      watcher.observe(host);
    }
  };

  function tick() {
    if (!state.events) return;
    const now = Date.now();
    const list = activeReminders(state.events, state.key, now, { herNag: state.settings.nag, dismissed });
    const sig = list.map((r) => `${r.id}@${r.fireMs}`).join('|') + `|${state.settings.clock}|${state.view}`;
    if (sig === signature) return;
    signature = sig;
    draw(list);
    if (list.length && !chimed.has(`${list[0].id}@${list[0].fireMs}`)) chime();
    list.forEach((r) => chimed.add(`${r.id}@${r.fireMs}`));
  }

  return {
    start() {
      tick();
      setInterval(tick, 15000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    },
    tick,
  };
}
