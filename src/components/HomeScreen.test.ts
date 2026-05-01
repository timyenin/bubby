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
