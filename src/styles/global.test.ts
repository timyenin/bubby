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

function ruleFor(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 's'));
  return match?.groups?.body ?? '';
}

function mobileMediaBlock() {
  const start = css.indexOf('@media (max-width: 430px)');
  const end = css.indexOf('@media (min-width: 720px)', start);
  return start >= 0 && end >= 0 ? css.slice(start, end) : '';
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

test('image case themes hide the procedural noise overlay', () => {
  const imageThemeNoiseRule = ruleFor('.bubby-app[style*="--case-bg-image: url"]::after');

  assert.match(imageThemeNoiseRule, /display:\s*none/);
});

test('vital bars sit above the clamped LCD row', () => {
  const vitalLayoutRule = ruleFor('.case-content-with-vitals');

  assert.match(
    vitalLayoutRule,
    /grid-template-rows:\s*auto\s+clamp\(220px,\s*29dvh,\s*260px\)\s+minmax\(0,\s*1fr\)\s+auto/,
  );
});

test('vital bar fill uses segmented pixel blocks', () => {
  const fillRule = ruleFor('.vital-bar-fill');

  assert.match(fillRule, /repeating-linear-gradient/);
  assert.match(fillRule, /4px/);
  assert.match(fillRule, /6px/);
});

test('messages zone leaves bottom breathing room for newest messages', () => {
  const messagesRule = ruleFor('.messages-zone');

  assert.match(messagesRule, /padding:\s*12px\s+12px\s+18px/);
  assert.match(messagesRule, /scroll-padding-bottom:\s*18px/);
});

test('primary macro input row reserves room for the calorie label', () => {
  const primaryRule = ruleFor('.macro-input-row-primary');
  const primaryLabelRule = ruleFor('.macro-input-row-primary span');
  const mobileBlock = mobileMediaBlock();

  assert.match(primaryRule, /grid-template-columns:\s*1\.7rem\s+minmax\(0,\s*1fr\)/);
  assert.match(primaryRule, /gap:\s*6px/);
  assert.match(primaryLabelRule, /white-space:\s*nowrap/);
  assert.match(mobileBlock, /\.macro-input-row\s*\{[^}]*grid-template-columns:\s*0\.8rem\s+minmax\(54px,\s*1fr\)/s);
  assert.match(mobileBlock, /\.macro-input-row-primary\s*\{[^}]*grid-template-columns:\s*1\.7rem\s+minmax\(0,\s*1fr\)/s);
  assert.ok(
    mobileBlock.indexOf('.macro-input-row-primary') > mobileBlock.indexOf('.macro-input-row'),
  );
});
