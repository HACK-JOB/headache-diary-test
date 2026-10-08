import test from 'node:test';
import assert from 'node:assert/strict';
import { pickGroup, moveGroup, groupsWithContent, sideTabs } from '../js/sidetabs.js';

const G = [{ key: 'a', label: 'Alpha', nodes: ['x'] }, { key: 'b', label: 'Beta', nodes: ['y'] }, { key: 'c', label: 'Gamma', nodes: [] }, { key: 'd', label: 'Delta', nodes: [null] }];

test('groups with nothing to show are left out', () => {
  assert.deepEqual(groupsWithContent(G).map((g) => g.key), ['a', 'b']);
});

test('the open group is the chosen one, or the first when the choice is missing or gone', () => {
  const g = groupsWithContent(G);
  assert.equal(pickGroup(g, 'b'), 'b');
  assert.equal(pickGroup(g, 'zzz'), 'a');
  assert.equal(pickGroup(g, undefined), 'a');
  assert.equal(pickGroup(g, 'c'), 'a');          // an empty group is not offered
  assert.equal(pickGroup([], 'a'), '');
});

test('arrow keys move between groups and wrap round; Home and End jump', () => {
  const g = groupsWithContent(G);
  assert.equal(moveGroup(g, 'a', 'ArrowDown'), 'b');
  assert.equal(moveGroup(g, 'b', 'ArrowDown'), 'a');
  assert.equal(moveGroup(g, 'a', 'ArrowUp'), 'b');
  assert.equal(moveGroup(g, 'a', 'End'), 'b');
  assert.equal(moveGroup(g, 'b', 'Home'), 'a');
  assert.equal(moveGroup(g, 'a', 'x'), null);
});

// a tiny stand-in for the app's element builder, so the structure can be checked without a browser
const fake = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids: kids.flat().filter((k) => k != null) });
const find = (n, f, out = []) => { if (n && typeof n === 'object') { if (f(n)) out.push(n); (n.kids || []).forEach((k) => find(k, f, out)); } return out; };

test('the side tab list has one button per group, the open one marked selected and ticked', () => {
  const t = sideTabs(fake, { id: 'adm', label: 'Admin sections', groups: G, active: 'b', onPick: () => {} });
  const tabs = find(t, (n) => n.attrs.role === 'tab');
  assert.equal(tabs.length, 2);
  assert.deepEqual(tabs.map((b) => b.attrs['aria-selected']), ['false', 'true']);
  assert.ok(JSON.stringify(tabs[1]).includes('✓'));          // not colour alone
  assert.ok(!JSON.stringify(tabs[0]).includes('✓'));
  assert.equal(find(t, (n) => n.attrs.role === 'tablist')[0].attrs['aria-orientation'], 'vertical');
});

test('only the open group is shown in the panel, and the panel is tied to its tab', () => {
  const t = sideTabs(fake, { id: 'adm', label: 'Admin sections', groups: G, active: 'b', onPick: () => {} });
  const panel = find(t, (n) => n.attrs.role === 'tabpanel')[0];
  assert.deepEqual(panel.kids, ['y']);
  assert.equal(panel.attrs['aria-labelledby'], 'st-adm-b');
  assert.equal(find(t, (n) => n.attrs.id === 'st-adm-b')[0].attrs['aria-controls'], panel.attrs.id);
});

test('tapping a tab reports its key; roving tab index keeps one stop in the list', () => {
  const picked = [];
  const t = sideTabs(fake, { id: 'adm', label: 'x', groups: G, active: 'a', onPick: (k) => picked.push(k) });
  const tabs = find(t, (n) => n.attrs.role === 'tab');
  tabs[1].attrs.onclick();
  assert.deepEqual(picked, ['b']);
  assert.deepEqual(tabs.map((b) => b.attrs.tabindex), ['0', '-1']);
  tabs[0].attrs.onkeydown({ key: 'ArrowDown', preventDefault() {} });
  assert.deepEqual(picked, ['b', 'b']);
});

test('nothing to show means no side tabs at all', () => {
  assert.equal(sideTabs(fake, { id: 'adm', label: 'x', groups: [G[2]], active: 'c', onPick: () => {} }), null);
});
