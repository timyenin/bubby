// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'global.css'),
  'utf8',
);

function zIndexFor(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*z-index:\\s*(\\d+)`, 's'));
  return match ? Number(match[1]) : null;
}

test('theme picker layers above the case content', () => {
  const headerZIndex = zIndexFor('.app-header');
  const caseZIndex = zIndexFor('.bubby-case');
  const pickerZIndex = zIndexFor('.theme-picker');

  assert.notEqual(headerZIndex, null);
  assert.notEqual(caseZIndex, null);
  assert.notEqual(pickerZIndex, null);
  assert.ok(headerZIndex > caseZIndex);
  assert.ok(pickerZIndex > headerZIndex);
});
