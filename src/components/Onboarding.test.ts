// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'Onboarding.tsx'),
  'utf8',
);

test('onboarding rolls out assistant replies before showing the reveal', () => {
  assert.match(source, /DIALOGUE_CHARACTER_DELAY_MS/);
  assert.match(source, /getDialogueRolloutDelay/);

  const assistantMessageIndex = source.indexOf(
    "const assistantMessage = createMessage('assistant', visibleReply)",
  );
  const rolloutIndex = source.indexOf(
    'await startReplyRollout(assistantMessage.id, visibleReply)',
    assistantMessageIndex,
  );
  const revealIndex = source.indexOf("setPhase('reveal')", assistantMessageIndex);

  assert.ok(assistantMessageIndex >= 0);
  assert.ok(rolloutIndex > assistantMessageIndex);
  assert.ok(revealIndex > rolloutIndex);
});

test('onboarding sends readable local current time context', () => {
  assert.match(source, /buildCurrentTimeContext/);
  assert.doesNotMatch(source, /current_time:\s*new Date\(\)\.toISOString\(\)/);
});
