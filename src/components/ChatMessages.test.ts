// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ChatMessages.tsx'),
  'utf8',
);

test('chat messages scroll to the bottom after layout settles', () => {
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /cancelAnimationFrame/);
  assert.match(source, /scrollTop\s*=\s*messagesElement\.scrollHeight/);
});

test('chat messages render one clickable thumbnail per sent image', () => {
  assert.match(source, /function imageSourcesFor/);
  assert.match(source, /message\.thumbnails && message\.thumbnails\.length > 0/);
  assert.match(source, /imageSources\.map\(\(thumbnail, imageIndex\)/);
  assert.match(source, /className="message-thumbnail-button"/);
  assert.match(source, /className="message-thumbnail-row"/);
  assert.match(source, /type="button"/);
  assert.match(source, /aria-label="open image"/);
});

test('thumbnail clicks open the matching selected image in the lightbox', () => {
  assert.match(
    source,
    /function openLightboxForImage\(message: DisplayMessage, thumbnail: string, index: number\) \{/,
  );
  assert.match(source, /setLightboxImage\(fullImageFor\(message, thumbnail, index\)\)/);
  assert.match(source, /onClick=\{\(\) => openLightboxForImage\(message, thumbnail, imageIndex\)\}/);
  assert.match(source, /imageSrc=\{lightboxImage\}/);
  assert.match(source, /onClose=\{\(\) => setLightboxImage\(null\)\}/);
});

test('thumbnail buttons scope native context menu prevention to image previews', () => {
  assert.match(source, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.doesNotMatch(source, /document\.addEventListener\('contextmenu'/);
  assert.doesNotMatch(source, /window\.addEventListener\('contextmenu'/);
});

test('lightbox falls back to the matching thumbnail when fullImages are absent', () => {
  assert.match(source, /function fullImageFor\(message: DisplayMessage, thumbnail: string, index: number\): string/);
  assert.match(source, /return message\.fullImages\?\.\[index\] \?\? thumbnail;/);
});

test('in-memory messages can still use fullImages when present', () => {
  assert.match(source, /fullImages\?: string\[\];/);
  assert.match(source, /message\.fullImages\?\.\[index\]/);
});

test('thumbnail image is presentational and not the interactive target', () => {
  assert.match(source, /<button[\s\S]*className="message-thumbnail-button"[\s\S]*<img[\s\S]*className="message-thumbnail"/);
  assert.match(source, /alt=""/);
  assert.match(source, /draggable=\{false\}/);
});
