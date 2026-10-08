import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanBarcode, offUrl, fromOff, tidyName, provenance, sourceNote, findByBarcode, scanMessage } from '../js/barcode.js';
import { myFoods } from '../js/intake.js';

const fx = (c) => JSON.parse(readFileSync(new URL(`./fixtures/off-${c}.json`, import.meta.url)));

test('only real barcodes pass: right length and a correct check digit', () => {
  assert.equal(cleanBarcode('9310645467023'), '9310645467023');
  assert.equal(cleanBarcode(' 9310 6454 67023 '), '9310645467023');
  assert.equal(cleanBarcode('9310645204741'), '9310645204741');
  assert.equal(cleanBarcode('9310645467024'), '');      // wrong check digit
  assert.equal(cleanBarcode('12345'), '');
  assert.equal(cleanBarcode('abc'), '');
  assert.equal(cleanBarcode(''), '');
  assert.equal(cleanBarcode(null), '');
  assert.equal(cleanBarcode('96385074'), '96385074');   // 8-digit EAN
  assert.equal(cleanBarcode('036000291452'), '036000291452');   // 12-digit UPC-A
});

test('the lookup address carries only the number and asks for few fields', () => {
  const u = offUrl('9310645467023');
  assert.match(u, /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/9310645467023\.json\?fields=/);
  assert.ok(!/health|diary|weight/i.test(u));
});

test('Coles Thai curry: every number matches the printed label', () => {
  const r = fromOff(fx('9310645467023'));
  assert.equal(r.found, true);
  assert.equal(r.name, 'Thai Red Chicken Curry & Rice');
  assert.equal(r.basis, 'serving');
  assert.equal(r.servingText, '1 portion (350 g)');
  assert.deepEqual(r.nutrition, { calories: 400, carbs: 52.2, sugar: 5.3, fibre: 1, protein: 23.1, fat: 10.5, satFat: 7, transFat: 1, sodium: 665 });
});

test('Coles Singapore noodles: matches the label, unlisted values stay blank not zero', () => {
  const r = fromOff(fx('9310645204741'));
  assert.deepEqual(r.nutrition, { calories: 462, carbs: 47.6, sugar: 2.5, fibre: 3.2, protein: 25.6, fat: 17.9, satFat: 8.1, sodium: 455 });
  assert.ok(!('transFat' in r.nutrition) && !('iron' in r.nutrition) && !('caffeine' in r.nutrition));
});

test('sodium and iron arrive in grams and become milligrams, rounded', () => {
  const r = fromOff({ status: 1, product: { product_name: 'X', serving_quantity: 100, nutriments: { sodium_serving: 0.4551234, iron_serving: 0.0024 } } });
  assert.equal(r.nutrition.sodium, 455.12);
  assert.equal(r.nutrition.iron, 2.4);
});

test('a zero for iron or caffeine means "not declared", so it is left blank; a real zero sugar is kept', () => {
  const r = fromOff({ status: 1, product: { product_name: 'X', serving_quantity: 50, nutriments: { iron_serving: 0, caffeine_serving: 0, sugars_serving: 0 } } });
  assert.ok(!('iron' in r.nutrition) && !('caffeine' in r.nutrition));
  assert.equal(r.nutrition.sugar, 0);
});

test('with only per-100 g values and a known serving weight, the serving is worked out and rounded', () => {
  const r = fromOff({ status: 1, product: { product_name: 'Soup', serving_quantity: 250, nutriments: { 'energy-kcal_100g': 42.4, proteins_100g: 3.2 } } });
  assert.equal(r.basis, 'serving');
  assert.deepEqual(r.nutrition, { calories: 106, protein: 8 });
});

test('with only per-100 g values and no serving weight, nothing is guessed', () => {
  const r = fromOff({ status: 1, product: { product_name: 'Soup', nutriments: { 'energy-kcal_100g': 42, proteins_100g: 3 } } });
  assert.equal(r.found, true);
  assert.deepEqual(r.nutrition, {});
  assert.equal(r.basis, 'none');
});

test('nonsense values are dropped: negative, not a number, or absurdly large', () => {
  const r = fromOff({ status: 1, product: { product_name: 'X', serving_quantity: 100, nutriments: { fat_serving: -3, proteins_serving: 'lots', 'energy-kcal_serving': 99999, carbohydrates_serving: 12 } } });
  assert.deepEqual(r.nutrition, { carbs: 12 });
});

test('unknown product, or a record with no name', () => {
  assert.deepEqual(fromOff({ status: 0 }), { found: false });
  assert.deepEqual(fromOff(null), { found: false });
  const r = fromOff({ status: 1, product: { nutriments: { fat_serving: 1 } } });
  assert.equal(r.found, true);
  assert.equal(r.name, '');
});

test('all-capital names are tidied, mixed-case names are left alone', () => {
  assert.equal(tidyName('THAI RED CHICKEN CURRY & RICE'), 'Thai Red Chicken Curry & Rice');
  assert.equal(tidyName('Chicken singapore noodles'), 'Chicken singapore noodles');
  assert.equal(tidyName('  extra   spaces '), 'extra spaces');
  assert.equal(tidyName(undefined), '');
});

test('the log records where the numbers came from; typed meals carry nothing extra', () => {
  assert.deepEqual(provenance({}), {});
  assert.deepEqual(provenance({ barcode: '9310645467023', scanned: { calories: 400 }, nutrition: { calories: 400 } }), { source: 'barcode', barcode: '9310645467023', edited: false });
  assert.equal(provenance({ barcode: '9310645467023', scanned: { calories: 400 }, nutrition: { calories: 450 } }).edited, true);
  assert.equal(provenance({ barcode: '9310645467023', scanned: { calories: 400 }, nutrition: { calories: 400, iron: 2 } }).edited, true);
});

test('a barcode that was not found is remembered for next time but is not labelled as scanned numbers', () => {
  assert.deepEqual(provenance({ barcode: '9310645467023', scanned: {}, nutrition: { calories: 400 } }), { barcode: '9310645467023' });
  assert.equal(sourceNote({ barcode: '9310645467023' }), '');
});

test('the doctor-side note says it plainly', () => {
  assert.equal(sourceNote({}), '');
  assert.equal(sourceNote({ source: 'barcode', barcode: '9310645467023', edited: false }), 'From barcode 9310645467023');
  assert.equal(sourceNote({ source: 'barcode', barcode: '9310645467023', edited: true }), 'From barcode 9310645467023, values changed after scanning');
});

test('a food she has saved before is found by its barcode, before any internet lookup', () => {
  const ev = (o, ms) => ({ id: String(ms), type: 'intake', ms, mealType: 'Dinner', kind: 'food', servings: 1, ...o });
  const events = [
    ev({ name: 'Curry', nutrition: { calories: 400 }, barcode: '9310645467023', source: 'barcode' }, 1),
    ev({ name: 'Curry', nutrition: { calories: 410 } }, 2),         // later typed entry must not lose the barcode link
    ev({ name: 'Toast', nutrition: {} }, 3),
  ];
  const hit = findByBarcode(events, '9310645467023');
  assert.equal(hit.name, 'Curry');
  assert.equal(hit.nutrition.calories, 410);
  assert.equal(findByBarcode(events, '9310645204741'), null);
  assert.equal(myFoods(events).find((f) => f.name === 'Toast').barcode, undefined);
});

test('plain messages for each outcome, impersonal and with no advice', () => {
  for (const k of ['notfound', 'offline', 'badcode', 'nocamera', 'denied', 'busy', 'nonumbers', 'per100', 'found']) {
    const m = scanMessage(k);
    assert.ok(m.length > 10, k);
    assert.ok(!/\b(you|your|should|must)\b/i.test(m), `${k}: ${m}`);
  }
});

/* ---------- barcode + printed number cross-check ---------- */
import { printedNumbers, sameCode, scanDecision, checkNote, GRACE_MS } from '../js/barcode.js';

test('printedNumbers finds valid codes in text read from the pack, ignoring spaces and other words', () => {
  assert.deepEqual(printedNumbers(['9 310645 467023']), ['9310645467023']);
  assert.deepEqual(printedNumbers(['Barcode 9310645204741 here', 'Coles Chicken']), ['9310645204741']);
  assert.deepEqual(printedNumbers(['9310645467024']), []);                 // wrong check digit
  assert.deepEqual(printedNumbers(['350 g', 'Best before 12 05 2027']), []);
  assert.deepEqual(printedNumbers(['9 310645 467023', '9310645467023']), ['9310645467023']); // no repeats
  assert.deepEqual(printedNumbers([]), []);
  assert.deepEqual(printedNumbers(undefined), []);
});

test('sameCode ignores the leading zero a 12-digit UPC-A gets as an EAN-13', () => {
  assert.equal(sameCode('9310645467023', '9310645467023'), true);
  assert.equal(sameCode('012345678905', '0012345678905'), true);
  assert.equal(sameCode('9310645467023', '9310645204741'), false);
  assert.equal(sameCode('', '9310645467023'), false);
});

test('scanDecision: both read and equal finishes at once, as verified', () => {
  const d = scanDecision({ barcodes: ['9310645467023'], numbers: ['9310645467023'], ocr: true, waitedMs: 0 });
  assert.deepEqual([d.done, d.kind, d.code], [true, 'both', '9310645467023']);
});

test('scanDecision: with no digit reader on the tablet, a barcode alone finishes at once as barcode-only', () => {
  const d = scanDecision({ barcodes: ['9310645467023'], numbers: [], ocr: false, waitedMs: 0 });
  assert.deepEqual([d.done, d.kind], [true, 'barcode']);
});

test('scanDecision: one read, the other still being looked for, waits for the grace time then finishes', () => {
  assert.equal(scanDecision({ barcodes: ['9310645467023'], numbers: [], ocr: true, waitedMs: 500 }).done, false);
  const b = scanDecision({ barcodes: ['9310645467023'], numbers: [], ocr: true, waitedMs: GRACE_MS });
  assert.deepEqual([b.done, b.kind, b.code], [true, 'barcode', '9310645467023']);
  assert.equal(scanDecision({ barcodes: [], numbers: ['9310645467023'], ocr: true, waitedMs: 1000 }).done, false);
  const n = scanDecision({ barcodes: [], numbers: ['9310645467023'], ocr: true, waitedMs: GRACE_MS });
  assert.deepEqual([n.done, n.kind, n.code], [true, 'number', '9310645467023']);
});

test('scanDecision: a barcode and a different printed number is a mismatch after the grace time, using the barcode', () => {
  assert.equal(scanDecision({ barcodes: ['9310645467023'], numbers: ['9310645204741'], ocr: true, waitedMs: 800 }).done, false);
  const d = scanDecision({ barcodes: ['9310645467023'], numbers: ['9310645204741'], ocr: true, waitedMs: GRACE_MS });
  assert.deepEqual([d.done, d.kind, d.code], [true, 'mismatch', '9310645467023']);
});

test('scanDecision: a matching number among several read is still a match', () => {
  const d = scanDecision({ barcodes: ['9310645467023'], numbers: ['9310645204741', '9310645467023'], ocr: true, waitedMs: 0 });
  assert.equal(d.kind, 'both');
});

test('scanDecision: nothing read yet keeps waiting', () => {
  assert.equal(scanDecision({ barcodes: [], numbers: [], ocr: true, waitedMs: 99999 }).done, false);
});

test('checkNote gives neutral wording for each outcome, and only a match is a plain tick', () => {
  const k = ['both', 'barcode', 'number', 'typed', 'mismatch'];
  for (const x of k) { assert.ok(checkNote(x).text.length > 10, x); assert.ok(!/\b(you|your)\b/i.test(checkNote(x).text), x); }
  assert.equal(checkNote('both').ok, true);
  for (const x of ['barcode', 'number', 'typed', 'mismatch']) assert.equal(checkNote(x).ok, false, x);
  assert.match(checkNote('barcode').text, /product matches/i);
  assert.match(checkNote('number').text, /product matches/i);
  assert.match(checkNote('typed').text, /product matches/i);
  assert.match(checkNote('mismatch').text, /do not match/i);
  assert.equal(checkNote('nope').text, '');
});
