import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_UPLOAD_BYTES,
  processImageForUpload,
} from './imageProcessing.ts';

function createImageFile(overrides = {}) {
  return {
    type: 'image/png',
    size: 1024,
    name: 'lunch.png',
    ...overrides,
  };
}

test('processImageForUpload rejects non-image files before processing', async () => {
  await assert.rejects(
    processImageForUpload(createImageFile({ type: 'text/plain' })),
    /image file/i,
  );
});

test('processImageForUpload rejects files over 20mb before processing', async () => {
  await assert.rejects(
    processImageForUpload(createImageFile({ size: MAX_UPLOAD_BYTES + 1 })),
    /20mb/i,
  );
});

test('processImageForUpload returns compressed full image and thumbnail data urls', async () => {
  const calls = [];
  const result = await processImageForUpload(createImageFile(), {
    loadImage: async () => ({
      width: 2000,
      height: 1000,
    }),
    createCanvasElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: () => {},
        drawImage: () => {},
      }),
      toDataURL: (mediaType, quality) => {
        calls.push({ mediaType, quality });
        return `data:${mediaType};base64,${quality === 0.8 ? 'full' : 'thumb'}`;
      },
    }),
  });

  assert.deepEqual(result, {
    fullImage: 'data:image/jpeg;base64,full',
    thumbnail: 'data:image/jpeg;base64,thumb',
    mediaType: 'image/jpeg',
  });
  assert.deepEqual(calls, [
    { mediaType: 'image/jpeg', quality: 0.8 },
    { mediaType: 'image/jpeg', quality: 0.6 },
  ]);
});
