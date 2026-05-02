// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ChatMessages.tsx'),
  'utf8',
);

test('chat messages scroll to the bottom after layout settles', () => {
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /cancelAnimationFrame/);
  assert.match(source, /scrollTop\s*=\s*messagesElement\.scrollHeight/);
});
