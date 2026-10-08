// "Which logs to track" screens. One builder serves three places: the user's Tracking tab, and a group inside Admin and inside Doctors.
// Admin beats Doctor, Doctor beats the user. A locked choice cannot be changed from below, and says who locked it.
import { LOGS, LEVELS, trackEvent, setting, resolve, lockMessage, userCanChange } from './tracking.js';

export function createTrackingUI(ctx) {
  const { h, state, log, reload, render, saveSettings, actor } = ctx;
  const note = { log: '', text: '' };      // the "locked by" line shown under the log that was tapped

  const mine = (k) => state.settings.track?.[k] ?? 'unset';
  const levelValue = (level, k) => (level === 'user' ? mine(k) : setting(state.events, level, k)?.value ?? 'unset');

  async function choose(level, k, value) {
    if (level === 'user') {
      const r = resolve(state.events, state.settings.track, k);
      if (!userCanChange(r)) { note.log = k; note.text = lockMessage(r); render(); return; }
      const t = { ...state.settings.track };
      if (value === 'unset') delete t[k]; else t[k] = value;
      note.log = ''; saveSettings({ track: t });
      return;
    }
    const ev = trackEvent(level, k, value, level === 'doctor' ? actor() : undefined);
    if (!ev) return;
    note.log = '';
    await log.add(ev); await reload(); render();
  }

  function row(level, l) {
    const r = resolve(state.events, state.settings.track, l.key);
    const cur = levelValue(level, l.key);
    const opts = level === 'user' ? [['on', 'Track'], ['off', 'Do not track']] : [['on', 'Track'], ['off', 'Do not track'], ['unset', 'Leave it to others']];
    const locked = level === 'user' && !userCanChange(r);
    const status = r.tracked ? 'Tracked' : 'Not tracked';
    const why = r.source === 'default' ? '' : r.source === 'user' ? ' · set by the user' : ` · set by ${r.source === 'admin' ? 'Admin' : r.locks[0].name}`;
    const hasRx = l.key === 'meds' && !r.tracked && state.events.some((e) => !e.deleted && e.type === 'clinical' && e.kind === 'rx');
    return h('div', { class: 'trk-row', 'data-log': l.key },
      h('div', { class: 'trk-info' }, h('strong', {}, l.label), h('span', { class: 'meta' }, ` · ${status}${why}`), h('p', { class: 'hint' }, l.what)),
      h('div', { class: 'seg', role: 'group', 'aria-label': `${l.label}: ${level === 'user' ? 'tracking' : level + ' setting'}` },
        ...opts.map(([v, t]) => h('button', { id: `trk-${level}-${l.key}-${v}`, 'aria-pressed': String(v === cur || (v === 'unset' && cur === 'unset' && level !== 'user')),
          ...(locked ? { 'aria-disabled': 'true', class: 'is-locked' } : {}), onclick: () => choose(level, l.key, v) }, t))),
      hasRx ? h('p', { class: 'warn-line', id: 'trk-meds-warn' }, h('span', { 'aria-hidden': 'true' }, '! '), 'A doctor has written prescriptions. Dose reminders and the Medicines card stay off while this is off.') : null,
      note.log === l.key && note.text ? h('p', { class: 'warn-line', role: 'alert', id: `trk-note-${l.key}` }, h('span', { 'aria-hidden': 'true' }, '! '), note.text) : null);
  }

  /** The three-level explanation and the list of logs, for one level. */
  function section(level) {
    const lv = LEVELS.find((x) => x.key === level);
    const who = { admin: 'Admin choices beat Doctor and User choices.', doctor: 'Doctor choices beat User choices. Admin choices still beat these.', user: 'Admin and Doctor choices cannot be changed here. A locked log says who locked it.' }[level];
    return h('div', { class: 'setting', id: `trk-${level}` }, h('h3', {}, level === 'user' ? 'Which logs to track' : `Tracking: ${lv.label} setting`),
      h('p', { class: 'hint' }, 'Turning a log off hides it and stops its reminders. Nothing already recorded is deleted, and doctors always see every entry. ' + who),
      h('div', { class: 'trk-list' }, ...LOGS.map((l) => row(level, l))));
  }
  return { section };
}
