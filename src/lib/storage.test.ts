// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addMemoryEntry,
  appendMessageToHistory,
  canonicalizeDailyLog,
  clearAll,
  collapseDuplicateMeals,
  deleteDailyLog,
  getMemory,
  getBubbyColorId,
  getCanonicalDailyLog,
  getConversationHistory,
  deleteUserProfile,
  getDailyLog,
  getOnboardingComplete,
  getOrInitCanonicalDailyLog,
  getOrInitDailyLog,
  getPantry,
  getUserProfile,
  incrementVital,
  normalizeMacroTotals,
  repairDailyLogs,
  removeMemoryByContent,
  removeMemoryEntry,
  setBubbyState,
  setBubbyColorId,
  setConversationHistory,
  setDailyLog,
  setMemory,
  setOnboardingComplete,
  setPantry,
  setUserProfile,
  sumMealTotals,
  updateMemoryEntry,
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

  seedItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }

  clear() {
    this.#items.clear();
  }
}

const CONVERSATION_HISTORY_KEY = 'bubby:conversation_history';

class RejectingFullImageStorage extends MemoryStorage {
  setItem(key, value) {
    if (key === CONVERSATION_HISTORY_KEY && String(value).includes('full-image')) {
      throw new DOMException('quota blocked full image payload', 'QuotaExceededError');
    }

    super.setItem(key, value);
  }
}

class LimitedConversationStorage extends MemoryStorage {
  constructor(maxConversationBytes) {
    super();
    this.maxConversationBytes = maxConversationBytes;
  }

  setItem(key, value) {
    if (key === CONVERSATION_HISTORY_KEY && new TextEncoder().encode(String(value)).length > this.maxConversationBytes) {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    }

    super.setItem(key, value);
  }
}

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test('user profile helpers roundtrip JSON values', () => {
  const profile = {
    name: 'Tim',
    age: 22,
    macro_targets: {
      workout_day: { calories: 1750, protein_g: 170, carbs_g: 130, fat_g: 50 },
    },
  };

  setUserProfile(profile);
  assert.deepEqual(getUserProfile(), profile);

  deleteUserProfile();
  assert.equal(getUserProfile(), null);
});

test('onboarding completion helpers roundtrip boolean values', () => {
  assert.equal(getOnboardingComplete(), false);

  setOnboardingComplete(true);
  assert.equal(getOnboardingComplete(), true);

  setOnboardingComplete(false);
  assert.equal(getOnboardingComplete(), false);
});

test('daily log helpers use date-scoped keys', () => {
  const log = {
    date: '2026-04-26',
    is_workout_day: false,
    meals: [],
    totals: { calories: 420, protein_g: 45, carbs_g: 38, fat_g: 12 },
    adherence_flags: [],
  };

  setDailyLog('2026-04-26', log);
  assert.deepEqual(getDailyLog('2026-04-26'), log);
  assert.equal(getDailyLog('2026-04-27'), null);

  deleteDailyLog('2026-04-26');
  assert.equal(getDailyLog('2026-04-26'), null);
});

test('getOrInitDailyLog returns and persists an empty log when none exists', () => {
  const log = getOrInitDailyLog('2026-04-26');

  assert.deepEqual(log, {
    date: '2026-04-26',
    is_workout_day: false,
    weigh_in_lbs: null,
    meals: [],
    totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    adherence_flags: [],
  });
  assert.deepEqual(getDailyLog('2026-04-26'), log);
});

test('appendMessageToHistory caps conversation history at 300 messages', () => {
  for (let index = 0; index < 305; index += 1) {
    appendMessageToHistory({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message ${index}`,
      timestamp: `2026-04-26T12:${String(index).padStart(2, '0')}:00-04:00`,
    });
  }

  const history = appendMessageToHistory({
    role: 'assistant',
    content: 'latest',
    timestamp: '2026-04-26T14:00:00-04:00',
  });

  assert.equal(history.messages.length, 300);
  assert.equal(history.messages[0].content, 'message 6');
  assert.equal(history.messages.at(-1).content, 'latest');
});

test('appendMessageToHistory persists only thumbnails for image messages', () => {
  const thumbnail = 'data:image/jpeg;base64,small-thumb';
  const thumbnails = [
    'data:image/jpeg;base64,small-thumb-1',
    'data:image/jpeg;base64,small-thumb-2',
  ];
  const fullImages = [
    'data:image/jpeg;base64,full-image-1',
    'data:image/jpeg;base64,full-image-2',
  ];

  const history = appendMessageToHistory({
    role: 'user',
    content: 'this is lunch',
    timestamp: '2026-04-28T12:00:00-04:00',
    thumbnail,
    thumbnails,
    fullImages,
  });

  assert.equal(history.messages.length, 1);
  assert.deepEqual(history.messages[0], {
    role: 'user',
    content: 'this is lunch',
    timestamp: '2026-04-28T12:00:00-04:00',
    thumbnail,
    thumbnails,
  });
  assert.equal('fullImages' in history.messages[0], false);
  assert.doesNotMatch(globalThis.localStorage.getItem(CONVERSATION_HISTORY_KEY), /full-image/);
});

test('getConversationHistory prunes old persisted fullImages without touching other storage keys', () => {
  setUserProfile({ name: 'Tim' });
  setPantry({ items: [{ name: 'rice', category: 'carb', always: true }] });
  setDailyLog('2026-04-28', {
    date: '2026-04-28',
    is_workout_day: false,
    meals: [],
    totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    adherence_flags: [],
  });
  setMemory({
    entries: [{ id: 'memory_1', content: 'likes rice', category: 'preference' }],
    last_updated: '2026-04-28T12:00:00.000Z',
  });
  const dailyLogBefore = globalThis.localStorage.getItem('bubby:daily_log:2026-04-28');
  const memoryBefore = globalThis.localStorage.getItem('bubby:memory');

  globalThis.localStorage.seedItem(CONVERSATION_HISTORY_KEY, JSON.stringify({
    messages: [
      {
        id: 'message_1',
        role: 'user',
        content: 'lunch',
        timestamp: '2026-04-28T12:00:00.000Z',
        thumbnail: 'data:image/jpeg;base64,thumb-1',
        thumbnails: ['data:image/jpeg;base64,thumb-1', 'data:image/jpeg;base64,thumb-2'],
        fullImages: ['data:image/jpeg;base64,full-image-1'],
      },
      {
        id: 'message_2',
        role: 'assistant',
        content: 'logged it.',
        timestamp: '2026-04-28T12:01:00.000Z',
      },
    ],
  }));

  const history = getConversationHistory();

  assert.deepEqual(history.messages.map((message) => message.id), ['message_1', 'message_2']);
  assert.deepEqual(history.messages[0].thumbnails, ['data:image/jpeg;base64,thumb-1', 'data:image/jpeg;base64,thumb-2']);
  assert.equal('fullImages' in history.messages[0], false);
  assert.doesNotMatch(globalThis.localStorage.getItem(CONVERSATION_HISTORY_KEY), /full-image/);
  assert.equal(globalThis.localStorage.getItem('bubby:daily_log:2026-04-28'), dailyLogBefore);
  assert.equal(globalThis.localStorage.getItem('bubby:memory'), memoryBefore);
  assert.deepEqual(getPantry(), { items: [{ name: 'rice', category: 'carb', always: true }] });
});

test('conversation history write retries with sanitized history when fullImages exceed quota', () => {
  globalThis.localStorage = new RejectingFullImageStorage();

  const history = appendMessageToHistory({
    role: 'user',
    content: 'photo',
    timestamp: '2026-04-28T12:00:00.000Z',
    thumbnail: 'data:image/jpeg;base64,thumb',
    fullImages: ['data:image/jpeg;base64,full-image'],
  });

  assert.equal(history.messages.length, 1);
  assert.equal(history.messages[0].thumbnail, 'data:image/jpeg;base64,thumb');
  assert.equal('fullImages' in history.messages[0], false);
  assert.doesNotMatch(globalThis.localStorage.getItem(CONVERSATION_HISTORY_KEY), /full-image/);
});

test('conversation history quota recovery prunes old image thumbnails before trimming text history', () => {
  const textMessages = Array.from({ length: 50 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `meal planning step ${index}`,
    timestamp: `2026-04-28T10:${String(index).padStart(2, '0')}:00.000Z`,
  }));
  const imageMessages = Array.from({ length: 12 }, (_, index) => ({
    role: 'user',
    content: `photo ${index}`,
    timestamp: `2026-04-28T11:${String(index).padStart(2, '0')}:00.000Z`,
    thumbnail: `data:image/jpeg;base64,old-image-thumb-${index}-${'x'.repeat(180)}`,
    thumbnails: [`data:image/jpeg;base64,old-image-thumb-${index}-${'x'.repeat(180)}`],
  }));
  const candidateWithOnlyRecentImageThumbnails = {
    messages: [...textMessages, ...imageMessages, {
      role: 'assistant',
      content: 'latest',
      timestamp: '2026-04-28T12:00:00.000Z',
    }].map((message, index, messages) => {
      const recentImageStart = messages.length - 1 - 10;
      if (!message.thumbnail || index >= recentImageStart) {
        return message;
      }

      const { thumbnail, thumbnails, ...rest } = message;
      return rest;
    }),
  };
  globalThis.localStorage = new LimitedConversationStorage(
    new TextEncoder().encode(JSON.stringify(candidateWithOnlyRecentImageThumbnails)).length + 20,
  );
  globalThis.localStorage.seedItem(CONVERSATION_HISTORY_KEY, JSON.stringify({ messages: [...textMessages, ...imageMessages] }));

  const history = appendMessageToHistory({
    role: 'assistant',
    content: 'latest',
    timestamp: '2026-04-28T12:00:00.000Z',
  });
  const raw = globalThis.localStorage.getItem(CONVERSATION_HISTORY_KEY);

  assert.equal(history.messages.filter((message) => message.content.startsWith('meal planning step')).length, 50);
  assert.match(raw, /meal planning step 0/);
  assert.doesNotMatch(raw, /old-image-thumb-0/);
  assert.match(raw, /old-image-thumb-11/);
});

test('conversation history trims text only after all image thumbnails are removed', () => {
  const textMessages = Array.from({ length: 80 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `long planning message ${index} ${'x'.repeat(80)}`,
    timestamp: `2026-04-28T10:${String(index).padStart(2, '0')}:00.000Z`,
  }));
  const imageMessages = Array.from({ length: 4 }, (_, index) => ({
    role: 'user',
    content: `photo ${index}`,
    timestamp: `2026-04-28T11:${String(index).padStart(2, '0')}:00.000Z`,
    thumbnail: `data:image/jpeg;base64,thumb-${index}-${'y'.repeat(800)}`,
    thumbnails: [`data:image/jpeg;base64,thumb-${index}-${'y'.repeat(800)}`],
  }));
  const noImagePayloadMessages = [...textMessages, ...imageMessages, {
    role: 'assistant',
    content: 'latest',
    timestamp: '2026-04-28T12:00:00.000Z',
  }].map((message) => {
    const { thumbnail, thumbnails, ...rest } = message;
    return rest;
  });
  const lastResortMessages = noImagePayloadMessages.slice(-40);
  globalThis.localStorage = new LimitedConversationStorage(
    new TextEncoder().encode(JSON.stringify({ messages: lastResortMessages })).length + 20,
  );
  globalThis.localStorage.seedItem(CONVERSATION_HISTORY_KEY, JSON.stringify({ messages: [...textMessages, ...imageMessages] }));

  const history = appendMessageToHistory({
    role: 'assistant',
    content: 'latest',
    timestamp: '2026-04-28T12:00:00.000Z',
  });
  const raw = globalThis.localStorage.getItem(CONVERSATION_HISTORY_KEY);

  assert.equal(raw.includes('data:image/jpeg;base64,thumb-'), false);
  assert.equal(history.messages.at(-1).content, 'latest');
  assert.ok(history.messages.length < noImagePayloadMessages.length);
});

test('setConversationHistory persists 300 text messages without fullImages', () => {
  const messages = Array.from({ length: 300 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message ${index}`,
    timestamp: `2026-04-28T10:${String(index).padStart(2, '0')}:00.000Z`,
    fullImages: [`data:image/jpeg;base64,full-image-${index}`],
  }));

  const history = setConversationHistory({ messages });
  const raw = globalThis.localStorage.getItem(CONVERSATION_HISTORY_KEY);

  assert.equal(history.messages.length, 300);
  assert.equal(history.messages[0].content, 'message 0');
  assert.equal(history.messages.at(-1).content, 'message 299');
  assert.equal(history.messages.some((message) => 'fullImages' in message), false);
  assert.doesNotMatch(raw, /full-image/);
});

test('normalizeMacroTotals rounds calories and macro grams safely', () => {
  assert.deepEqual(
    normalizeMacroTotals({
      calories: '419.6',
      protein_g: '46.54',
      carbs_g: '131.20000000000002',
      fat_g: Number.NaN,
    }),
    { calories: 420, protein_g: 46.5, carbs_g: 131.2, fat_g: 0 },
  );
});

test('sumMealTotals recomputes rounded totals from meals without float artifacts', () => {
  const meals = [
    { id: 'breakfast', description: 'breakfast', logged_at: '2026-05-02T08:00:00.000Z', macros: { calories: 627, protein_g: 67.5, carbs_g: 46.5, fat_g: 16.5 } },
    { id: 'lunch', description: 'lunch', logged_at: '2026-05-02T12:00:00.000Z', macros: { calories: 395, protein_g: 50, carbs_g: 44, fat_g: 4.5 } },
    { id: 'grapes', description: '3 grapes', logged_at: '2026-05-02T13:00:00.000Z', macros: { calories: 3, protein_g: 0, carbs_g: 0.7, fat_g: 0 } },
    { id: 'tomatoes', description: '3 cherry tomatoes', logged_at: '2026-05-02T14:00:00.000Z', macros: { calories: 10, protein_g: 0, carbs_g: 2, fat_g: 0 } },
    { id: 'yogurt', description: 'yogurt bowl', logged_at: '2026-05-02T18:00:00.000Z', macros: { calories: 420, protein_g: 44, carbs_g: 38, fat_g: 10 } },
  ];

  assert.deepEqual(sumMealTotals(meals), {
    calories: 1455,
    protein_g: 161.5,
    carbs_g: 131.2,
    fat_g: 31,
  });
});

test('canonicalizeDailyLog repairs stale totals and missing arrays without erasing meals', () => {
  const canonical = canonicalizeDailyLog({
    date: '2026-05-02',
    is_workout_day: true,
    meals: [
      {
        id: 'meal_1',
        logged_at: '2026-05-02T08:00:00.000Z',
        description: 'yogurt',
        macros: { calories: 200, protein_g: 20.04, carbs_g: 12.05, fat_g: 3.94 },
      },
    ],
    totals: { calories: 9999, protein_g: Infinity, carbs_g: 999, fat_g: 999 },
  });

  assert.equal(canonical.date, '2026-05-02');
  assert.equal(canonical.is_workout_day, true);
  assert.deepEqual(canonical.totals, { calories: 200, protein_g: 20, carbs_g: 12.1, fat_g: 3.9 });
  assert.deepEqual(canonical.adherence_flags, []);
  assert.equal(canonical.meals.length, 1);
});

test('canonical daily log getters repair stored malformed logs', () => {
  setDailyLog('2026-05-02', {
    date: '2026-05-02',
    is_workout_day: false,
    meals: [
      {
        id: 'meal_1',
        logged_at: '2026-05-02T08:00:00.000Z',
        description: 'eggs',
        macros: { calories: 210, protein_g: 18, carbs_g: 1, fat_g: 15 },
      },
    ],
    totals: { calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1 },
    adherence_flags: [],
  });

  assert.deepEqual(getCanonicalDailyLog('2026-05-02').totals, {
    calories: 210,
    protein_g: 18,
    carbs_g: 1,
    fat_g: 15,
  });
  assert.deepEqual(getDailyLog('2026-05-02').totals, getCanonicalDailyLog('2026-05-02').totals);
  assert.deepEqual(getOrInitCanonicalDailyLog('2026-05-03').totals, {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  });
});

test('collapseDuplicateMeals removes only exact duplicates inside the short retry window', () => {
  const meals = [
    { id: 'meal_1', logged_at: '2026-05-02T12:00:00.000Z', description: ' Chicken Bowl ', macros: { calories: 500, protein_g: 40, carbs_g: 50, fat_g: 12 } },
    { id: 'meal_2', logged_at: '2026-05-02T12:02:00.000Z', description: 'chicken   bowl', macros: { calories: 500, protein_g: 40, carbs_g: 50, fat_g: 12 } },
    { id: 'meal_3', logged_at: '2026-05-02T15:30:00.000Z', description: 'chicken bowl', macros: { calories: 500, protein_g: 40, carbs_g: 50, fat_g: 12 } },
    { id: 'meal_4', logged_at: '2026-05-02T15:31:00.000Z', description: 'chicken bowl', macros: { calories: 510, protein_g: 40, carbs_g: 50, fat_g: 12 } },
  ];

  assert.deepEqual(
    collapseDuplicateMeals(meals).map((meal) => meal.id),
    ['meal_1', 'meal_3', 'meal_4'],
  );
});

test('repairDailyLogs recomputes stale totals and collapses obvious duplicate recent meals', () => {
  setDailyLog('2026-05-02', {
    date: '2026-05-02',
    is_workout_day: false,
    weigh_in_lbs: null,
    meals: [
      { id: 'meal_1', logged_at: '2026-05-02T12:00:00.000Z', description: 'rice bowl', macros: { calories: 400, protein_g: 30, carbs_g: 50, fat_g: 8 } },
      { id: 'meal_2', logged_at: '2026-05-02T12:01:30.000Z', description: 'rice bowl', macros: { calories: 400, protein_g: 30, carbs_g: 50, fat_g: 8 } },
      { id: 'meal_3', logged_at: '2026-05-02T18:00:00.000Z', description: 'rice bowl', macros: { calories: 400, protein_g: 30, carbs_g: 50, fat_g: 8 } },
    ],
    totals: { calories: 999, protein_g: 999, carbs_g: 999, fat_g: 999 },
    adherence_flags: [],
  });

  repairDailyLogs('2026-05-02', 1);

  const repaired = getDailyLog('2026-05-02');
  assert.deepEqual(repaired.meals.map((meal) => meal.id), ['meal_1', 'meal_3']);
  assert.deepEqual(repaired.totals, { calories: 800, protein_g: 60, carbs_g: 100, fat_g: 16 });
});

test('bubby color helpers roundtrip the selected color id', () => {
  assert.equal(getBubbyColorId(), 'default');

  setBubbyColorId('pastel_mint');
  assert.equal(getBubbyColorId(), 'pastel_mint');
});

test('incrementVital clamps vital bars between 0 and 100', () => {
  setBubbyState({
    vitality: 90,
    mood: 5,
    strength: 50,
    energy: 80,
    current_animation: 'idle',
    is_sick: false,
    is_sleepy: false,
    last_updated: '2026-04-26T14:32:00-04:00',
  });

  assert.equal(incrementVital('vitality', 25).vitality, 100);
  assert.equal(incrementVital('mood', -10).mood, 0);
});

test('addMemoryEntry creates a new entry with generated ID and timestamps', () => {
  const memory = addMemoryEntry({
    content: 'hates mushrooms',
    category: 'preference',
  });

  assert.equal(memory.entries.length, 1);
  assert.match(memory.entries[0].id, /^memory_\d+_[a-z0-9]+$/);
  assert.equal(memory.entries[0].content, 'hates mushrooms');
  assert.equal(memory.entries[0].category, 'preference');
  assert.ok(Date.parse(memory.entries[0].created_at));
  assert.ok(Date.parse(memory.entries[0].updated_at));
  assert.equal(memory.last_updated, memory.entries[0].updated_at);
});

test('addMemoryEntry deduplicates by case-insensitive content match and updates updated_at', () => {
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

  const memory = addMemoryEntry({
    content: '  HATES MUSHROOMS  ',
    category: 'rule',
  });

  assert.equal(memory.entries.length, 1);
  assert.equal(memory.entries[0].id, 'memory_existing');
  assert.equal(memory.entries[0].content, 'HATES MUSHROOMS');
  assert.equal(memory.entries[0].category, 'rule');
  assert.notEqual(memory.entries[0].updated_at, '2026-04-27T08:00:00.000Z');
});

test('removeMemoryEntry removes by ID', () => {
  setMemory({
    entries: [
      {
        id: 'memory_keep',
        content: 'likes rice',
        category: 'preference',
        created_at: '2026-04-27T08:00:00.000Z',
        updated_at: '2026-04-27T08:00:00.000Z',
      },
      {
        id: 'memory_remove',
        content: 'hates mushrooms',
        category: 'preference',
        created_at: '2026-04-27T08:00:00.000Z',
        updated_at: '2026-04-27T08:00:00.000Z',
      },
    ],
    last_updated: '2026-04-27T08:00:00.000Z',
  });

  const memory = removeMemoryEntry('memory_remove');

  assert.deepEqual(memory.entries.map((entry) => entry.id), ['memory_keep']);
});

test('removeMemoryByContent removes by case-insensitive content match', () => {
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

  const memory = removeMemoryByContent('  HATES MUSHROOMS ');

  assert.equal(memory.entries.length, 0);
});

test('removeMemoryByContent returns null when no match exists', () => {
  setMemory({
    entries: [
      {
        id: 'memory_1',
        content: 'likes rice',
        category: 'preference',
        created_at: '2026-04-27T08:00:00.000Z',
        updated_at: '2026-04-27T08:00:00.000Z',
      },
    ],
    last_updated: '2026-04-27T08:00:00.000Z',
  });

  assert.equal(removeMemoryByContent('hates mushrooms'), null);
  assert.equal(getMemory().entries.length, 1);
});

test('updateMemoryEntry updates content and category and sets updated_at', () => {
  setMemory({
    entries: [
      {
        id: 'memory_1',
        content: 'likes rice',
        category: 'preference',
        created_at: '2026-04-27T08:00:00.000Z',
        updated_at: '2026-04-27T08:00:00.000Z',
      },
    ],
    last_updated: '2026-04-27T08:00:00.000Z',
  });

  const memory = updateMemoryEntry('memory_1', {
    content: 'loves rice bowls',
    category: 'context',
  });

  assert.equal(memory.entries[0].content, 'loves rice bowls');
  assert.equal(memory.entries[0].category, 'context');
  assert.notEqual(memory.entries[0].updated_at, '2026-04-27T08:00:00.000Z');
});

test('clearAll removes only bubby namespaced keys', () => {
  setUserProfile({ name: 'Tim' });
  addMemoryEntry({ content: 'likes rice', category: 'preference' });
  setBubbyColorId('pastel_lavender');
  setOnboardingComplete(true);
  globalThis.localStorage.setItem('other:key', 'keep');

  clearAll();

  assert.equal(getUserProfile(), null);
  assert.equal(getMemory(), null);
  assert.equal(getBubbyColorId(), 'default');
  assert.equal(getOnboardingComplete(), false);
  assert.equal(globalThis.localStorage.getItem('other:key'), 'keep');
});
