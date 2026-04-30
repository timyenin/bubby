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

test('applyActions is idempotent for set-like updates and log_meal is intentionally additive', () => {
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

  assert.equal(getDailyLog('2026-04-27').meals.length, 2);
});
