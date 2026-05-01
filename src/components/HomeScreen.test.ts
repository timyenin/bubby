// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'HomeScreen.tsx'),
  'utf8',
);

test('home screen renders vital bars before the LCD in the case layout', () => {
  const caseContentStart = source.indexOf('case-content-with-vitals');
  const vitalBarsIndex = source.indexOf('<VitalBars', caseContentStart);
  const lcdIndex = source.indexOf('<LCD', caseContentStart);

  assert.ok(caseContentStart >= 0);
  assert.ok(vitalBarsIndex >= 0);
  assert.ok(lcdIndex >= 0);
  assert.ok(vitalBarsIndex < lcdIndex);
});

test('controlled home screen can receive external reply rollout state', () => {
  assert.match(source, /rollingMessageId\?: string \| null/);
  assert.match(source, /revealedLength\?: number/);
  assert.match(source, /resolvedRollingMessageId/);
  assert.match(source, /resolvedRevealedLength/);
  assert.match(
    source,
    /const resolvedRollingMessageId = isControlledChat\s*\?\s*controlledRollingMessageId\s*:\s*homeRollingMessageId;/,
  );
  assert.match(
    source,
    /const resolvedRevealedLength = isControlledChat\s*\?\s*controlledRevealedLength\s*:\s*homeRevealedLength;/,
  );
});
