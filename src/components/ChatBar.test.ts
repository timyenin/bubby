// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ChatBar.tsx'),
  'utf8',
);

test('chat bar uses a one-line textarea for the visible composer', () => {
  assert.match(source, /<textarea\s+className="chat-input"/);
  assert.match(source, /rows=\{1\}/);
  assert.match(source, /wrap="off"/);
  assert.doesNotMatch(source, /<input\s+className="chat-input"[\s\S]*type="text"/);
});

test('chat bar submits on Enter without enabling multiline text', () => {
  assert.match(source, /handleInputKeyDown/);
  assert.match(source, /event\.key !== 'Enter'/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /if \(canSend\) \{\s*onSubmit\?\.\(\);\s*\}/s);
  assert.match(source, /onKeyDown=\{handleInputKeyDown\}/);
});

test('chat bar preserves controlled textarea behavior and attachment input', () => {
  assert.match(source, /value=\{value\}/);
  assert.match(source, /onChange=\{\(event\) => onChange\?\.\(event\.target\.value\)\}/);
  assert.match(source, /disabled=\{disabled\}/);
  assert.match(source, /readOnly=\{disabled\}/);
  assert.match(source, /tabIndex=\{disabled \? -1 : 0\}/);
  assert.match(source, /className="chat-file-input"/);
  assert.match(source, /type="file"/);
  assert.match(source, /multiple/);
});
