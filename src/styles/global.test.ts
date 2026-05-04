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
  const match = css.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{[^}]*z-index:\\s*(\\d+)`, 's'));
  return match ? Number(match[1]) : null;
}

function ruleFor(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 's'));
  return match?.groups?.body ?? '';
}

function ruleForContaining(selector, requiredText) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = css.matchAll(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 'gs'));

  for (const match of matches) {
    const body = match.groups?.body ?? '';
    if (body.includes(requiredText)) {
      return body;
    }
  }

  return '';
}

function mobileMediaBlock() {
  const start = css.indexOf('@media (max-width: 430px)');
  const end = css.indexOf('@media (min-width: 720px)', start);
  return start >= 0 && end >= 0 ? css.slice(start, end) : '';
}

function touchMediaBlock() {
  const start = css.indexOf('@media (hover: none) and (pointer: coarse)');
  const iosStart = css.indexOf('@supports (-webkit-touch-callout: none)', start);
  const mobileStart = css.indexOf('@media (max-width: 430px)', start);
  const end = iosStart >= 0 ? iosStart : mobileStart;
  return start >= 0 && end >= 0 ? css.slice(start, end) : '';
}

function iosInputBlock() {
  const match = css.match(
    /@supports\s*\(-webkit-touch-callout:\s*none\)\s*\{[\s\S]*?@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\.chat-input\s*\{(?<body>[^}]*)\}/,
  );
  return match?.groups?.body ?? '';
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

test('sent image thumbnails are hardened for mobile tap and callout behavior', () => {
  const thumbnailButtonRule = ruleFor('.message-thumbnail-button');
  const thumbnailRule = ruleFor('.message-thumbnail');
  const globalImageRule = ruleFor('img');
  const globalButtonRule = ruleFor('button');

  assert.match(thumbnailButtonRule, /touch-action:\s*manipulation/);
  assert.match(thumbnailButtonRule, /-webkit-tap-highlight-color:\s*transparent/);
  assert.match(thumbnailButtonRule, /-webkit-touch-callout:\s*none/);
  assert.match(thumbnailButtonRule, /user-select:\s*none/);
  assert.match(thumbnailButtonRule, /-webkit-user-select:\s*none/);
  assert.match(thumbnailButtonRule, /cursor:\s*pointer/);
  assert.match(thumbnailRule, /pointer-events:\s*none/);
  assert.match(thumbnailRule, /user-select:\s*none/);
  assert.match(thumbnailRule, /-webkit-user-select:\s*none/);
  assert.match(thumbnailRule, /-webkit-touch-callout:\s*none/);
  assert.doesNotMatch(globalImageRule, /pointer-events:\s*none/);
  assert.doesNotMatch(globalImageRule, /-webkit-touch-callout:\s*none/);
  assert.doesNotMatch(globalButtonRule, /-webkit-touch-callout:\s*none/);
});

test('chat input sizing avoids clipping while scoping iOS anti-zoom separately', () => {
  const chatBarRule = ruleFor('.chat-bar');
  const inputShellRule = ruleFor('.chat-input-shell');
  const inputRule = ruleForContaining('.chat-input', 'height: 44px');
  const touchBlock = touchMediaBlock();
  const iosRule = iosInputBlock();
  const chatInputRules = Array.from(
    css.matchAll(/(?:^|\n)\.chat-input\s*\{(?<body>[^}]*)\}/gs),
    (match) => match.groups?.body ?? '',
  ).join('\n');

  assert.match(chatBarRule, /overflow:\s*visible/);
  assert.match(inputShellRule, /overflow:\s*visible/);
  assert.match(inputRule, /height:\s*44px/);
  assert.match(inputRule, /min-height:\s*44px/);
  assert.match(inputRule, /display:\s*block/);
  assert.match(inputRule, /appearance:\s*none/);
  assert.match(inputRule, /resize:\s*none/);
  assert.match(inputRule, /white-space:\s*nowrap/);
  assert.match(inputRule, /font-size:\s*0\.66rem/);
  assert.doesNotMatch(inputRule, /font-size:\s*0\.72rem/);
  assert.doesNotMatch(inputRule, /font-size:\s*0\.82rem/);
  assert.doesNotMatch(inputRule, /font-size:\s*16px/);
  assert.match(inputRule, /line-height:\s*1\.5/);
  assert.match(inputRule, /padding:\s*12px\s+14px\s+4px/);
  assert.match(inputRule, /overflow:\s*hidden/);
  assert.doesNotMatch(chatInputRules, /transform:\s*scale/);
  assert.doesNotMatch(touchBlock, /\.chat-input\s*\{/);
  assert.doesNotMatch(touchBlock, /width:\s*147%/);
  assert.doesNotMatch(touchBlock, /margin-block:\s*-/);
  assert.match(iosRule, /font-size:\s*16px/);
  assert.match(iosRule, /transform:\s*scale\(0\.66\)/);
  assert.match(iosRule, /width:\s*calc\(100%\s*\/\s*0\.66\)/);
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

test('lcd music notes are clipped inside the lcd window and ignore pointer events', () => {
  const notesRule = ruleFor('.lcd-music-notes');
  const noteRule = ruleFor('.lcd-music-note');

  assert.match(notesRule, /position:\s*absolute/);
  assert.match(notesRule, /inset:\s*0/);
  assert.match(notesRule, /overflow:\s*hidden/);
  assert.match(notesRule, /pointer-events:\s*none/);
  assert.match(noteRule, /position:\s*absolute/);
  assert.match(noteRule, /animation:/);
});

test('info modal uses compact themed panel styles', () => {
  const backdropRule = ruleFor('.info-modal-backdrop');
  const panelRule = ruleFor('.info-modal-panel');
  const reportRule = ruleFor('.info-report-form textarea');

  assert.match(backdropRule, /position:\s*absolute/);
  assert.match(backdropRule, /z-index:\s*30/);
  assert.match(panelRule, /font-family:\s*"Dogica"/);
  assert.match(panelRule, /var\(--theme-picker-bg\)/);
  assert.match(reportRule, /resize:\s*vertical/);
});
