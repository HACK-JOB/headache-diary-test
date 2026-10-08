// Side tabs: a vertical list of groups on the left, the open group on the right, so a long tab does not need scrolling.
// Pure helpers plus one builder that takes the app's element function `h`, so it can be tested without a browser.

/** Groups that have something to show (null and empty entries do not count). */
export const groupsWithContent = (groups) => groups.filter((g) => (g.nodes || []).some((n) => n != null && n !== false));

/** The open group's key: the chosen one if it is offered, otherwise the first. '' when there is nothing. */
export function pickGroup(groups, chosen) {
  if (!groups.length) return '';
  return groups.some((g) => g.key === chosen) ? chosen : groups[0].key;
}

/** Key pressed on a tab -> the key of the group to open, or null when the key is not one we use. */
export function moveGroup(groups, current, key) {
  const i = Math.max(0, groups.findIndex((g) => g.key === current));
  if (key === 'ArrowDown' || key === 'ArrowRight') return groups[(i + 1) % groups.length].key;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return groups[(i - 1 + groups.length) % groups.length].key;
  if (key === 'Home') return groups[0].key;
  if (key === 'End') return groups[groups.length - 1].key;
  return null;
}

/** opts: { id, label, groups:[{key,label,nodes}], active, onPick(key) }. Returns null when no group has content. */
export function sideTabs(h, { id, label, groups, active, onPick }) {
  const shown = groupsWithContent(groups);
  if (!shown.length) return null;
  const open = pickGroup(shown, active);
  const cur = shown.find((g) => g.key === open);
  const panelId = `st-${id}-panel`;
  return h('div', { class: 'side-tabs', id: `st-${id}` },
    h('div', { class: 'side-list', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': label },
      ...shown.map((g) => {
        const on = g.key === open;
        return h('button', {
          class: 'side-tab', role: 'tab', type: 'button', id: `st-${id}-${g.key}`, 'aria-selected': String(on), 'aria-controls': panelId, tabindex: on ? '0' : '-1',
          onclick: () => onPick(g.key),
          onkeydown: (ev) => { const k = moveGroup(shown, open, ev.key); if (k) { ev.preventDefault(); onPick(k, true); } },
        }, on ? h('span', { class: 'side-tick', 'aria-hidden': 'true' }, '✓ ') : null, g.label);
      })),
    h('div', { class: 'side-body', role: 'tabpanel', id: panelId, 'aria-labelledby': `st-${id}-${cur.key}` }, ...cur.nodes.filter((n) => n != null && n !== false)));
}
