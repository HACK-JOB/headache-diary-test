// A time picker that follows the 12/24-hour setting (the browser's own <input type="time"> ignores it).
// Three drop-downs are big, reliable tap targets on a tablet. value is "HH:MM" (24-hour) either way.
import { splitClock, joinClock } from './time.js';

export function clockPicker(h, { id, value, clock, onChange }) {
  const parts = splitClock(value, clock) ?? { h: null, m: null, ap: null };
  const hours = clock === '24' ? Array.from({ length: 24 }, (_, i) => i) : Array.from({ length: 12 }, (_, i) => i + 1);
  const pad = (n) => String(n).padStart(2, '0');
  const cur = { ...parts };
  const change = (key, raw) => {
    cur[key] = key === 'ap' ? raw : Number(raw);
    const v = joinClock(cur, clock);
    if (v) onChange(v);
  };
  const sel = (key, label, opts, shown) => h('select', { class: 'text clock-sel', 'aria-label': label, id: id + '-' + key, onchange: (ev) => change(key, ev.target.value) },
    ...opts.map(([v, t]) => h('option', { value: String(v), selected: String(v) === String(shown) }, t)));
  return h('div', { class: 'clock-picker', id, role: 'group', 'aria-label': 'Time' },
    sel('h', 'Hour', hours.map((x) => [x, clock === '24' ? pad(x) : String(x)]), parts.h),
    h('span', { class: 'clock-colon', 'aria-hidden': 'true' }, ':'),
    sel('m', 'Minute', Array.from({ length: 60 }, (_, i) => [i, pad(i)]), parts.m),
    clock === '24' ? null : sel('ap', 'am or pm', [['am', 'am'], ['pm', 'pm']], parts.ap));
}
