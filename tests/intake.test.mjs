import test from 'node:test';
import assert from 'node:assert/strict';
import { MEAL_TYPES, NUTRIENTS, perServing, validateIntake, myFoods, commonFoods, suggestFoods, dayIntake, visibility, visibleNutrients, visibilityLog, visibilityEvent } from '../js/intake.js';

const bne = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 10, mi);
let n = 0;
const eat = (ms, name, mealType = 'Lunch', extra = {}) => ({ id: 'i' + ++n, type: 'intake', ms, seq: n, kind: 'food', mealType, name, servings: 1, nutrition: {}, ...extra });

test('there are eight meal tiles in the order she asked for, and eight nutrients', () => {
  assert.deepEqual(MEAL_TYPES, ['Breakfast', 'Morning Tea', 'Lunch', 'Afternoon Tea', 'Dinner', 'Dessert', 'Snack', 'Beverages']);
  assert.deepEqual(NUTRIENTS.map((x) => x.key), ['calories', 'carbs', 'sugar', 'protein', 'fat', 'transFat', 'iron', 'caffeine']);
});

test('perServing: per-serving values pass through, totals are divided by servings, blanks are dropped', () => {
  assert.deepEqual(perServing({ iron: '2', carbs: '' }, 'serving', 2), { iron: 2 });
  assert.deepEqual(perServing({ iron: '4', calories: '300' }, 'total', 2), { iron: 2, calories: 150 });
  assert.deepEqual(perServing({ iron: '0' }, 'serving', 1), { iron: 0 });
});

test('perServing rejects nonsense with an error list, never a silent guess', () => {
  assert.throws(() => perServing({ iron: 'abc' }, 'serving', 1), /iron/);
  assert.throws(() => perServing({ iron: '-1' }, 'serving', 1), /iron/);
});

test('validateIntake: needs a tile and a name; drinks need an amount; servings must be above zero', () => {
  assert.deepEqual(validateIntake({}), ['mealType', 'name']);
  assert.deepEqual(validateIntake({ mealType: 'Lunch', name: 'Soup', servings: 0 }), ['servings']);
  assert.deepEqual(validateIntake({ mealType: 'Beverages', name: 'Tea', servings: 1 }), ['amount']);
  assert.deepEqual(validateIntake({ mealType: 'Beverages', name: 'Tea', servings: 1, amountMl: 250 }), []);
  assert.deepEqual(validateIntake({ mealType: 'Lunch', name: ' Soup ', servings: 1.5 }), []);
});

test('myFoods: the latest entry per name wins, spelling follows her latest use', () => {
  const t = bne(2026, 10, 8, 8);
  const evs = [eat(t, 'oats', 'Breakfast', { nutrition: { iron: 1 } }), eat(t + 1, 'Oats', 'Breakfast', { nutrition: { iron: 2 } })];
  const foods = myFoods(evs);
  assert.equal(foods.length, 1);
  assert.equal(foods[0].name, 'Oats');
  assert.deepEqual(foods[0].nutrition, { iron: 2 });
  assert.equal(foods[0].count, 2);
});

test('myFoods ignores deleted entries and other event types', () => {
  const t = bne(2026, 10, 8, 8);
  assert.deepEqual(myFoods([eat(t, 'Toast', 'Breakfast', { deleted: true }), { type: 'water', ms: t }]), []);
});

test('commonFoods: top 5 for that tile by count; nothing is preset', () => {
  const t = bne(2026, 10, 8, 8);
  const evs = [eat(t, 'Toast', 'Breakfast'), eat(t + 1, 'Toast', 'Breakfast'), eat(t + 2, 'Eggs', 'Breakfast'), eat(t + 3, 'Soup', 'Lunch')];
  assert.deepEqual(commonFoods(evs, 'Breakfast'), ['Toast', 'Eggs']);
  assert.deepEqual(commonFoods(evs, 'Dinner'), []);
  assert.deepEqual(commonFoods([], 'Lunch'), []);
});

test('suggestFoods: matches typed text, same tile first, then others', () => {
  const t = bne(2026, 10, 8, 8);
  const evs = [eat(t, 'Chicken soup', 'Lunch'), eat(t + 1, 'Chicken curry', 'Dinner'), eat(t + 2, 'Chicken curry', 'Dinner'), eat(t + 3, 'Toast', 'Breakfast')];
  assert.deepEqual(suggestFoods(evs, 'Lunch', 'chick').map((f) => f.name), ['Chicken soup', 'Chicken curry']);
  assert.deepEqual(suggestFoods(evs, 'Dinner', 'chick').map((f) => f.name), ['Chicken curry', 'Chicken soup']);
  assert.deepEqual(suggestFoods(evs, 'Dinner', ''), []);
});

test('dayIntake: scales per-serving values by servings and totals them for the day', () => {
  const evs = [
    eat(bne(2026, 10, 8, 8), 'Oats', 'Breakfast', { servings: 2, nutrition: { iron: 2, calories: 150 } }),
    eat(bne(2026, 10, 8, 12), 'Soup', 'Lunch', { servings: 1, nutrition: { iron: 1 } }),
    eat(bne(2026, 10, 7, 12), 'Yesterday', 'Lunch', { nutrition: { iron: 9 } }),
  ];
  const d = dayIntake(evs, '2026-10-08');
  assert.equal(d.items.length, 2);
  assert.equal(d.totals.iron.value, 5);
  assert.equal(d.totals.calories.value, 300);
});

test('dayIntake is honest about gaps: it counts how many entries had each value', () => {
  const evs = [eat(bne(2026, 10, 8, 8), 'Oats', 'Breakfast', { nutrition: { iron: 2 } }), eat(bne(2026, 10, 8, 12), 'Soup', 'Lunch', { nutrition: {} })];
  const d = dayIntake(evs, '2026-10-08');
  assert.deepEqual([d.totals.iron.known, d.totals.iron.of], [1, 2]);
  assert.equal(d.totals.calories.known, 0);
});

test('dayIntake: drinks add up as fluid ml; foods do not', () => {
  const evs = [
    eat(bne(2026, 10, 8, 8), 'Tea', 'Beverages', { kind: 'drink', amountMl: 250, servings: 2 }),
    eat(bne(2026, 10, 8, 9), 'Toast', 'Breakfast'),
  ];
  assert.equal(dayIntake(evs, '2026-10-08').drinkMl, 500);
});

test('visibility: everything is shown until a switch says otherwise', () => {
  assert.equal(visibleNutrients([]).length, 8);
  assert.deepEqual(visibility([]).calories, true);
});

test('visibility: the latest switch event wins, and it can be switched back on', () => {
  const t = bne(2026, 10, 8, 8);
  const off = { ...visibilityEvent('calories', false), ms: t, seq: 1, id: 'c1' };
  const on = { ...visibilityEvent('calories', true), ms: t + 1, seq: 2, id: 'c2' };
  assert.equal(visibility([off]).calories, false);
  assert.equal(visibleNutrients([off]).some((x) => x.key === 'calories'), false);
  assert.equal(visibility([off, on]).calories, true);
});

test('visibilityEvent refuses an unknown item', () => {
  assert.throws(() => visibilityEvent('weightLoss', false), /Unknown/);
});

test('visibilityLog lists changes newest first', () => {
  const evs = [{ ...visibilityEvent('iron', false), ms: 1, seq: 1, id: 'a' }, { ...visibilityEvent('iron', true), ms: 2, seq: 2, id: 'b' }];
  assert.deepEqual(visibilityLog(evs).map((x) => [x.item, x.shown]), [['iron', true], ['iron', false]]);
});
