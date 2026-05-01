// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getActiveTheme,
  setActiveTheme,
  THEMES,
} from './themes.ts';

class MemoryStorage {
  #items = new Map();

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }
}

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test('getActiveTheme defaults to pink stars when no theme is saved', () => {
  assert.equal(getActiveTheme().id, 'pink_stars');
  assert.equal(getActiveTheme().backgroundImage, '/assets/themes/pink_stars.png');
});

test('setActiveTheme persists the selected theme id', () => {
  const theme = setActiveTheme('rainbow');

  assert.equal(theme.id, 'rainbow');
  assert.equal(globalThis.localStorage.getItem('bubby:theme'), 'rainbow');
  assert.equal(getActiveTheme().id, 'rainbow');
});

test('getActiveTheme falls back to pink stars for unknown saved theme ids', () => {
  globalThis.localStorage.setItem('bubby:theme', 'missing-theme');

  assert.equal(getActiveTheme().id, 'pink_stars');
  assert.equal(THEMES[0].id, 'pink_stars');
});

test('THEMES includes rainbow as a non-default alternate theme', () => {
  assert.ok(THEMES.some((theme) => theme.id === 'rainbow'));
});
