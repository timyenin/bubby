import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateBMR,
  calculateCalorieFloor,
  calculateMacroTargets,
  calculateTDEE,
  calculateWeightLossRate,
  isUnderCalorieFloor,
} from './macros.js';

test('calculateBMR uses Mifflin-St Jeor for Tim reference values', () => {
  assert.equal(
    calculateBMR({
      weightLbs: 165,
      heightInches: 72,
      age: 22,
      sex: 'male',
    }),
    1786,
  );
});

test('calculateBMR supports female Mifflin-St Jeor offset', () => {
  assert.equal(
    calculateBMR({
      weightLbs: 165,
      heightInches: 72,
      age: 22,
      sex: 'female',
    }),
    1620,
  );
});

test('calculateTDEE applies supported activity multipliers', () => {
  assert.equal(calculateTDEE(1800, 'sedentary'), 2520);
  assert.equal(calculateTDEE(1800, 'moderate'), 2790);
  assert.equal(calculateTDEE(1800, 'active'), 3060);
  assert.equal(calculateTDEE(1800, 1.6), 2880);
});

test('calculateCalorieFloor never returns below 1500', () => {
  assert.equal(calculateCalorieFloor(1200), 1500);
  assert.equal(calculateCalorieFloor(1800), 1980);
});

test('calculateMacroTargets returns sane rest and workout targets', () => {
  const restDay = calculateMacroTargets({
    weightLbs: 165,
    heightInches: 72,
    age: 22,
    activityFactor: 'moderate',
    isWorkoutDay: false,
  });
  const workoutDay = calculateMacroTargets({
    weightLbs: 165,
    heightInches: 72,
    age: 22,
    activityFactor: 'moderate',
    isWorkoutDay: true,
  });

  assert.deepEqual(Object.keys(restDay), [
    'calories',
    'protein_g',
    'carbs_g',
    'fat_g',
  ]);
  assert.equal(restDay.protein_g, 165);
  assert.ok(restDay.fat_g >= 40);
  assert.ok(restDay.carbs_g > 0);
  assert.equal(workoutDay.calories - restDay.calories, 175);
});

test('calculateWeightLossRate compares latest 7 days with prior 7 days', () => {
  const history = [
    180, 179.8, 179.7, 179.5, 179.2, 179, 178.8,
    176.5, 176.2, 175.9, 175.5, 175.2, 174.8, 174.5,
  ].map((weight_lbs, index) => ({ date: `2026-04-${String(index + 1).padStart(2, '0')}`, weight_lbs }));

  assert.equal(calculateWeightLossRate(history), 2.18);
});

test('calculateWeightLossRate returns 0 without enough history', () => {
  assert.equal(calculateWeightLossRate([{ date: '2026-04-01', weight_lbs: 180 }]), 0);
});

test('isUnderCalorieFloor compares daily calories against the floor', () => {
  assert.equal(isUnderCalorieFloor({ calories: 1499 }, 1500), true);
  assert.equal(isUnderCalorieFloor({ calories: 1500 }, 1500), false);
  assert.equal(isUnderCalorieFloor(1499, 1500), true);
});
