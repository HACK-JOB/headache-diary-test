// Admin's rules for removing or undoing things: whether each action is allowed, and whether it asks for a reason.
export const ACTIONS = [
  { key: 'undo', label: 'Undo the last entry', what: 'The Undo button on the main page.' },
  { key: 'food', label: 'Remove a food or drink', what: 'Remove on the Eaten today list.' },
  { key: 'reading', label: 'Remove a glucose reading', what: 'Remove on a blood glucose reading.' },
  { key: 'dose', label: 'Undo a medicine answer', what: 'Undo on the Medicines card.' },
  { key: 'rxend', label: 'End a medicine', what: 'Ending a medicine in Doctors.' },
  { key: 'doctor', label: 'Remove a doctor', what: 'Remove in Doctor accounts.' },
];
const KEYS = new Set(ACTIONS.map((a) => a.key));

/** Stored in the diary log as a config entry, so it is dated and can be seen in the history. */
export const ruleEvent = (action, { allowed, reason }) =>
  KEYS.has(action) ? { type: 'config', kind: 'edit-rule', action, allowed: !!allowed, reason: !!reason } : null;

/** The latest rule for an action. Starting choice: allowed, with a reason asked. */
export function ruleFor(events, action) {
  let last = null;
  for (const e of events) if (!e.deleted && e.kind === 'edit-rule' && e.action === action && (!last || e.ms >= last.ms)) last = e;
  return last ? { allowed: last.allowed, reason: last.reason } : { allowed: true, reason: true };
}

/** What to do before an action: stop with a message, ask for a reason, or just confirm. */
export function gate(events, action) {
  const r = ruleFor(events, action);
  if (!r.allowed) return { ok: false, message: 'This has been turned off in Admin.' };
  return { ok: true, askReason: r.reason };
}

/** Stored where no reason was asked. */
export const NO_REASON = 'No reason asked';
