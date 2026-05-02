// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getActiveMusicOption,
  getMusicOption,
  MUSIC_MASTER_VOLUME,
  MUSIC_OPTIONS,
  setActiveMusicOption,
  volumeForMusicOption,
} from './music.ts';

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

test('music options include mute and the classic bubby track only', () => {
  assert.deepEqual(
    MUSIC_OPTIONS.map((option) => option.id),
    ['mute', 'classic_bubby_8bit'],
  );
  assert.equal(getMusicOption('mute').src, null);
  assert.equal(getMusicOption('classic_bubby_8bit').label, '1');
  assert.equal(
    getMusicOption('classic_bubby_8bit').src,
    '/assets/music/classic-bubby-8bit.mp3',
  );
});

test('music defaults to mute and persists selected options', () => {
  assert.equal(getActiveMusicOption().id, 'mute');

  setActiveMusicOption('classic_bubby_8bit');
  assert.equal(globalThis.localStorage.getItem('bubby:music'), 'classic_bubby_8bit');
  assert.equal(getActiveMusicOption().id, 'classic_bubby_8bit');

  setActiveMusicOption('mute');
  assert.equal(globalThis.localStorage.getItem('bubby:music'), 'mute');
  assert.equal(getActiveMusicOption().id, 'mute');
});

test('music volume stays quiet and supports per-track multipliers', () => {
  assert.ok(MUSIC_MASTER_VOLUME >= 0.1);
  assert.ok(MUSIC_MASTER_VOLUME <= 0.14);
  assert.equal(volumeForMusicOption(getMusicOption('mute')), 0);
  assert.equal(
    volumeForMusicOption({
      ...getMusicOption('classic_bubby_8bit'),
      volumeMultiplier: 0.5,
    }),
    MUSIC_MASTER_VOLUME * 0.5,
  );
});
