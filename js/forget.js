// "Forget" markers: saved foods and remembered notes are worked out from the logs, so forgetting them
// is a marker with a time. Entries older than the marker stop feeding the chips and suggestions;
// the logs themselves (and the doctors' totals) are untouched. Entering something again brings it back.
export function forgottenAt(events, what) {
  let t = 0;
  for (const e of events) if (e.type === 'config' && e.kind === 'forget' && e.what === what && e.ms > t) t = e.ms;
  return t;
}
