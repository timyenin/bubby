// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'LCD.tsx'),
  'utf8',
);

test('lcd renders music notes inside the lcd window before the sprite', () => {
  const windowIndex = source.indexOf('className="lcd-window"');
  const notesIndex = source.indexOf('lcd-music-notes', windowIndex);
  const spriteIndex = source.indexOf('<BubbySprite', windowIndex);

  assert.ok(windowIndex >= 0);
  assert.ok(notesIndex > windowIndex);
  assert.ok(spriteIndex > notesIndex);
  assert.match(source, /musicNotesActive\?: boolean/);
});
