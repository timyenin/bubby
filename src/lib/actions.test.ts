// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAction,
  applyActions,
  parseActions,
} from './actions.ts';
import {
  addMemoryEntry,
  clearAll,
  getDailyLog,
  getMemory,
  getPantry,
  getUserProfile,
  setDailyLog,
  setMemory,
  setPantry,
  setUserProfile,
} from './storage.ts';

class MemoryStorage {
  #items = new Map();

  get length() {
    return this.#items.size;
  }

  key(index) {
    return Array.from(this.#items.keys())[index] ?? null;
  }

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }

  clear() {
    this.#items.clear();
  }
}

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test.afterEach(() => {
  clearAll();
});

test('parseActions returns multiple action envelopes from one reply', () => {
  const reply = [
    'logged it.',
    '[ACTION]{"type":"log_meal","data":{"description":"eggs","macros":{"calories":280,"protein_g":24,"carbs_g":2,"fat_g":20}}}[/ACTION]',
    '[ACTION]{"type":"set_workout_day","data":{"is_workout_day":true,"training_type":"push"}}[/ACTION]',
  ].join('\n');

  assert.deepEqual(parseActions(reply), [
    {
      type: 'log_meal',
      data: {
        description: 'eggs',
        macros: { calories: 280, protein_g: 24, carbs_g: 2, fat_g: 20 },
      },
    },
    {
      type: 'set_workout_day',
      data: { is_workout_day: true, training_type: 'push' },
    },
  ]);
});

test('parseActions handles play_animation envelopes without touching storage', () => {
  const reply = 'ok watch this\n[ACTION]{"type":"play_animation","data":{"animation":"happy_bounce","count":2}}[/ACTION]';

  assert.deepEqual(parseActions(reply), [
    {
      type: 'play_animation',
      data: { animation: 'happy_bounce', count: 2 },
    },
  ]);

  assert.equal(applyAction(parseActions(reply)[0]), null);
  assert.equal(getUserProfile(), null);
  assert.equal(getPantry(), null);
  assert.equal(getDailyLog('2026-04-27'), null);
});

test('log_meal appends a meal and recalculates daily totals', () => {
  setDailyLog('2026-04-27', {
    date: '2026-04-27',
    is_workout_day: false,
    weigh_in_lbs: null,
    meals: [
      {
        id: 'meal_existing',
        logged_at: '2026-04-27T08:00:00.000Z',
        description: 'greek yogurt',
        macros: { calories: 150, protein_g: 20, carbs_g: 8, fat_g: 4 },
      },
    ],
    totals: { calories: 150, protein_g: 20, carbs_g: 8, fat_g: 4 },
    adherence_flags: [],
  });

  applyAction(
    {
      type: 'log_meal',
      data: {
        description: '4 eggs and a cup of rice',
        macros: { calories: 520, protein_g: 30, carbs_g: 48, fat_g: 22 },
      },
    },
    {
      dateString: '2026-04-27',
      now: new Date('2026-04-27T12:00:00.000Z'),
    },
  );

  const log = getDailyLog('2026-04-27');
  assert.equal(log.meals.length, 2);
  assert.equal(log.meals[1].description, '4 eggs and a cup of rice');
  assert.deepEqual(log.totals, {
    calories: 670,
    protein_g: 50,
    carbs_g: 56,
    fat_g: 26,
  });
});

test('log_meal without a date logs into today by default', () => {
  applyAction(
    {
      type: 'log_meal',
      data: {
        description: 'today eggs',
        macros: { calories: 210, protein_g: 18, carbs_g: 1, fat_g: 15 },
      },
    },
    {
      dateString: '2026-04-27',
      now: new Date('2026-04-27T12:00:00.000Z'),
    },
  );

  assert.equal(getDailyLog('2026-04-27').meals[0].description, 'today eggs');
});

test('log_meal with a valid date logs into that daily log', () => {
  applyAction(
    {
      type: 'log_meal',
      data: {
        description: 'past eggs',
        date: '2026-04-25',
        macros: { calories: 210, protein_g: 18, carbs_g: 1, fat_g: 15 },
      },
    },
    {
      dateString: '2026-04-27',
      now: new Date('2026-04-27T12:00:00.000Z'),
    },
  );

  assert.equal(getDailyLog('2026-04-25').meals[0].description, 'past eggs');
  assert.equal(getDailyLog('2026-04-27'), null);
});

test('log_meal with an invalid date falls back to today and does not corrupt storage', () => {
  applyAction(
    {
      type: 'log_meal',
      data: {
        description: 'fallback eggs',
        date: 'april-ish',
        macros: { calories: 210, protein_g: 18, carbs_g: 1, fat_g: 15 },
      },
    },
    {
      dateString: '2026-04-27',
      now: new Date('2026-04-27T12:00:00.000Z'),
    },
  );

  assert.equal(getDailyLog('2026-04-27').meals[0].description, 'fallback eggs');
  assert.equal(getDailyLog('april-ish'), null);
});

test('log_weight updates the current profile weight', () => {
  setUserProfile({
    name: 'Tim',
    current_weight_lbs: 165,
    established_rules: [],
  });

  applyAction({ type: 'log_weight', data: { weight_lbs: 163.8 } });

  assert.equal(getUserProfile().current_weight_lbs, 163.8);
});

test('set_workout_day updates today daily log workout status', () => {
  applyAction(
    { type: 'set_workout_day', data: { is_workout_day: true, training_type: 'pull' } },
    { dateString: '2026-04-27' },
  );

  assert.equal(getDailyLog('2026-04-27').is_workout_day, true);
});

test('update_pantry adds and removes pantry items without duplicates', () => {
  setPantry({
    items: [
      { name: 'eggs', category: 'protein', always: true },
      { name: 'rice', category: 'grain', always: true },
    ],
    last_updated: '2026-04-27T08:00:00.000Z',
  });

  applyAction(
    { type: 'update_pantry', data: { added: ['eggs', 'greek yogurt'], removed: ['rice'] } },
    { now: new Date('2026-04-27T12:00:00.000Z') },
  );

  assert.deepEqual(
    getPantry().items.map((item) => item.name),
    ['eggs', 'greek yogurt'],
  );
});

test('set_workout_day respects a provided valid action date', () => {
  applyAction(
    { type: 'set_workout_day', data: { date: '2026-04-25', is_workout_day: true } },
    { dateString: '2026-04-27' },
  );

  assert.equal(getDailyLog('2026-04-25').is_workout_day, true);
  assert.equal(getDailyLog('2026-04-27'), null);
});

test('update_pantry_macros updates macros on an existing pantry item', () => {
  setPantry({
    items: [{ name: 'chicken breast', category: 'protein', always: true }],
    last_updated: '2026-04-27T08:00:00.000Z',
  });

  applyAction(
    {
      type: 'update_pantry_macros',
      data: {
        item_name: 'chicken breast',
        macros: {
          calories: 165,
          protein_g: 31,
          carbs_g: 0,
          fat_g: 3.6,
          serving_size: '6oz',
        },
      },
    },
    { now: new Date('2026-04-27T12:00:00.000Z') },
  );

  assert.deepEqual(getPantry().items[0].macros, {
    calories: 165,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
    serving_size: '6oz',
  });
});

test("update_pantry_macros adds a new pantry item with macros if it doesn't exist", () => {
  setPantry({
    items: [],
    last_updated: '2026-04-27T08:00:00.000Z',
  });

  applyAction({
    type: 'update_pantry_macros',
    data: {
      item_name: 'chicken breast',
      macros: {
        calories: 165,
        protein_g: 31,
        carbs_g: 0,
        fat_g: 3.6,
        serving_size: '6oz',
      },
    },
  });

  assert.deepEqual(getPantry().items[0], {
    name: 'chicken breast',
    category: 'unsorted',
    always: true,
    macros: {
      calories: 165,
      protein_g: 31,
      carbs_g: 0,
      fat_g: 3.6,
      serving_size: '6oz',
    },
  });
});

test('update_pantry_macros matches item name case-insensitively', () => {
  setPantry({
    items: [{ name: 'Chicken Breast', category: 'protein', always: true }],
    last_updated: '2026-04-27T08:00:00.000Z',
  });

  applyAction({
    type: 'update_pantry_macros',
    data: {
      item_name: 'chicken breast',
      macros: {
        calories: 165,
        protein_g: 31,
        carbs_g: 0,
        fat_g: 3.6,
        serving_size: '6oz',
      },
    },
  });

  assert.equal(getPantry().items.length, 1);
  assert.equal(getPantry().items[0].name, 'Chicken Breast');
  assert.equal(getPantry().items[0].macros.protein_g, 31);
});

test('update_rule adds and removes established rules without duplicates', () => {
  setUserProfile({
    name: 'Tim',
    current_weight_lbs: 165,
    established_rules: ['no peanuts', 'oats in smoothie'],
  });

  applyAction({
    type: 'update_rule',
    data: { added: ['no peanuts', 'pack lunch'], removed: ['oats in smoothie'] },
  });

  assert.deepEqual(getUserProfile().established_rules, ['no peanuts', 'pack lunch']);
});

test('update_macros with full workout and rest day data updates the profile', () => {
  setUserProfile({
    name: 'Tim',
    current_weight_lbs: 165,
    established_rules: [],
    macro_targets: {
      rest_day: { calories: 2100, protein_g: 165, carbs_g: 220, fat_g: 58 },
      workout_day: { calories: 2300, protein_g: 165, carbs_g: 270, fat_g: 62 },
    },
    calorie_floor: 1800,
  });

  const result = applyAction({
    type: 'update_macros',
    data: {
      rest_day: { calories: 2000, protein_g: 170, carbs_g: 190, fat_g: 60 },
      workout_day: { calories: 2200, protein_g: 170, carbs_g: 240, fat_g: 70 },
      calorie_floor: 1750,
    },
  });

  assert.deepEqual(result.macro_targets, {
    rest_day: { calories: 2000, protein_g: 170, carbs_g: 190, fat_g: 60 },
    workout_day: { calories: 2200, protein_g: 170, carbs_g: 240, fat_g: 70 },
  });
  assert.equal(result.calorie_floor, 1750);
  assert.deepEqual(getUserProfile().macro_targets, result.macro_targets);
});

test('update_macros with partial data merges without overwriting workout day', () => {
  setUserProfile({
    name: 'Tim',
    current_weight_lbs: 165,
    established_rules: [],
    macro_targets: {
      rest_day: { calories: 2100, protein_g: 165, carbs_g: 220, fat_g: 58 },
      workout_day: { calories: 2300, protein_g: 165, carbs_g: 270, fat_g: 62 },
    },
    calorie_floor: 1800,
  });

  applyAction({
    type: 'update_macros',
    data: {
      rest_day: { calories: 2050, carbs_g: 200 },
    },
  });

  assert.deepEqual(getUserProfile().macro_targets, {
    rest_day: { calories: 2050, protein_g: 165, carbs_g: 200, fat_g: 58 },
    workout_day: { calories: 2300, protein_g: 165, carbs_g: 270, fat_g: 62 },
  });
  assert.equal(getUserProfile().calorie_floor, 1800);
});

test('update_macros without a profile in storage returns null', () => {
  const result = applyAction({
    type: 'update_macros',
    data: {
      rest_day: { calories: 2050 },
    },
  });

  assert.equal(result, null);
  assert.equal(getUserProfile(), null);
});

test('save_memory action adds an entry to memory storage', () => {
  applyAction({
    type: 'save_memory',
    data: {
      content: 'hates mushrooms',
      category: 'preference',
    },
  });

  assert.equal(getMemory().entries.length, 1);
  assert.equal(getMemory().entries[0].content, 'hates mushrooms');
  assert.equal(getMemory().entries[0].category, 'preference');
});

test('save_memory with duplicate content updates updated_at instead of adding', () => {
  setMemory({
    entries: [
      {
        id: 'memory_existing',
        content: 'hates mushrooms',
        category: 'preference',
        created_at: '2026-04-27T08:00:00.000Z',
        updated_at: '2026-04-27T08:00:00.000Z',
      },
    ],
    last_updated: '2026-04-27T08:00:00.000Z',
  });

  applyAction({
    type: 'save_memory',
    data: {
      content: ' HATES MUSHROOMS ',
      category: 'rule',
    },
  });

  assert.equal(getMemory().entries.length, 1);
  assert.equal(getMemory().entries[0].id, 'memory_existing');
  assert.equal(getMemory().entries[0].content, 'HATES MUSHROOMS');
  assert.equal(getMemory().entries[0].category, 'rule');
  assert.notEqual(getMemory().entries[0].updated_at, '2026-04-27T08:00:00.000Z');
});

test('forget_memory action removes a matching entry', () => {
  addMemoryEntry({ content: 'hates mushrooms', category: 'preference' });

  applyAction({
    type: 'forget_memory',
    data: { memory_content: 'HATES MUSHROOMS' },
  });

  assert.equal(getMemory().entries.length, 0);
});

test("forget_memory with no match does nothing and doesn't error", () => {
  addMemoryEntry({ content: 'likes rice', category: 'preference' });

  const result = applyAction({
    type: 'forget_memory',
    data: { memory_content: 'hates mushrooms' },
  });

  assert.equal(result, null);
  assert.equal(getMemory().entries.length, 1);
});

test('applyActions is idempotent for set-like updates and skips retry duplicate meals', () => {
  setPantry({
    items: [{ name: 'eggs', category: 'protein', always: true }],
    last_updated: '2026-04-27T08:00:00.000Z',
  });

  const pantryAction = { type: 'update_pantry', data: { added: ['rice'] } };
  applyActions([pantryAction, pantryAction]);
  assert.deepEqual(
    getPantry().items.map((item) => item.name),
    ['eggs', 'rice'],
  );

  const mealAction = {
    type: 'log_meal',
    data: {
      description: 'same meal twice',
      macros: { calories: 300, protein_g: 25, carbs_g: 30, fat_g: 8 },
    },
  };
  applyActions([mealAction, mealAction], {
    dateString: '2026-04-27',
    now: new Date('2026-04-27T12:00:00.000Z'),
  });

  assert.equal(getDailyLog('2026-04-27').meals.length, 1);
});

test('log_meal duplicate protection is exact and time-window conservative', () => {
  const mealAction = {
    type: 'log_meal',
    data: {
      description: 'same meal',
      macros: { calories: 300, protein_g: 25, carbs_g: 30, fat_g: 8 },
    },
  };

  const first = applyAction(mealAction, {
    dateString: '2026-04-27',
    now: new Date('2026-04-27T12:00:00.000Z'),
    returnMutationResult: true,
  });
  const duplicate = applyAction(mealAction, {
    dateString: '2026-04-27',
    now: new Date('2026-04-27T12:02:00.000Z'),
    returnMutationResult: true,
  });
  const later = applyAction(mealAction, {
    dateString: '2026-04-27',
    now: new Date('2026-04-27T15:30:00.000Z'),
    returnMutationResult: true,
  });
  const differentMacros = applyAction(
    {
      ...mealAction,
      data: {
        ...mealAction.data,
        macros: { calories: 301, protein_g: 25, carbs_g: 30, fat_g: 8 },
      },
    },
    {
      dateString: '2026-04-27',
      now: new Date('2026-04-27T15:31:00.000Z'),
      returnMutationResult: true,
    },
  );

  assert.equal(first.status, 'inserted');
  assert.equal(duplicate.status, 'skipped_duplicate');
  assert.equal(later.status, 'inserted');
  assert.equal(differentMacros.status, 'inserted');
  assert.equal(getDailyLog('2026-04-27').meals.length, 3);
});

test('delete_meal removes the matching meal and recomputes totals', () => {
  setDailyLog('2026-04-27', {
    date: '2026-04-27',
    is_workout_day: false,
    weigh_in_lbs: null,
    meals: [
      { id: 'meal_keep', logged_at: '2026-04-27T08:00:00.000Z', description: 'eggs', macros: { calories: 200, protein_g: 18, carbs_g: 1, fat_g: 14 } },
      { id: 'meal_remove', logged_at: '2026-04-27T12:00:00.000Z', description: 'rice', macros: { calories: 300, protein_g: 4, carbs_g: 60, fat_g: 2 } },
    ],
    totals: { calories: 500, protein_g: 22, carbs_g: 61, fat_g: 16 },
    adherence_flags: [],
  });

  const result = applyAction(
    { type: 'delete_meal', data: { date: '2026-04-27', meal_id: 'meal_remove' } },
    { returnMutationResult: true },
  );

  assert.equal(result.status, 'deleted');
  assert.deepEqual(getDailyLog('2026-04-27').meals.map((meal) => meal.id), ['meal_keep']);
  assert.deepEqual(getDailyLog('2026-04-27').totals, {
    calories: 200,
    protein_g: 18,
    carbs_g: 1,
    fat_g: 14,
  });
});

test('delete_meal with an unknown meal id is a safe no-op', () => {
  setDailyLog('2026-04-27', {
    date: '2026-04-27',
    is_workout_day: false,
    weigh_in_lbs: null,
    meals: [{ id: 'meal_keep', logged_at: '2026-04-27T08:00:00.000Z', description: 'eggs', macros: { calories: 200, protein_g: 18, carbs_g: 1, fat_g: 14 } }],
    totals: { calories: 200, protein_g: 18, carbs_g: 1, fat_g: 14 },
    adherence_flags: [],
  });

  const result = applyAction(
    { type: 'delete_meal', data: { date: '2026-04-27', meal_id: 'missing' } },
    { returnMutationResult: true },
  );

  assert.equal(result.status, 'noop');
  assert.equal(getDailyLog('2026-04-27').meals.length, 1);
});

test('update_meal changes provided fields and recomputes totals', () => {
  setDailyLog('2026-04-27', {
    date: '2026-04-27',
    is_workout_day: false,
    weigh_in_lbs: null,
    meals: [{ id: 'meal_1', logged_at: '2026-04-27T08:00:00.000Z', description: 'eggs', macros: { calories: 200, protein_g: 18, carbs_g: 1, fat_g: 14 } }],
    totals: { calories: 200, protein_g: 18, carbs_g: 1, fat_g: 14 },
    adherence_flags: [],
  });

  const result = applyAction(
    {
      type: 'update_meal',
      data: {
        date: '2026-04-27',
        meal_id: 'meal_1',
        description: 'eggs and toast',
        macros: { calories: 320, protein_g: 22, carbs_g: 24, fat_g: 15 },
      },
    },
    { returnMutationResult: true },
  );

  assert.equal(result.status, 'updated');
  assert.equal(getDailyLog('2026-04-27').meals[0].description, 'eggs and toast');
  assert.equal(getDailyLog('2026-04-27').meals[0].logged_at, '2026-04-27T08:00:00.000Z');
  assert.deepEqual(getDailyLog('2026-04-27').totals, {
    calories: 320,
    protein_g: 22,
    carbs_g: 24,
    fat_g: 15,
  });
});

test('replace_daily_log replaces meals, preserves weigh-in, and clears stale derived flags', () => {
  setDailyLog('2026-05-02', {
    date: '2026-05-02',
    is_workout_day: true,
    weigh_in_lbs: 164.4,
    meals: [{ id: 'old', logged_at: '2026-05-02T08:00:00.000Z', description: 'wrong', macros: { calories: 999, protein_g: 0, carbs_g: 0, fat_g: 0 } }],
    totals: { calories: 999, protein_g: 0, carbs_g: 0, fat_g: 0 },
    adherence_flags: [
      'protein_target_vitals_awarded',
      'calorie_floor_penalty_applied',
      'sick_recovery_meals:3',
      'manual_note',
    ],
  });

  const result = applyAction(
    {
      type: 'replace_daily_log',
      data: {
        date: '2026-05-02',
        meals: [
          { description: 'breakfast', macros: { calories: 627, protein_g: 67.5, carbs_g: 46.5, fat_g: 16.5 } },
          { description: 'lunch', macros: { calories: 395, protein_g: 50, carbs_g: 44, fat_g: 4.5 } },
          { description: '3 grapes', macros: { calories: 3, protein_g: 0, carbs_g: 0.7, fat_g: 0 } },
          { description: '3 cherry tomatoes', macros: { calories: 10, protein_g: 0, carbs_g: 2, fat_g: 0 } },
          { description: 'yogurt bowl', macros: { calories: 420, protein_g: 44, carbs_g: 38, fat_g: 10 } },
        ],
      },
    },
    {
      now: new Date('2026-05-02T20:00:00.000Z'),
      returnMutationResult: true,
    },
  );

  const log = getDailyLog('2026-05-02');
  assert.equal(result.status, 'replaced');
  assert.equal(log.weigh_in_lbs, 164.4);
  assert.equal(log.is_workout_day, true);
  assert.deepEqual(log.totals, { calories: 1455, protein_g: 161.5, carbs_g: 131.2, fat_g: 31 });
  assert.deepEqual(log.adherence_flags, ['manual_note']);
  assert.match(log.meals[0].id, /^meal_\d+_1$/);
});

test('replace_daily_log with invalid meals is a safe no-op', () => {
  const result = applyAction(
    { type: 'replace_daily_log', data: { date: '2026-05-02', meals: [] } },
    { returnMutationResult: true },
  );

  assert.equal(result.status, 'noop');
  assert.equal(getDailyLog('2026-05-02'), null);
});

test('applyActions can return mutation metadata without breaking legacy storage results', () => {
  const actions = [
    {
      type: 'log_meal',
      data: {
        description: 'eggs',
        macros: { calories: 210, protein_g: 18, carbs_g: 1, fat_g: 15 },
      },
    },
    { type: 'play_animation', data: { animation: 'spin' } },
  ];

  const metadata = applyActions(actions, {
    dateString: '2026-04-27',
    now: new Date('2026-04-27T12:00:00.000Z'),
    returnMutationResult: true,
  });

  assert.deepEqual(
    metadata.map((result) => result.status),
    ['inserted', 'noop'],
  );
  assert.equal(metadata[0].changed, true);
  assert.equal(metadata[1].changed, false);
});
