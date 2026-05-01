// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUBBY_COLOR_OPTIONS,
  DEFAULT_BUBBY_COLOR_ID,
  getBubbyColorOption,
  getNextBubbyColorId,
} from './bubbyColors.ts';

test('bubby color options include the original clear default and soft pastels', () => {
  assert.equal(BUBBY_COLOR_OPTIONS[0].id, DEFAULT_BUBBY_COLOR_ID);
  assert.equal(BUBBY_COLOR_OPTIONS[0].fillColor, null);
  assert.ok(BUBBY_COLOR_OPTIONS.length >= 9);
  assert.ok(BUBBY_COLOR_OPTIONS.some((option) => option.id === 'pastel_mint'));
  assert.ok(BUBBY_COLOR_OPTIONS.some((option) => option.id === 'pastel_aqua'));
});

test('bubby color cycling advances through options and wraps to default', () => {
  assert.equal(getNextBubbyColorId(DEFAULT_BUBBY_COLOR_ID), BUBBY_COLOR_OPTIONS[1].id);
  assert.equal(
    getNextBubbyColorId(BUBBY_COLOR_OPTIONS.at(-1)?.id),
    DEFAULT_BUBBY_COLOR_ID,
  );
  assert.equal(getNextBubbyColorId('missing-color'), BUBBY_COLOR_OPTIONS[1].id);
});

test('getBubbyColorOption falls back to the original clear default', () => {
  assert.equal(getBubbyColorOption(null).id, DEFAULT_BUBBY_COLOR_ID);
  assert.equal(getBubbyColorOption('missing-color').id, DEFAULT_BUBBY_COLOR_ID);
});
