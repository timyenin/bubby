// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertChatRequestWithinImageBudget,
  CLIENT_CHAT_REQUEST_BODY_BUDGET_BYTES,
  ImageProcessingError,
  MAX_UPLOAD_BYTES,
  processImageForUpload,
  processImagesForChatUpload,
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
    (error) => error instanceof ImageProcessingError && error.code === 'invalid-file-type',
  );
});

test('processImageForUpload rejects files over 20mb before processing', async () => {
  await assert.rejects(
    processImageForUpload(createImageFile({ size: MAX_UPLOAD_BYTES + 1 })),
    (error) => error instanceof ImageProcessingError && error.code === 'original-file-too-large',
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
        return `data:${mediaType};base64,${quality === 0.82 ? 'full' : 'thumb'}`;
      },
    }),
  });

  assert.deepEqual(result, {
    fullImage: 'data:image/jpeg;base64,full',
    thumbnail: 'data:image/jpeg;base64,thumb',
    mediaType: 'image/jpeg',
  });
  assert.deepEqual(calls, [
    { mediaType: 'image/jpeg', quality: 0.82 },
    { mediaType: 'image/jpeg', quality: 0.6 },
  ]);
});

test('processImageForUpload retries with safer compression when encoded image is too large', async () => {
  const calls = [];
  const result = await processImageForUpload(createImageFile(), {
    maxFullImageBytes: 80,
    loadImage: async () => ({
      width: 3000,
      height: 2000,
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
        if (quality > 0.78) {
          return `data:${mediaType};base64,${'x'.repeat(120)}`;
        }

        return `data:${mediaType};base64,small`;
      },
    }),
  });

  assert.equal(result.fullImage, 'data:image/jpeg;base64,small');
  assert.ok(calls.length > 2);
  assert.equal(calls[0].quality, 0.82);
  assert.equal(calls[1].quality, 0.78);
});

test('processImageForUpload rejects only after exhausting useful compression settings', async () => {
  const qualities = [];

  await assert.rejects(
    processImageForUpload(createImageFile(), {
      maxFullImageBytes: 80,
      loadImage: async () => ({
        width: 3000,
        height: 2000,
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
          qualities.push(quality);
          return `data:${mediaType};base64,${'x'.repeat(120)}`;
        },
      }),
    }),
    (error) => (
      error instanceof ImageProcessingError &&
      error.code === 'processed-image-too-large'
    ),
  );

  assert.equal(Math.min(...qualities), 0.68);
});

test('processImageForUpload wraps decode/load failures with a specific image error', async () => {
  await assert.rejects(
    processImageForUpload(createImageFile(), {
      loadImage: async () => {
        throw new Error('decoder failed');
      },
    }),
    (error) => error instanceof ImageProcessingError && error.code === 'image-decode-failed',
  );
});

test('processImageForUpload reports unavailable canvas separately', async () => {
  await assert.rejects(
    processImageForUpload(createImageFile(), {
      loadImage: async () => ({
        width: 100,
        height: 100,
      }),
      createCanvasElement: () => ({
        width: 0,
        height: 0,
        getContext: () => null,
        toDataURL: () => 'data:image/jpeg;base64,unused',
      }),
    }),
    (error) => error instanceof ImageProcessingError && error.code === 'canvas-unavailable',
  );
});

test('processImagesForChatUpload processes files sequentially to reduce mobile memory pressure', async () => {
  let activeLoads = 0;
  let maxActiveLoads = 0;

  await processImagesForChatUpload([
    createImageFile({ name: 'one.jpg' }),
    createImageFile({ name: 'two.jpg' }),
  ], {
    loadImage: async () => {
      activeLoads += 1;
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
      await Promise.resolve();
      activeLoads -= 1;
      return { width: 100, height: 100 };
    },
    createCanvasElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: () => {},
        drawImage: () => {},
      }),
      toDataURL: (mediaType, quality) => `data:${mediaType};base64,${quality}`,
    }),
  });

  assert.equal(maxActiveLoads, 1);
});

test('assertChatRequestWithinImageBudget rejects oversized image request bodies before fetch', () => {
  assert.equal(CLIENT_CHAT_REQUEST_BODY_BUDGET_BYTES, Math.floor(3.5 * 1024 * 1024));
  assert.throws(
    () => assertChatRequestWithinImageBudget(
      {
        message: 'lunch',
        images: [{ data: 'x'.repeat(128), media_type: 'image/jpeg' }],
      },
      100,
    ),
    (error) => (
      error instanceof ImageProcessingError &&
      error.code === 'request-payload-too-large'
    ),
  );
});
