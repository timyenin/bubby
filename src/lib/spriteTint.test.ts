// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseHexColor,
  recolorSpriteImageData,
  shouldRecolorSpritePixel,
} from './spriteTint.ts';

test('sprite tint identifies visible near-white fill pixels only', () => {
  assert.equal(shouldRecolorSpritePixel(255, 255, 255, 255), true);
  assert.equal(shouldRecolorSpritePixel(236, 240, 238, 255), true);
  assert.equal(shouldRecolorSpritePixel(0, 0, 0, 255), false);
  assert.equal(shouldRecolorSpritePixel(255, 255, 255, 0), false);
});

test('recolorSpriteImageData tints fill pixels while preserving black outlines', () => {
  const imageData = {
    data: new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
      255, 255, 255, 0,
    ]),
  };

  recolorSpriteImageData(imageData, '#f8bfd6');

  assert.deepEqual(Array.from(imageData.data), [
    248, 191, 214, 255,
    0, 0, 0, 255,
    255, 255, 255, 0,
  ]);
});

test('recolorSpriteImageData returns original pixels when fill color is clear', () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255,
    0, 0, 0, 0,
  ]);
  const imageData = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray(pixels),
  };

  recolorSpriteImageData(imageData, null, { frameWidth: 2, frameHeight: 1 });

  assert.deepEqual(Array.from(imageData.data), Array.from(pixels));
});

test('recolorSpriteImageData fills transparent pixels enclosed by sprite outline', () => {
  const imageData = {
    width: 5,
    height: 5,
    data: new Uint8ClampedArray([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]),
  };

  recolorSpriteImageData(imageData, '#bdf5cf', { frameWidth: 5, frameHeight: 5 });

  const outsideIndex = 0;
  const outlineIndex = (1 * 5 + 1) * 4;
  const interiorIndex = (2 * 5 + 2) * 4;

  assert.deepEqual(Array.from(imageData.data.slice(outsideIndex, outsideIndex + 4)), [
    0, 0, 0, 0,
  ]);
  assert.deepEqual(Array.from(imageData.data.slice(outlineIndex, outlineIndex + 4)), [
    0, 0, 0, 255,
  ]);
  assert.deepEqual(Array.from(imageData.data.slice(interiorIndex, interiorIndex + 4)), [
    189, 245, 207, 255,
  ]);
});

test('recolorSpriteImageData fills each frame independently on a sprite sheet', () => {
  const imageData = {
    width: 6,
    height: 3,
    data: new Uint8ClampedArray([
      0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
      0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255,
      0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
    ]),
  };

  recolorSpriteImageData(imageData, '#ffd0b8', { frameWidth: 3, frameHeight: 3 });

  const firstInteriorIndex = (1 * 6 + 1) * 4;
  const secondInteriorIndex = (1 * 6 + 4) * 4;

  assert.deepEqual(
    Array.from(imageData.data.slice(firstInteriorIndex, firstInteriorIndex + 4)),
    [255, 208, 184, 255],
  );
  assert.deepEqual(
    Array.from(imageData.data.slice(secondInteriorIndex, secondInteriorIndex + 4)),
    [255, 208, 184, 255],
  );
});

test('parseHexColor supports six-digit hex colors', () => {
  assert.deepEqual(parseHexColor('#bdf5cf'), { r: 189, g: 245, b: 207 });
});
