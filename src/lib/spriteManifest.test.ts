// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveAnimationSheet } from './spriteManifest.ts';

function readPngSize(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test('sprite manifest includes idle glance and spin frames in the combined sheet', () => {
  const manifest = JSON.parse(
    readFileSync('public/assets/sprites/manifest.json', 'utf8'),
  );
  const sheetSize = readPngSize(
    'public/assets/sprites/sheets/bubby_all_30_frames_sheet_transparent.png',
  );

  assert.equal(manifest.frame_count, 30);
  assert.equal(manifest.animations.idle.length, 5);
  assert.equal(manifest.animations.idle[2].look_direction, 'left');
  assert.equal(manifest.animations.idle[3].look_direction, 'right');
  assert.equal(manifest.animations.idle[4].look_direction, 'up');
  assert.equal(manifest.animations.spin.length, 4);
  assert.deepEqual(manifest.all_sheet.size, [1440, 48]);
  assert.deepEqual(sheetSize, { width: 1440, height: 48 });
});

test('sprite manifest resolves spin as a four-frame one-shot after existing frames', () => {
  const manifest = JSON.parse(
    readFileSync('public/assets/sprites/manifest.json', 'utf8'),
  );
  const spinSheet = resolveAnimationSheet(manifest, 'spin');

  assert.equal(spinSheet.animationName, 'spin');
  assert.equal(spinSheet.frameCount, 4);
  assert.equal(spinSheet.xOffset, 26 * 48);
});
