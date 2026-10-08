// The "Tester notes" tab in Options: a what-to-try checklist and a comments box.
// Saved on this tablet only (hd.tester). Leaves the tablet only through Share or Save as file.
import { CHECKLIST, ABOUT, normaliseTester, addNote, removeNote, setCheck, progress, shareText, noteFileName } from './tester.js';

const KEY = 'hd.tester';

export function createTesterUI(ctx) {
  const { h, render, toast, time } = ctx;
  const ui = { about: 'Main page', draft: '', info: '', error: '' };

  const load = () => { try { return normaliseTester(JSON.parse(localStorage.getItem(KEY))); } catch { return normaliseTester(null); } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { ui.error = 'This tablet could not save the notes.'; return false; } };

  function submit() {
    const before = load();
    const next = addNote(before, { text: ui.draft, about: ui.about });
    if (next === before) { ui.error = 'Please type a comment first.'; ui.info = ''; render(); return; }
    if (!save(next)) { render(); return; }
    ui.draft = ''; ui.error = ''; ui.info = 'Comment saved.';
    render();
    document.getElementById('tn-text')?.focus();
  }

  async function share() {
    const text = shareText(load());
    try {
      if (navigator.share) { await navigator.share({ title: 'Headache Diary tester notes', text }); ui.info = 'Shared.'; ui.error = ''; render(); return; }
    } catch (err) { if (err?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); ui.info = 'Sharing is not available here, so the notes were copied. Paste them into a message.'; ui.error = ''; }
    catch { ui.error = 'Sharing is not available here. Use Save as file instead.'; ui.info = ''; }
    render();
  }

  function file() {
    const url = URL.createObjectURL(new Blob([shareText(load())], { type: 'text/plain' }));
    const a = h('a', { href: url, download: noteFileName() });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    ui.info = 'Saved to the Downloads folder.'; ui.error = ''; render();
  }

  function panel() {
    const s = load();
    const p = progress(s);
    const groups = [...new Set(CHECKLIST.map((c) => c.group))];
    return h('section', { class: 'panel', id: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-tester' },
      h('h2', {}, 'Tester notes'),
      h('p', { class: 'hint' }, 'This is a test copy. Please use made-up details only, with no real health information.'),

      ctx.pastUpdates?.(),
      h('div', { class: 'setting' },
        h('h3', {}, 'What to try'),
        h('p', { class: 'meta', 'aria-live': 'polite' }, `${p.done} of ${p.total} done`),
        ...groups.map((g) => h('div', { class: 'tn-group', role: 'group', 'aria-label': g },
          h('h4', {}, g),
          ...CHECKLIST.filter((c) => c.group === g).map((c) =>
            h('label', { class: 'check' },
              h('input', { type: 'checkbox', id: 'tn-chk-' + c.id, checked: !!s.checks[c.id], onchange: (ev) => { save(setCheck(load(), c.id, ev.target.checked)); render(); } }),
              c.text))))),

      h('div', { class: 'setting' },
        h('h3', {}, 'Comments'),
        h('p', { class: 'hint' }, 'Anything confusing, hard to tap, too small, or missing. Plain words are fine.'),
        h('div', { class: 'num-field' },
          h('label', { for: 'tn-about' }, 'Which part is it about?'),
          h('select', { id: 'tn-about', onchange: (ev) => { ui.about = ev.target.value; } },
            ...ABOUT.map((a) => h('option', { value: a, selected: a === ui.about }, a)))),
        h('div', { class: 'num-field' },
          h('label', { for: 'tn-text' }, 'Comment'),
          h('textarea', { id: 'tn-text', class: 'text', rows: '4', maxlength: '1000', autocomplete: 'off', oninput: (ev) => { ui.draft = ev.target.value; } }, ui.draft)),
        ui.error ? h('p', { class: 'error', role: 'alert' }, ui.error) : null,
        ui.info ? h('p', { class: 'meta', role: 'status' }, ui.info) : null,
        h('button', { class: 'btn primary', id: 'tn-add', onclick: submit }, 'Save comment'),

        s.notes.length ? h('ul', { class: 'tn-notes' }, ...s.notes.map((n) =>
          h('li', {},
            h('p', { class: 'meta' }, `${new Date(n.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}, ${time(n.at)} · ${n.about}`),
            h('p', {}, n.text),
            h('button', { class: 'btn quiet small', 'aria-label': `Delete comment: ${n.text.slice(0, 40)}`, onclick: () => { save(removeNote(load(), n.at)); render(); } }, 'Delete')))) : h('p', { class: 'hint' }, 'No comments yet.')),

      h('div', { class: 'setting' },
        h('h3', {}, 'Send the notes'),
        h('p', { class: 'privacy', id: 'tn-privacy' }, h('strong', {}, 'Everything here stays on this tablet. '),
          'The ticks and comments are stored only on this tablet. Nobody else can see them, and nothing is sent anywhere unless Share or Save as file is used below. Nobody has access to them any other way.'),
        h('p', { class: 'hint' }, 'Only the checklist and the comments are sent. No diary entries are included.'),
        h('ol', { class: 'tn-how', id: 'tn-how' },
          h('li', {}, h('strong', {}, 'Share: '), 'opens the tablet\'s share list. Pick Messages, Email or another app, choose who to send it to, and send. The notes go in as plain text.'),
          h('li', {}, h('strong', {}, 'Save as file: '), 'saves a text file called tester-notes to the Downloads folder. Open the Files or Downloads app, then attach that file to a message or email.'),
          h('li', {}, 'Either way, nothing is sent until a person picks where it goes. Sending again later includes any newer comments.')),
        h('div', { class: 'two' },
          h('button', { class: 'btn primary', id: 'tn-share', onclick: share }, 'Share'),
          h('button', { class: 'btn', id: 'tn-file', onclick: file }, 'Save as file'))));
  }

  return { panel };
}
