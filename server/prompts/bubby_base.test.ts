// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const prompt = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'bubby_base.md'),
  'utf8',
);

test('base prompt names daily meal log as source of truth separate from memory', () => {
  assert.match(prompt, /daily meal log source of truth/i);
  assert.match(prompt, /daily_log_today/i);
  assert.match(prompt, /daily_log_yesterday/i);
  assert.match(prompt, /do not invent meals/i);
  assert.match(prompt, /memory .* stable .* preferences/i);
  assert.match(prompt, /recent conversation is not accounting truth/i);
});

test('base prompt documents safe daily log correction actions', () => {
  assert.match(prompt, /delete_meal:/);
  assert.match(prompt, /update_meal:/);
  assert.match(prompt, /replace_daily_log:/);
  assert.match(prompt, /do not pretend the correction happened unless you emit/i);
  assert.match(prompt, /complete corrected day/i);
});

test('base prompt keeps exact pantry macro instruction coupled to memory and pantry update', () => {
  assert.match(prompt, /save it as a memory AND emit an update_pantry_macros action/i);
});
