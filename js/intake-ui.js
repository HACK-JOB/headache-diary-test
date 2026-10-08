// Meals and drinks screens: tiles on the main page, the entry form, today's intake list, and the Admin show/hide switches.
import { MEAL_TYPES, NUTRIENTS, perServing, validateIntake, myFoods, commonFoods, suggestFoods, dayIntake, visibility, visibleNutrients, visibilityEvent, visibilityLog } from './intake.js';
import { canonical } from './memory.js';
import { parseVolume } from './hydration.js';
import { msFromClock, clockValue, dayKey } from './time.js';

export function createIntakeUI(ctx) {
  const { h, state, log, reload, render, toast, time, icon, fmt } = ctx;
  const isDrink = (t) => t === 'Beverages';
  const unitOf = (k) => NUTRIENTS.find((n) => n.key === k).unit;

  function openForm(mealType) {
    state.draft = { mode: 'intake', mealType, name: '', servings: '1', amount: '', unit: 'ml', basis: 'serving', vals: {}, carried: {}, clock: clockValue(Date.now()), errors: [] };
    state.view = 'intake';
    render();
    window.scrollTo(0, 0);
  }

  /** Choosing a remembered food fills in what she saved before. Hidden nutrients are kept for the doctors but not shown. */
  function useFood(f) {
    const d = state.draft;
    d.name = f.name;
    d.servings = '1';
    d.basis = 'serving';
    const shown = new Set(visibleNutrients(state.events).map((n) => n.key));
    d.vals = {}; d.carried = {};
    for (const [k, v] of Object.entries(f.nutrition ?? {})) (shown.has(k) ? d.vals : d.carried)[k] = String(v);
    if (isDrink(d.mealType) && f.amountMl) { d.unit = f.amountMl >= 1000 && f.amountMl % 100 === 0 ? 'L' : 'ml'; d.amount = String(d.unit === 'L' ? f.amountMl / 1000 : f.amountMl); }
    d.errors = d.errors.filter((e) => e !== 'name');
    render();
  }

  async function save() {
    const d = state.draft;
    const servings = Number(String(d.servings).replace(',', '.'));
    const amountMl = isDrink(d.mealType) ? parseVolume(d.amount, d.unit) : undefined;
    const bad = validateIntake({ mealType: d.mealType, name: d.name, servings, amountMl });
    let nutrition = {};
    try { nutrition = perServing(d.vals, d.basis, servings); } catch (err) { d.numberError = err.message; bad.push('numbers'); }
    if (!bad.includes('numbers')) d.numberError = '';
    if (bad.length) { d.errors = bad; render(); document.getElementById('f-' + ({ numbers: 'nutrition', mealType: 'name' }[bad[0]] ?? bad[0]))?.scrollIntoView({ block: 'center' }); return; }
    const now = Date.now();
    const at = d.clock === clockValue(now) ? now : (msFromClock(dayKey(now), d.clock, now) ?? now);
    const carried = {};
    for (const [k, v] of Object.entries(d.carried)) if (!(k in nutrition)) carried[k] = Number(v);
    await log.add({ type: 'intake', kind: isDrink(d.mealType) ? 'drink' : 'food', mealType: d.mealType, name: canonical(d.name), servings, ...(amountMl ? { amountMl } : {}), nutrition: { ...carried, ...nutrition } }, at);
    await reload();
    state.view = 'main';
    render();
    if (state.settings.savedCue) toast(`Saved · ${canonical(d.name)}`);
  }

  async function removeItem(e) {
    const reason = await ctx.ask('Remove this entry?');
    if (!reason) return;
    await log.remove(e.id, reason);
    await reload();
    render();
    if (state.settings.savedCue) toast('Saved · entry removed');
  }

  /* ---------- the entry form ---------- */
  function renderForm() {
    const d = state.draft;
    const drink = isDrink(d.mealType);
    const nutrients = visibleNutrients(state.events);
    const bad = (k) => d.errors.includes(k);
    const common = commonFoods(state.events, d.mealType);
    const known = myFoods(state.events);
    const sugg = h('div', { class: 'sugg', id: 'food-sugg', role: 'listbox', 'aria-label': 'Matches from before' });
    const showSugg = (text) => sugg.replaceChildren(...suggestFoods(state.events, d.mealType, text).filter((f) => f.name.toLowerCase() !== canonical(text).toLowerCase()).slice(0, 5)
      .map((f) => h('button', { class: 'chip', role: 'option', onclick: () => useFood(f) }, f.name)));
    const num = (k, label, extra = {}) => h('div', { class: 'num-field' },
      h('label', { for: 'v-' + k }, label),
      h('input', { id: 'v-' + k, type: 'text', inputmode: 'decimal', class: 'text', autocomplete: 'off', value: d.vals[k] ?? '', ...extra,
        oninput: (ev) => { d.vals[k] = ev.target.value; d.errors = d.errors.filter((x) => x !== 'numbers'); } }));
    const seg = (label, key, opts) => h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
      ...opts.map(([v, t]) => h('button', { role: 'radio', 'aria-checked': String(d[key] === v), onclick: () => { d[key] = v; render(); } }, t)));

    return h('div', {},
      h('header', { class: 'topbar' }, h('div', { class: 'page-head' },
        h('button', { class: 'icon-btn', id: 'back', 'aria-label': 'Cancel and go back', onclick: () => { state.view = 'main'; render(); } }, icon('back')),
        h('h2', {}, d.mealType))),
      h('main', { class: 'form' },
        h('div', { class: 'top-row' },
          h('section', { class: 'panel field time-panel' },
            h('h2', {}, 'What time?'),
            h('div', { class: 'custom' },
              h('input', { id: 'clock', type: 'time', class: 'text', value: d.clock, 'aria-label': 'Time', onchange: (ev) => { d.clock = ev.target.value; } }),
              h('button', { class: 'btn quiet', type: 'button', onclick: () => { d.clock = clockValue(Date.now()); render(); } }, 'Now'))),
          h('section', { class: 'panel field' + (bad('name') ? ' has-error' : ''), id: 'f-name' },
            h('h2', {}, drink ? 'What did you drink?' : 'What did you eat?'),
            bad('name') ? h('p', { class: 'error', role: 'alert' }, 'Please type or choose one.') : null,
            common.length ? h('div', { class: 'seg wrap', role: 'group', 'aria-label': 'Most used here' },
              ...common.map((c) => h('button', { 'aria-pressed': String(canonical(d.name).toLowerCase() === c.toLowerCase()), onclick: () => useFood(known.find((f) => f.name === c)) }, c))) : h('p', { class: 'hint' }, 'Type it below. It will be remembered for next time.'),
            h('input', { id: 'in-name', type: 'text', class: 'text', autocomplete: 'off', placeholder: drink ? 'e.g. Tea with milk' : 'e.g. Chicken soup', value: d.name,
              oninput: (ev) => { d.name = ev.target.value; d.errors = d.errors.filter((x) => x !== 'name'); showSugg(ev.target.value); } }),
            sugg)),
        h('div', { class: 'form-grid' },
          h('div', { class: 'form-col' },
            h('section', { class: 'panel field' + (bad('amount') || bad('servings') ? ' has-error' : ''), id: 'f-amount' },
              h('h2', {}, drink ? 'How much?' : 'How many servings?'),
              bad('amount') ? h('p', { class: 'error', role: 'alert' }, 'Please enter an amount, e.g. 250 ml.') : null,
              bad('servings') ? h('p', { class: 'error', role: 'alert' }, 'Please enter a number above 0.') : null,
              drink ? h('div', { class: 'custom' },
                h('input', { id: 'in-amount', type: 'text', inputmode: 'decimal', class: 'text', placeholder: 'e.g. 250', value: d.amount, 'aria-label': 'Amount', oninput: (ev) => { d.amount = ev.target.value; d.errors = d.errors.filter((x) => x !== 'amount'); } }),
                seg('Unit', 'unit', [['ml', 'ml'], ['L', 'L']])) : null,
              h('div', { class: 'custom' },
                h('label', { class: 'small-label', for: 'in-servings' }, drink ? 'How many of these?' : 'Servings'),
                h('input', { id: 'in-servings', type: 'text', inputmode: 'decimal', class: 'text', value: d.servings, oninput: (ev) => { d.servings = ev.target.value; d.errors = d.errors.filter((x) => x !== 'servings'); } })))),
          h('div', { class: 'form-col' },
            nutrients.length ? h('section', { class: 'panel field' + (bad('numbers') ? ' has-error' : ''), id: 'f-nutrition' },
              h('h2', {}, 'Nutrition', h('span', { class: 'opt' }, ' Optional')),
              bad('numbers') ? h('p', { class: 'error', role: 'alert' }, d.numberError) : null,
              h('p', { class: 'small-label' }, 'The numbers you are typing are:'),
              seg('Numbers are', 'basis', [['serving', 'Per serving'], ['total', 'For everything I had']]),
              h('div', { class: 'num-grid' }, ...nutrients.map((n) => num(n.key, `${n.label} (${n.unit})`))),
              h('p', { class: 'hint' }, 'Leave blank if you do not know. Saved with this food for next time.')) : null)),
        d.errors.length ? h('p', { class: 'error big-error', role: 'alert' }, 'A few things still need an answer. They are marked above.') : null,
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn quiet', onclick: () => { state.view = 'main'; render(); } }, 'Cancel'),
          h('button', { class: 'btn alert-btn save-act', id: 'save', onclick: save }, 'Save'))));
  }

  /* ---------- main page ---------- */
  function mainCard() {
    return h('section', { class: 'panel', 'aria-labelledby': 'meal-h' },
      h('h2', { id: 'meal-h' }, 'Food and drink'),
      h('div', { class: 'tiles' }, ...MEAL_TYPES.map((t) => h('button', { class: 'tile', id: 'tile-' + t.replace(/\s+/g, '-').toLowerCase(), onclick: () => openForm(t) }, t))));
  }

  function todayList() {
    const day = dayIntake(state.events, state.key);
    const shown = visibleNutrients(state.events);
    if (!day.items.length) return h('section', { class: 'panel', 'aria-labelledby': 'in-h' }, h('h2', { id: 'in-h' }, 'Eaten today'), h('p', { class: 'hint' }, 'Nothing logged yet today.'));
    const dtext = (e) => `${e.servings !== 1 ? `${e.servings} × ` : ''}${e.name}${e.amountMl ? ` · ${e.amountMl >= 1000 && e.amountMl % 100 === 0 ? e.amountMl / 1000 + ' L' : e.amountMl + ' ml'}` : ''}`;
    return h('section', { class: 'panel', 'aria-labelledby': 'in-h' },
      h('h2', { id: 'in-h' }, 'Eaten today'),
      h('ol', { class: 'act-list' }, ...day.items.map((e) => h('li', {},
        h('span', { class: 'act-time num' }, time(e.ms)),
        h('span', { class: 'act-what' }, h('strong', {}, e.mealType), ` · ${dtext(e)}`),
        h('button', { class: 'btn quiet small', 'aria-label': `Remove ${e.name}`, onclick: () => removeItem(e) }, 'Remove')))),
      shown.length ? h('div', { class: 'totals' },
        h('h3', {}, 'Totals so far'),
        h('dl', {}, ...shown.flatMap((n) => {
          const t = day.totals[n.key];
          return [h('dt', {}, n.label), h('dd', { class: 'num' }, t.known ? `${fmt(t.value)} ${n.unit}` : '–', t.known && t.known < t.of ? h('span', { class: 'hint' }, ` (${t.known} of ${t.of} entries had it)`) : null)];
        }))) : null,
      day.drinkMl ? h('p', { class: 'meta' }, `Drinks logged here: ${fmt(day.drinkMl)} ml (water refills are counted separately)`) : null);
  }

  /* ---------- Admin: what she can see ---------- */
  function adminSwitches() {
    const vis = visibility(state.events);
    const changes = visibilityLog(state.events).slice(0, 5);
    const flip = async (key, shown) => { await log.add(visibilityEvent(key, shown)); await reload(); render(); };
    return h('div', { class: 'setting' },
      h('h3', {}, 'What shows on her screens'),
      h('p', { class: 'hint' }, 'Hidden items are still saved, and doctors always see everything. Anything switched off disappears from the food form and the totals.'),
      h('div', { class: 'switch-list' }, ...NUTRIENTS.map((n) =>
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: vis[n.key], 'aria-label': `Show ${n.label}`, onchange: (ev) => flip(n.key, ev.target.checked) }), `${n.label} (${n.unit})`))),
      changes.length ? h('details', { class: 'changes' }, h('summary', {}, 'Recent changes'),
        h('ul', {}, ...changes.map((c) => h('li', {}, `${NUTRIENTS.find((n) => n.key === c.item)?.label}: ${c.shown ? 'shown' : 'hidden'} · ${time(c.ms)}`)))) : null);
  }

  return { renderForm, mainCard, todayList, adminSwitches, openForm };
}
