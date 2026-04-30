// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOnboardingPlan,
  getOnboardingRoute,
  parseOnboardingCompleteAction,
  stripActionEnvelopes,
} from './onboarding.ts';

test('parseOnboardingCompleteAction extracts profile data from an action envelope', () => {
  const reply = [
    'okay. give me a sec.',
    '[ACTION]{"type":"onboarding_complete","data":{"profile":{"name":"Avery","age":30,"height_inches":70,"current_weight_lbs":180,"goal":"cut","activity_level":"moderate","training_schedule":{"monday":"push"},"pantry_items":["eggs","rice"],"work_food_access":"cafeteria","established_rules":["no peanuts"]}}}[/ACTION]',
  ].join('\n');

  const action = parseOnboardingCompleteAction(reply);

  assert.deepEqual(action.profile, {
    name: 'Avery',
    age: 30,
    height_inches: 70,
    current_weight_lbs: 180,
    goal: 'cut',
    activity_level: 'moderate',
    training_schedule: { monday: 'push' },
    pantry_items: ['eggs', 'rice'],
    work_food_access: 'cafeteria',
    established_rules: ['no peanuts'],
  });
});

test('stripActionEnvelopes removes action JSON from visible replies', () => {
  assert.equal(
    stripActionEnvelopes('okay.\n[ACTION]{"type":"onboarding_complete","data":{}}[/ACTION]'),
    'okay.',
  );
});

test('parseOnboardingCompleteAction returns null when no matching action exists', () => {
  assert.equal(parseOnboardingCompleteAction('still need your height.'), null);
  assert.equal(
    parseOnboardingCompleteAction('[ACTION]{"type":"log_meal","data":{}}[/ACTION]'),
    null,
  );
});

test('getOnboardingRoute chooses onboarding unless localStorage flag is true', () => {
  assert.equal(getOnboardingRoute(false), 'onboarding');
  assert.equal(getOnboardingRoute(null), 'onboarding');
  assert.equal(getOnboardingRoute(true), 'home');
});

test('buildOnboardingPlan creates profile, pantry, and macro targets', () => {
  const result = buildOnboardingPlan({
    name: 'Avery',
    preferred_name: null,
    age: 30,
    height_inches: 70,
    current_weight_lbs: 180,
    goal: 'cut',
    activity_level: 'moderate',
    training_schedule: { monday: 'push' },
    pantry_items: ['eggs', 'rice'],
    work_food_access: 'cafeteria',
    established_rules: ['no peanuts'],
  });

  assert.equal(result.profile.name, 'Avery');
  assert.equal(result.profile.calorie_floor >= 1500, true);
  assert.deepEqual(Object.keys(result.profile.macro_targets), ['rest_day', 'workout_day']);
  assert.equal(result.pantry.items[0].name, 'eggs');
  assert.equal(result.pantry.items[0].always, true);
  assert.equal(result.reveal.rest_day.protein_g, 180);
  assert.equal(result.reveal.workout_day.calories - result.reveal.rest_day.calories, 175);
});
