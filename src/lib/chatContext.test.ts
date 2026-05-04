// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatContext,
  buildChatContextFromStorage,
  calculateMacroDeltas,
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
    meals: [
      {
        id: 'meal_1',
        logged_at: '2026-04-27T12:00:00.000Z',
        description: 'lunch',
        macros: { calories: 500, protein_g: 40, carbs_g: 70, fat_g: 10 },
      },
    ],
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

test('buildChatContextFromStorage reads localStorage and caps recent history at 150', () => {
  setUserProfile(profile);
  setPantry({ items: [] });
  setDailyLog('2026-04-27', {
    date: '2026-04-27',
    is_workout_day: false,
    meals: [
      {
        id: 'meal_1',
        logged_at: '2026-04-27T12:00:00.000Z',
        description: 'snack',
        macros: { calories: 100, protein_g: 10, carbs_g: 12, fat_g: 3 },
      },
    ],
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
    messages: Array.from({ length: 170 }, (_, index) => ({
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

  assert.equal(context.recent_history.length, 150);
  assert.equal(context.recent_history[0].content, 'message 20');
  assert.equal(context.recent_history.at(-1).content, 'message 169');
  assert.deepEqual(context.macros_today, {
    calories: 100,
    protein_g: 10,
    carbs_g: 12,
    fat_g: 3,
  });
});

test('buildChatContext keeps a 50-message meal-planning thread in recent history', () => {
  setConversationHistory({
    messages: Array.from({ length: 50 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `meal planning detail ${index}`,
      timestamp: `2026-04-27T10:${String(index).padStart(2, '0')}:00.000Z`,
    })),
  });

  const context = buildChatContextFromStorage({
    dateString: '2026-04-27',
    currentTime: '2026-04-27T16:34:00.000Z',
    now: new Date('2026-04-27T16:34:00.000Z'),
  });

  assert.equal(context.recent_history.length, 50);
  assert.equal(context.recent_history[0].content, 'meal planning detail 0');
  assert.equal(context.recent_history.at(-1).content, 'meal planning detail 49');
});

test('recent history is text-only and excludes image payload fields', () => {
  setConversationHistory({
    messages: [
      {
        role: 'user',
        content: 'photo lunch',
        timestamp: '2026-04-27T10:00:00.000Z',
        thumbnail: 'data:image/jpeg;base64,thumb',
        thumbnails: ['data:image/jpeg;base64,thumb'],
        fullImages: ['data:image/jpeg;base64,full-image'],
      },
      {
        role: 'assistant',
        content: 'logged.',
        timestamp: '2026-04-27T10:01:00.000Z',
      },
    ],
  });

  const context = buildChatContextFromStorage({
    dateString: '2026-04-27',
    currentTime: '2026-04-27T16:34:00.000Z',
    now: new Date('2026-04-27T16:34:00.000Z'),
  });

  assert.deepEqual(context.recent_history, [
    { role: 'user', content: 'photo lunch' },
    { role: 'assistant', content: 'logged.' },
  ]);
  assert.equal(context.recent_history.every((message) => Object.keys(message).join(',') === 'role,content'), true);
  assert.doesNotMatch(JSON.stringify(context.recent_history), /thumbnail|fullImages|full-image|base64/);
});

test('recent history respects a character budget while preferring newest chronological messages', () => {
  setConversationHistory({
    messages: Array.from({ length: 70 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `budgeted message ${index} ${'x'.repeat(1000)}`,
      timestamp: `2026-04-27T10:${String(index).padStart(2, '0')}:00.000Z`,
    })),
  });

  const context = buildChatContextFromStorage({
    dateString: '2026-04-27',
    currentTime: '2026-04-27T16:34:00.000Z',
    now: new Date('2026-04-27T16:34:00.000Z'),
  });
  const totalCharacters = context.recent_history.reduce(
    (total, message) => total + message.role.length + message.content.length,
    0,
  );

  assert.ok(context.recent_history.length > 20);
  assert.ok(context.recent_history.length < 70);
  assert.ok(totalCharacters <= 50000);
  assert.equal(context.recent_history.at(-1).content.startsWith('budgeted message 69'), true);
  const retainedIndexes = context.recent_history.map((message) => Number(message.content.match(/budgeted message (\d+)/)[1]));
  assert.ok(retainedIndexes[0] > 0);
  assert.deepEqual(retainedIndexes, retainedIndexes.toSorted((a, b) => a - b));
});

test('buildChatContextFromStorage includes canonical today meals and macro deltas', () => {
  setUserProfile({
    ...profile,
    macro_targets: {
      rest_day: { calories: 1950, protein_g: 160, carbs_g: 100, fat_g: 50 },
      workout_day: { calories: 2200, protein_g: 170, carbs_g: 180, fat_g: 60 },
    },
  });
  setDailyLog('2026-05-02', {
    date: '2026-05-02',
    is_workout_day: false,
    weigh_in_lbs: null,
    meals: [
      { id: 'breakfast', logged_at: '2026-05-02T08:00:00.000Z', description: 'breakfast', macros: { calories: 627, protein_g: 67.5, carbs_g: 46.5, fat_g: 16.5 } },
      { id: 'lunch', logged_at: '2026-05-02T12:00:00.000Z', description: 'lunch', macros: { calories: 395, protein_g: 50, carbs_g: 44, fat_g: 4.5 } },
      { id: 'grapes', logged_at: '2026-05-02T13:00:00.000Z', description: '3 grapes', macros: { calories: 3, protein_g: 0, carbs_g: 0.7, fat_g: 0 } },
      { id: 'tomatoes', logged_at: '2026-05-02T14:00:00.000Z', description: '3 cherry tomatoes', macros: { calories: 10, protein_g: 0, carbs_g: 2, fat_g: 0 } },
      { id: 'yogurt', logged_at: '2026-05-02T18:00:00.000Z', description: 'yogurt bowl', macros: { calories: 420, protein_g: 44, carbs_g: 38, fat_g: 10 } },
    ],
    totals: { calories: 9999, protein_g: 999, carbs_g: 999, fat_g: 999 },
    adherence_flags: [],
  });

  const context = buildChatContextFromStorage({
    dateString: '2026-05-02',
    now: new Date('2026-05-02T22:00:00.000Z'),
  });

  assert.equal(context.today_date, '2026-05-02');
  assert.equal(context.yesterday_date, '2026-05-01');
  assert.equal(context.daily_log_today.meals.length, 5);
  assert.deepEqual(context.daily_log_today.meals[0], {
    id: 'breakfast',
    logged_at: '2026-05-02T08:00:00.000Z',
    description: 'breakfast',
    macros: { calories: 627, protein_g: 67.5, carbs_g: 46.5, fat_g: 16.5 },
  });
  assert.deepEqual(context.daily_log_today.totals, {
    calories: 1455,
    protein_g: 161.5,
    carbs_g: 131.2,
    fat_g: 31,
  });
  assert.deepEqual(context.daily_log_today.remaining, {
    calories: 495,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 19,
  });
  assert.deepEqual(context.daily_log_today.deltas, {
    calories: 495,
    protein_g: -1.5,
    carbs_g: -31.2,
    fat_g: 19,
  });
});

test('buildChatContextFromStorage includes yesterday and compact recent daily summaries', () => {
  setUserProfile(profile);
  for (let day = 26; day <= 28; day += 1) {
    const date = `2026-04-${day}`;
    setDailyLog(date, {
      date,
      is_workout_day: day === 28,
      weigh_in_lbs: null,
      meals: [
        { id: `meal_${day}`, logged_at: `${date}T12:00:00.000Z`, description: `meal ${day}`, macros: { calories: day, protein_g: 10, carbs_g: 5, fat_g: 2 } },
      ],
      totals: { calories: 999, protein_g: 999, carbs_g: 999, fat_g: 999 },
      adherence_flags: [],
    });
  }

  const context = buildChatContextFromStorage({
    dateString: '2026-04-28',
    now: new Date('2026-04-28T16:34:00.000Z'),
  });

  assert.equal(context.daily_log_yesterday.date, '2026-04-27');
  assert.equal(context.daily_log_yesterday.meals[0].description, 'meal 27');
  assert.deepEqual(context.daily_log_yesterday.totals, {
    calories: 27,
    protein_g: 10,
    carbs_g: 5,
    fat_g: 2,
  });
  assert.deepEqual(
    context.recent_daily_summaries.filter(Boolean).map((summary) => ({
      date: summary.date,
      meal_count: summary.meal_count,
      is_workout_day: summary.is_workout_day,
    })),
    [
      { date: '2026-04-26', meal_count: 1, is_workout_day: false },
      { date: '2026-04-27', meal_count: 1, is_workout_day: false },
      { date: '2026-04-28', meal_count: 1, is_workout_day: true },
    ],
  );
  assert.equal(context.recent_daily_summaries.length <= 7, true);
});

test('calculateMacroDeltas returns signed remaining or overage values with clean rounding', () => {
  assert.deepEqual(
    calculateMacroDeltas(
      { calories: 1950, protein_g: 160, carbs_g: 100, fat_g: 50 },
      { calories: 1455, protein_g: 161.5, carbs_g: 131.2, fat_g: 31 },
    ),
    { calories: 495, protein_g: -1.5, carbs_g: -31.2, fat_g: 19 },
  );
});

test('context remaining switches between rest and workout targets', () => {
  setUserProfile({
    ...profile,
    macro_targets: {
      rest_day: { calories: 1000, protein_g: 100, carbs_g: 100, fat_g: 50 },
      workout_day: { calories: 1200, protein_g: 110, carbs_g: 140, fat_g: 55 },
    },
  });
  setDailyLog('2026-04-28', {
    date: '2026-04-28',
    is_workout_day: true,
    weigh_in_lbs: null,
    meals: [{ id: 'meal_1', logged_at: '2026-04-28T12:00:00.000Z', description: 'meal', macros: { calories: 500, protein_g: 60, carbs_g: 70, fat_g: 20 } }],
    totals: { calories: 500, protein_g: 60, carbs_g: 70, fat_g: 20 },
    adherence_flags: [],
  });

  const context = buildChatContextFromStorage({
    dateString: '2026-04-28',
    now: new Date('2026-04-28T16:34:00.000Z'),
  });

  assert.deepEqual(context.daily_log_today.target, {
    calories: 1200,
    protein_g: 110,
    carbs_g: 140,
    fat_g: 55,
  });
  assert.deepEqual(context.daily_log_today.remaining, {
    calories: 700,
    protein_g: 50,
    carbs_g: 70,
    fat_g: 35,
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

test('buildChatContextFromStorage filters malformed memory entries without crashing', () => {
  setMemory({
    entries: [
      null,
      { id: 'bad', category: 'preference' },
      {
        id: 'memory_1',
        content: 'hates mushrooms',
        category: 'preference',
        created_at: '2026-04-27T08:00:00.000Z',
        updated_at: '2026-04-27T08:00:00.000Z',
      },
      {
        id: 'memory_2',
        content: 'works doubles on weekends',
        category: 'schedule',
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

  assert.deepEqual(
    context.memory.map((entry) => ({ content: entry.content, category: entry.category })),
    [
      { content: 'hates mushrooms', category: 'preference' },
      { content: 'works doubles on weekends', category: 'schedule' },
    ],
  );
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
