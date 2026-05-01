// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readPngSize(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test('sprite manifest includes idle glance frames in the combined sheet', () => {
  const manifest = JSON.parse(
    readFileSync('public/assets/sprites/manifest.json', 'utf8'),
  );
  const sheetSize = readPngSize(
    'public/assets/sprites/sheets/bubby_all_26_frames_sheet_transparent.png',
  );

  assert.equal(manifest.frame_count, 26);
  assert.equal(manifest.animations.idle.length, 5);
  assert.equal(manifest.animations.idle[2].look_direction, 'left');
  assert.equal(manifest.animations.idle[3].look_direction, 'right');
  assert.equal(manifest.animations.idle[4].look_direction, 'up');
  assert.deepEqual(manifest.all_sheet.size, [1248, 48]);
  assert.deepEqual(sheetSize, { width: 1248, height: 48 });
});
