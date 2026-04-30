import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyActionVitalEffects,
  applyActionsVitalEffects,
  applyCalorieFloorPenaltyForDate,
  applyVitalDecay,
  applyVitalDecayToState,
  clampVital,
  defaultBubbyState,
  refreshSickState,
} from './vitalDecay.ts';
import {
  clearAll,
  getBubbyState,
  getDailyLog,
  setBubbyState,
  setDailyLog,
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

const now = new Date('2026-04-28T12:00:00');

function baseState(overrides = {}) {
  return {
    vitality: 80,
    mood: 70,
    strength: 50,
    energy: 80,
    current_animation: 'idle',
    is_sick: false,
    is_sleepy: false,
    last_updated: '2026-04-28T08:00:00',
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    name: 'Tim',
    current_weight_lbs: 165,
    calorie_floor: 1900,
    macro_targets: {
      rest_day: { calories: 1625, protein_g: 165, carbs_g: 125, fat_g: 49 },
      workout_day: { calories: 1800, protein_g: 165, carbs_g: 169, fat_g: 54 },
    },
    established_rules: [],
    ...overrides,
  };
}

function dailyLog(date, overrides = {}) {
  const totals = overrides.totals ?? {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  };

  return {
    date,
    is_workout_day: false,
    weigh_in_lbs: null,
    meals: totals.calories > 0
      ? [{ id: `meal_${date}`, logged_at: `${date}T12:00:00`, description: 'meal', macros: totals }]
      : [],
    totals,
    adherence_flags: [],
    ...overrides,
  };
}

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test.afterEach(() => {
  clearAll();
});

test('clampVital clamps values to the 0-100 range', () => {
  assert.equal(clampVital(-4), 0);
  assert.equal(clampVital(104), 100);
  assert.equal(clampVital(54), 54);
});

test('vital decay applies one day of baseline decay', () => {
  const decayed = applyVitalDecayToState(
    baseState({ last_updated: '2026-04-27T08:00:00' }),
    now,
  );

  assert.equal(decayed.vitality, 78);
  assert.equal(decayed.energy, 78);
  assert.equal(decayed.mood, 69);
  assert.equal(decayed.strength, 49);
  assert.equal(decayed.last_updated, now.toISOString());
});

test('vital decay applies multiple days but caps at 14 days', () => {
  const decayed = applyVitalDecayToState(
    baseState({ last_updated: '2026-03-01T08:00:00' }),
    now,
  );

  assert.equal(decayed.vitality, 52);
  assert.equal(decayed.energy, 52);
  assert.equal(decayed.mood, 56);
  assert.equal(decayed.strength, 36);
});

test('vital decay does nothing on the same local calendar day', () => {
  const state = baseState({ last_updated: '2026-04-28T08:00:00' });

  assert.deepEqual(applyVitalDecayToState(state, now), state);
});

test('action effects reward high-protein meals, weigh-ins, and workout days', () => {
  setUserProfile(profile());
  setBubbyState(baseState());
  setDailyLog('2026-04-28', dailyLog('2026-04-28', {
    is_workout_day: true,
    totals: { calories: 500, protein_g: 30, carbs_g: 40, fat_g: 12 },
  }));

  applyActionVitalEffects(
    {
      type: 'log_meal',
      data: {
        description: 'chicken',
        macros: { calories: 300, protein_g: 40, carbs_g: 0, fat_g: 8 },
      },
    },
    {
      dateString: '2026-04-28',
      beforeDailyLog: dailyLog('2026-04-28', {
        is_workout_day: true,
        totals: { calories: 200, protein_g: 0, carbs_g: 20, fat_g: 4 },
      }),
      now,
    },
  );
  applyActionVitalEffects({ type: 'log_weight', data: { weight_lbs: 164.5 } }, { now });
  applyActionVitalEffects(
    { type: 'set_workout_day', data: { is_workout_day: true } },
    { dateString: '2026-04-28', now },
  );

  assert.equal(getBubbyState().vitality, 83);
  assert.equal(getBubbyState().strength, 57);
  assert.equal(getBubbyState().mood, 72);
  assert.equal(getBubbyState().energy, 83);
});

test('log_meal crossing protein target adds one-time mood and vitality reward', () => {
  setUserProfile(profile());
  setBubbyState(baseState());
  setDailyLog('2026-04-28', dailyLog('2026-04-28', {
    is_workout_day: true,
    totals: { calories: 1500, protein_g: 170, carbs_g: 100, fat_g: 40 },
  }));

  applyActionVitalEffects(
    {
      type: 'log_meal',
      data: {
        description: 'protein push',
        macros: { calories: 400, protein_g: 30, carbs_g: 30, fat_g: 12 },
      },
    },
    {
      dateString: '2026-04-28',
      beforeDailyLog: dailyLog('2026-04-28', {
        is_workout_day: true,
        totals: { calories: 1100, protein_g: 140, carbs_g: 70, fat_g: 28 },
      }),
      now,
    },
  );
  applyActionVitalEffects(
    {
      type: 'log_meal',
      data: {
        description: 'already over',
        macros: { calories: 200, protein_g: 10, carbs_g: 12, fat_g: 6 },
      },
    },
    {
      dateString: '2026-04-28',
      beforeDailyLog: dailyLog('2026-04-28', {
        is_workout_day: true,
        totals: { calories: 1500, protein_g: 170, carbs_g: 100, fat_g: 40 },
      }),
      now,
    },
  );

  assert.equal(getBubbyState().vitality, 86);
  assert.equal(getBubbyState().mood, 75);
  assert.equal(
    getDailyLog('2026-04-28').adherence_flags.includes('protein_target_vitals_awarded'),
    true,
  );
});

test('calorie floor breach applies penalty once per day', () => {
  setUserProfile(profile());
  setBubbyState(baseState());
  setDailyLog('2026-04-27', dailyLog('2026-04-27', {
    totals: { calories: 1200, protein_g: 80, carbs_g: 80, fat_g: 35 },
  }));

  applyCalorieFloorPenaltyForDate('2026-04-27', { now });
  applyCalorieFloorPenaltyForDate('2026-04-27', { now });

  assert.equal(getBubbyState().vitality, 70);
  assert.equal(getBubbyState().mood, 65);
  assert.equal(
    getDailyLog('2026-04-27').adherence_flags.includes('calorie_floor_penalty_applied'),
    true,
  );
});

test('sick trigger turns on when vitality is below 30', () => {
  setUserProfile(profile());
  setBubbyState(baseState({ vitality: 25 }));

  refreshSickState({ now });

  assert.equal(getBubbyState().is_sick, true);
});

test('sick trigger turns on after two consecutive sub-floor logged days', () => {
  setUserProfile(profile());
  setBubbyState(baseState());
  setDailyLog('2026-04-27', dailyLog('2026-04-27', {
    totals: { calories: 1200, protein_g: 100, carbs_g: 80, fat_g: 30 },
  }));
  setDailyLog('2026-04-28', dailyLog('2026-04-28', {
    totals: { calories: 1300, protein_g: 95, carbs_g: 100, fat_g: 35 },
  }));

  refreshSickState({ now });

  assert.equal(getBubbyState().is_sick, true);
});

test('recovery turns off sick state when vitality is restored and recent floor is clear', () => {
  setUserProfile(profile());
  setBubbyState(baseState({ vitality: 60, is_sick: true }));
  setDailyLog('2026-04-27', dailyLog('2026-04-27', {
    totals: { calories: 2100, protein_g: 170, carbs_g: 180, fat_g: 60 },
  }));
  setDailyLog('2026-04-28', dailyLog('2026-04-28', {
    totals: { calories: 2200, protein_g: 180, carbs_g: 190, fat_g: 65 },
  }));

  refreshSickState({ now });

  assert.equal(getBubbyState().is_sick, false);
});

test('rapid high-protein recovery clears sick once and keeps vitals clamped', () => {
  setUserProfile(profile());
  setBubbyState(baseState({ vitality: 25, strength: 94, is_sick: true }));
  setDailyLog('2026-04-27', dailyLog('2026-04-27', {
    totals: { calories: 2200, protein_g: 180, carbs_g: 200, fat_g: 65 },
  }));
  setDailyLog('2026-04-28', dailyLog('2026-04-28', {
    totals: { calories: 2100, protein_g: 180, carbs_g: 180, fat_g: 60 },
  }));

  applyActionsVitalEffects(
    [
      {
        type: 'log_meal',
        data: {
          description: 'chicken breakfast',
          macros: { calories: 450, protein_g: 35, carbs_g: 40, fat_g: 12 },
        },
      },
      {
        type: 'log_meal',
        data: {
          description: 'turkey lunch',
          macros: { calories: 520, protein_g: 45, carbs_g: 50, fat_g: 14 },
        },
      },
      {
        type: 'log_meal',
        data: {
          description: 'salmon dinner',
          macros: { calories: 650, protein_g: 42, carbs_g: 55, fat_g: 24 },
        },
      },
    ],
    {
      dateString: '2026-04-28',
      now,
      beforeDailyLog: dailyLog('2026-04-28', {
        totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      }),
    },
  );

  const state = getBubbyState();
  assert.equal(state.is_sick, false);
  assert.ok(state.vitality >= 50);
  assert.ok(state.vitality <= 100);
  assert.equal(state.strength, 100);
});

test('applyVitalDecay initializes missing state with default vitals', () => {
  const state = applyVitalDecay({ now });

  assert.deepEqual(state, defaultBubbyState(now));
});
