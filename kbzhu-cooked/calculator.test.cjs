'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDecimal, calculateNutrition, formatNumber } = require('./calculator.js');
const base = { calories: 350, protein: 12.5, fat: 1.5, carbs: 72, rawWeight: 100, cookedWeight: 250 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${actual} ≈ ${expected}`);

test('accepts decimal comma and dot without coercing malformed input', () => {
  assert.equal(parseDecimal(' 12,5 '), 12.5);
  assert.equal(parseDecimal('.5'), 0.5);
  assert.equal(parseDecimal('0'), 0);
  for (const value of ['', ' ', '12kg', '1,2.3', '1 000', 'NaN', 'Infinity', '1e3', null, true, {}, Infinity]) assert.equal(parseDecimal(value), null);
});
test('increased cooked weight dilutes per100 and preserves batch nutrition', () => {
  const result = calculateNutrition(base);
  near(result.per100.calories, 140);
  near(result.per100.protein, 5);
  near(result.total.calories, 350);
  near(result.factor, 2.5);
  assert.deepEqual(result.portion, result.per100);
});
test('decreased or unchanged weight gives expected concentration', () => {
  near(calculateNutrition({ ...base, cookedWeight: 50 }).per100.calories, 700);
  assert.deepEqual(calculateNutrition({ ...base, cookedWeight: 100 }).per100, { calories: 350, protein: 12.5, fat: 1.5, carbs: 72 });
});
test('comma input and portion scaling work with arbitrary batch size', () => {
  const result = calculateNutrition({ ...base, protein: '12,5', rawWeight: '200', cookedWeight: '500', portionWeight: '125,5' });
  near(result.total.calories, 700);
  near(result.portion.calories, 175.7);
  near(result.portion.protein, 6.275);
  assert.equal(calculateNutrition({ ...base, portionWeight: null }).portion, null);
});
test('zero nutrients are valid without imposing combined macro restrictions', () => {
  const zero = calculateNutrition({ ...base, calories: 0, protein: 0, fat: 0, carbs: 0 });
  assert.deepEqual(zero.per100, { calories: 0, protein: 0, fat: 0, carbs: 0 });
  assert.doesNotThrow(() => calculateNutrition({ ...base, protein: 100, fat: 100, carbs: 100 }));
});
test('missing, negative, malformed, zero weights and excessive values fail', () => {
  for (const key of ['calories', 'protein', 'fat', 'carbs', 'rawWeight', 'cookedWeight']) {
    for (const value of ['', '-1', 'oops', Infinity]) assert.throws(() => calculateNutrition({ ...base, [key]: value }), RangeError);
  }
  for (const key of ['rawWeight', 'cookedWeight', 'portionWeight']) {
    for (const value of [0, 10000001]) assert.throws(() => calculateNutrition({ ...base, [key]: value }), RangeError);
  }
  assert.throws(() => calculateNutrition({ ...base, calories: 100001 }), RangeError);
  assert.throws(() => calculateNutrition({ ...base, calories: undefined }), RangeError);
});
test('tiny and large values remain finite and tiny values remain visible', () => {
  const tiny = calculateNutrition({ ...base, calories: 0.001, rawWeight: 0.001, cookedWeight: 10000 });
  near(tiny.per100.calories, 1e-10);
  assert.equal(formatNumber(tiny.per100.calories), '< 0,001');
  const large = calculateNutrition({ calories: 100000, protein: 100000, fat: 100000, carbs: 100000, rawWeight: 10000000, cookedWeight: 0.001, portionWeight: 10000000 });
  assert.ok(Number.isFinite(large.portion.calories));
  near(large.total.calories, 1e10);
  assert.throws(() => calculateNutrition({ ...base, cookedWeight: Number.MIN_VALUE }), RangeError);
});
