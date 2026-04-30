// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getActionFrameDelayMs,
  getIdleFrameDelayMs,
  getNextIdleFrameIndex,
  getSpriteBackgroundPositionPercent,
} from './idleAnimation.ts';

test('idle frame timing mixes long holds with short blink frames', () => {
  assert.equal(getIdleFrameDelayMs(0, () => 0.5), 5000);
  assert.equal(getIdleFrameDelayMs(1, () => 0.5), 225);
});

test('action frame timing stays in the snappy one-shot range', () => {
  assert.equal(getActionFrameDelayMs(() => 0), 150);
  assert.equal(getActionFrameDelayMs(() => 1), 200);
});

test('idle frames loop through manifest frame count', () => {
  assert.equal(getNextIdleFrameIndex(0, 2), 1);
  assert.equal(getNextIdleFrameIndex(1, 2), 0);
});

test('sprite sheet position maps frame offset onto the combined sheet', () => {
  assert.equal(
    getSpriteBackgroundPositionPercent({
      frameIndex: 1,
      frameWidth: 48,
      sheetWidth: 1104,
      xOffset: 0,
    }),
    4.5455,
  );
});
