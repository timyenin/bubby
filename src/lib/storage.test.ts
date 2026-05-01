// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addMemoryEntry,
  appendMessageToHistory,
  clearAll,
  deleteDailyLog,
  getMemory,
  deleteUserProfile,
  getDailyLog,
  getOnboardingComplete,
  getOrInitDailyLog,
  getUserProfile,
  incrementVital,
  removeMemoryByContent,
  removeMemoryEntry,
  setBubbyState,
  setDailyLog,
  setMemory,
  setOnboardingComplete,
  setUserProfile,
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

test('appendMessageToHistory caps conversation history at 100 messages', () => {
  for (let index = 0; index < 105; index += 1) {
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

  assert.equal(history.messages.length, 100);
  assert.equal(history.messages[0].content, 'message 6');
  assert.equal(history.messages.at(-1).content, 'latest');
});

test('appendMessageToHistory persists optional image data on messages', () => {
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
    fullImages,
  });
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
  setOnboardingComplete(true);
  globalThis.localStorage.setItem('other:key', 'keep');

  clearAll();

  assert.equal(getUserProfile(), null);
  assert.equal(getMemory(), null);
  assert.equal(getOnboardingComplete(), false);
  assert.equal(globalThis.localStorage.getItem('other:key'), 'keep');
});
