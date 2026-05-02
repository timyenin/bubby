// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatContext,
  buildChatContextFromStorage,
  calculateMacrosRemaining,
} from './chatContext.ts';
import {
  clearAll,
  setBubbyState,
  setConversationHistory,
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

const profile = {
  name: 'Tim',
  age: 22,
  height_inches: 72,
  current_weight_lbs: 165,
  training_schedule: {
    monday: 'push',
  },
  macro_targets: {
    rest_day: { calories: 1625, protein_g: 165, carbs_g: 125, fat_g: 49 },
    workout_day: { calories: 1800, protein_g: 165, carbs_g: 169, fat_g: 54 },
  },
};

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test.afterEach(() => {
  clearAll();
});

test('buildChatContext assembles the home chat payload shape', () => {
  const dailyLog = {
    date: '2026-04-27',
    is_workout_day: true,
    totals: { calories: 500, protein_g: 40, carbs_g: 70, fat_g: 10 },
  };
  const pantry = { items: [{ name: 'eggs', category: 'protein', always: true }] };
  const bubbyState = {
    vitality: 82,
    mood: 76,
    strength: 54,
    energy: 68,
    current_animation: 'idle',
    is_sick: false,
    is_sleepy: false,
    last_updated: '2026-04-27T10:00:00.000Z',
  };
  const conversationHistory = {
    messages: [
      { role: 'assistant', content: 'morning.', timestamp: '2026-04-27T10:00:00.000Z' },
      { role: 'user', content: 'what now?', timestamp: '2026-04-27T10:01:00.000Z' },
    ],
  };

  const context = buildChatContext({
    userProfile: profile,
    dailyLog,
    pantry,
    conversationHistory,
    bubbyState,
    currentTime: '2026-04-27T16:34:00.000Z',
    now: new Date('2026-04-27T16:34:00.000Z'),
  });

  assert.deepEqual(context.user_profile, profile);
  assert.deepEqual(context.macros_today, dailyLog.totals);
  assert.deepEqual(context.macros_remaining, {
    calories: 1300,
    protein_g: 125,
    carbs_g: 99,
    fat_g: 44,
  });
  assert.equal(context.training_today, 'push');
  assert.deepEqual(context.pantry, pantry);
  assert.deepEqual(context.recent_history, [
    { role: 'assistant', content: 'morning.' },
    { role: 'user', content: 'what now?' },
  ]);
  assert.deepEqual(context.bubby_state, bubbyState);
  assert.equal(context.current_time, '2026-04-27T16:34:00.000Z');
  assert.equal(context.is_onboarding, false);
  assert.equal(context.memory, null);
});

test('buildChatContextFromStorage reads localStorage and caps recent history at 20', () => {
  setUserProfile(profile);
  setPantry({ items: [] });
  setDailyLog('2026-04-27', {
    date: '2026-04-27',
    is_workout_day: false,
    totals: { calories: 100, protein_g: 10, carbs_g: 12, fat_g: 3 },
  });
  setBubbyState({
    vitality: 80,
    mood: 70,
    strength: 50,
    energy: 80,
    current_animation: 'idle',
    is_sick: false,
    is_sleepy: false,
    last_updated: '2026-04-27T10:00:00.000Z',
  });
  setConversationHistory({
    messages: Array.from({ length: 50 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message ${index}`,
      timestamp: `2026-04-27T10:${String(index).padStart(2, '0')}:00.000Z`,
    })),
  });

  const context = buildChatContextFromStorage({
    dateString: '2026-04-27',
    currentTime: '2026-04-27T16:34:00.000Z',
    now: new Date('2026-04-27T16:34:00.000Z'),
  });

  assert.equal(context.recent_history.length, 20);
  assert.equal(context.recent_history[0].content, 'message 30');
  assert.equal(context.recent_history.at(-1).content, 'message 49');
  assert.deepEqual(context.macros_today, {
    calories: 100,
    protein_g: 10,
    carbs_g: 12,
    fat_g: 3,
  });
});

test('buildChatContextFromStorage defaults current_time to readable local time context', () => {
  const now = new Date(2026, 4, 2, 22, 44, 0);
  const context = buildChatContextFromStorage({
    dateString: '2026-05-02',
    now,
  });

  assert.match(context.current_time, /local date: 2026-05-02/);
  assert.match(context.current_time, /local time:/);
  assert.match(context.current_time, /time zone:/);
  assert.match(context.current_time, /utc offset: [+-]\d{2}:\d{2}/);
  assert.match(context.current_time, new RegExp(`utc: ${now.toISOString().replaceAll('.', '\\.')}`));
  assert.notEqual(context.current_time, now.toISOString());
});

test('buildChatContextFromStorage includes memory entries when memory exists in storage', () => {
  setMemory({
    entries: [
      {
        id: 'memory_1',
        content: 'hates mushrooms',
        category: 'preference',
        created_at: '2026-04-27T08:00:00.000Z',
        updated_at: '2026-04-27T08:00:00.000Z',
      },
    ],
    last_updated: '2026-04-27T08:00:00.000Z',
  });

  const context = buildChatContextFromStorage({
    dateString: '2026-04-27',
    currentTime: '2026-04-27T16:34:00.000Z',
    now: new Date('2026-04-27T16:34:00.000Z'),
  });

  assert.deepEqual(context.memory, [
    {
      id: 'memory_1',
      content: 'hates mushrooms',
      category: 'preference',
      created_at: '2026-04-27T08:00:00.000Z',
      updated_at: '2026-04-27T08:00:00.000Z',
    },
  ]);
});

test('buildChatContextFromStorage includes null memory when no memory in storage', () => {
  const context = buildChatContextFromStorage({
    dateString: '2026-04-27',
    currentTime: '2026-04-27T16:34:00.000Z',
    now: new Date('2026-04-27T16:34:00.000Z'),
  });

  assert.equal(context.memory, null);
});

test('buildChatContextFromStorage marks concern elevated after two consecutive sub-floor daily logs', () => {
  setUserProfile({
    ...profile,
    calorie_floor: 1500,
  });
  setDailyLog('2026-04-27', {
    date: '2026-04-27',
    is_workout_day: false,
    meals: [{ id: 'meal-1', description: 'low day', macros: { calories: 1200 } }],
    totals: { calories: 1200, protein_g: 90, carbs_g: 90, fat_g: 35 },
    adherence_flags: [],
  });
  setDailyLog('2026-04-28', {
    date: '2026-04-28',
    is_workout_day: false,
    meals: [{ id: 'meal-2', description: 'low day', macros: { calories: 1300 } }],
    totals: { calories: 1300, protein_g: 95, carbs_g: 100, fat_g: 35 },
    adherence_flags: [],
  });

  const context = buildChatContextFromStorage({
    dateString: '2026-04-28',
    now: new Date('2026-04-28T16:34:00.000Z'),
  });

  assert.equal(context.concern_level, 'elevated');
});

test('buildChatContextFromStorage keeps concern normal when recent logs meet calorie floor', () => {
  setUserProfile({
    ...profile,
    calorie_floor: 1500,
  });
  setDailyLog('2026-04-27', {
    date: '2026-04-27',
    is_workout_day: false,
    meals: [{ id: 'meal-1', description: 'normal day', macros: { calories: 1700 } }],
    totals: { calories: 1700, protein_g: 140, carbs_g: 150, fat_g: 50 },
    adherence_flags: [],
  });
  setDailyLog('2026-04-28', {
    date: '2026-04-28',
    is_workout_day: false,
    meals: [{ id: 'meal-2', description: 'normal day', macros: { calories: 1650 } }],
    totals: { calories: 1650, protein_g: 135, carbs_g: 145, fat_g: 48 },
    adherence_flags: [],
  });

  const context = buildChatContextFromStorage({
    dateString: '2026-04-28',
    now: new Date('2026-04-28T16:34:00.000Z'),
  });

  assert.equal(context.concern_level, 'normal');
});

test('buildChatContextFromStorage marks weight loss too fast from recent weigh-ins', () => {
  setUserProfile(profile);
  for (let day = 15; day <= 28; day += 1) {
    const date = `2026-04-${String(day).padStart(2, '0')}`;
    const isLatestWeek = day >= 22;
    setDailyLog(date, {
      date,
      is_workout_day: false,
      weigh_in_lbs: isLatestWeek ? 162 : 165,
      meals: [],
      totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      adherence_flags: [],
    });
  }

  const context = buildChatContextFromStorage({
    dateString: '2026-04-28',
    now: new Date('2026-04-28T16:34:00.000Z'),
  });

  assert.equal(context.weight_loss_rate, 'too_fast');
});

test('calculateMacrosRemaining subtracts totals and never returns negatives', () => {
  assert.deepEqual(
    calculateMacrosRemaining(
      { calories: 1000, protein_g: 50, carbs_g: 50, fat_g: 20 },
      { calories: 1200, protein_g: 60, carbs_g: 10, fat_g: 25 },
    ),
    { calories: 0, protein_g: 0, carbs_g: 40, fat_g: 0 },
  );
});
