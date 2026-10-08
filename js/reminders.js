// Medicine reminders: when a banner should be showing. Pure logic, no screen code.
// Rules (agreed with Corey):
//  - nothing before WOKE UP (a reminder that was due while asleep appears when she wakes)
//  - a dose reminds when its time opens, then repeats by nag level, only while it is still "due"
//  - Gentle = once, Normal = at the start and 3 more times 10 minutes apart, Persistent = every 5 minutes
//  - nothing after the dose is answered, or once it is Overdue (it then just shows as Overdue)
//  - "Remind me later" hides the banner until the next scheduled reminder
//  - a doctor-fixed level for a medicine beats her own level
import { dosesFor, NAGS, effectiveNag } from './prescriptions.js';
import { dayPhase } from './day.js';

const MIN = 60000;

/** Every moment this dose should remind, in order. */
export function fireTimes(d, nag) {
  const n = NAGS[nag] ?? NAGS.normal;
  const out = [d.startMs];
  if (!n.gapMin) return out;
  for (let k = 1; k <= n.repeats; k++) {
    const t = d.startMs + k * n.gapMin * MIN;
    if (t > d.endMs) break;
    out.push(t);
  }
  return out;
}

/**
 * Reminders showing right now, soonest first.
 * dismissed: Map of reminder id -> time "Remind me later" was tapped.
 */
export function activeReminders(events, key, now, { herNag = 'normal', dismissed = new Map() } = {}) {
  if (dayPhase(events) === 'asleep') return [];
  const out = [];
  for (const d of dosesFor(events, key, now)) {
    if (d.state !== 'due') continue;
    const nag = effectiveNag({ nag: d.nag }, herNag);
    const fires = fireTimes(d, nag);
    const past = fires.filter((t) => t <= now);
    if (!past.length) continue;
    const fireMs = past[past.length - 1];
    const id = `${d.rxId}#${d.slot}#${key}`;
    if ((dismissed.get(id) ?? -Infinity) >= fireMs) continue;
    out.push({ id, dose: d, nag, fixed: !!d.nag, fireMs, hasMore: fires.some((t) => t > now) });
  }
  return out.sort((a, b) => a.dose.startMs - b.dose.startMs || a.dose.name.localeCompare(b.dose.name));
}
