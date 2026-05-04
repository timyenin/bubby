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
  assert.match(source, /function handleThumbnailClick\(/);
  assert.match(source, /onClick=\{\(event\) => handleThumbnailClick\(event, message, thumbnail, imageIndex, imageOpenKey\)\}/);
  assert.match(source, /renderImageLightbox\(lightboxImage, \(\) => setLightboxImage\(null\)\)/);
});

test('image lightbox renders through document body portal when available', () => {
  assert.match(source, /import \{ createPortal \} from 'react-dom';/);
  assert.match(source, /function renderImageLightbox\(/);
  assert.match(source, /typeof document === 'undefined' \|\| !document\.body/);
  assert.match(source, /return createPortal\(lightbox, document\.body\)/);
});

test('thumbnail touchend opens the same image with duplicate click suppression', () => {
  assert.match(source, /const RECENT_TOUCH_OPEN_WINDOW_MS = \d+;/);
  assert.match(source, /const TAP_MOVE_TOLERANCE_PX = \d+;/);
  assert.match(source, /const lastTouchOpenRef = useRef/);
  assert.match(source, /const thumbnailTouchStartRef = useRef/);
  assert.match(source, /function handleThumbnailTouchStart\(/);
  assert.match(source, /function handleThumbnailTouchEnd\(/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /lastTouchOpenRef\.current = \{ key: imageOpenKey, timestamp: Date\.now\(\) \}/);
  assert.match(source, /Date\.now\(\) - lastTouchOpen\.timestamp < RECENT_TOUCH_OPEN_WINDOW_MS/);
  assert.match(source, /onTouchStart=\{\(event\) => handleThumbnailTouchStart\(event, imageOpenKey\)\}/);
  assert.match(source, /onTouchEnd=\{\(event\) => handleThumbnailTouchEnd\(event, message, thumbnail, imageIndex, imageOpenKey\)\}/);
  assert.match(source, /onTouchCancel=\{\(\) => \{/);
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

test('lightbox keeps close, backdrop, and inside-frame click behavior', () => {
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-label="image preview"/);
  assert.match(source, /className="image-lightbox"[\s\S]*onClick=\{onClose\}/);
  assert.match(source, /className="image-lightbox-close"[\s\S]*type="button"[\s\S]*onClick=\{onClose\}/);
  assert.match(source, /className="image-lightbox-frame" onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
});
