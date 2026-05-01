// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DIALOGUE_CHARACTER_DELAY_MS,
  DIALOGUE_NEWLINE_DELAY_MS,
  getDialogueRolloutDelay,
  getRevealedDialogueText,
} from './dialogueRollout.ts';

test('getRevealedDialogueText truncates text to the revealed length', () => {
  assert.equal(getRevealedDialogueText('hello bubby', 5), 'hello');
  assert.equal(getRevealedDialogueText('hello bubby', 99), 'hello bubby');
  assert.equal(getRevealedDialogueText('hello bubby', -4), '');
});

test('getDialogueRolloutDelay pauses longer after newlines', () => {
  assert.equal(getDialogueRolloutDelay('hi\nthere', 1), DIALOGUE_CHARACTER_DELAY_MS);
  assert.equal(getDialogueRolloutDelay('hi\nthere', 3), DIALOGUE_NEWLINE_DELAY_MS);
});
