import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function countMatches(value, pattern) {
  return (value.match(pattern) ?? []).length;
}

test('web app manifest is ready for TWA packaging', () => {
  assert.equal(existsSync('public/manifest.webmanifest'), true);

  const manifest = readJson('public/manifest.webmanifest');

  assert.equal(manifest.name, 'Bubby');
  assert.equal(manifest.short_name, 'Bubby');
  assert.match(manifest.description, /AI nutrition companion/i);
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait');
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.deepEqual(manifest.categories, ['health', 'lifestyle', 'productivity']);

  const icons = manifest.icons ?? [];
  assert.ok(icons.some((icon) => icon.src === '/icons/icon-192.png' && icon.sizes === '192x192'));
  assert.ok(icons.some((icon) => icon.src === '/icons/icon-512.png' && icon.sizes === '512x512'));
  assert.ok(icons.some((icon) => icon.src === '/icons/maskable-icon-192.png' && icon.purpose?.includes('maskable')));
  assert.ok(icons.some((icon) => icon.src === '/icons/maskable-icon-512.png' && icon.purpose?.includes('maskable')));
});

test('PWA icon files exist', () => {
  for (const iconPath of [
    'public/icons/icon-192.png',
    'public/icons/icon-512.png',
    'public/icons/maskable-icon-192.png',
    'public/icons/maskable-icon-512.png',
  ]) {
    assert.equal(existsSync(iconPath), true, `${iconPath} should exist`);
  }
});

test('index.html links the manifest and mobile shell metadata', () => {
  const indexHtml = readFileSync('index.html', 'utf8');
  const headCloseIndex = indexHtml.indexOf('</head>');
  const headHtml = indexHtml.slice(0, headCloseIndex);
  const afterHeadHtml = indexHtml.slice(headCloseIndex + '</head>'.length);

  assert.equal(countMatches(indexHtml, /<head>/g), 1);
  assert.equal(countMatches(indexHtml, /<\/head>/g), 1);
  assert.equal(countMatches(indexHtml, /<body>/g), 1);
  assert.equal(countMatches(indexHtml, /<\/body>/g), 1);
  assert.equal(countMatches(indexHtml, /<meta charset="UTF-8" \/>/g), 1);
  assert.equal(countMatches(indexHtml, /<title>bubby<\/title>/g), 1);
  assert.ok(headCloseIndex > 0);

  assert.match(indexHtml, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  assert.match(indexHtml, /<meta name="theme-color" content="#[0-9a-f]{6}" \/>/i);
  assert.match(indexHtml, /<meta name="mobile-web-app-capable" content="yes" \/>/);
  assert.match(indexHtml, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
  assert.match(indexHtml, /<meta name="apple-mobile-web-app-title" content="Bubby" \/>/);
  assert.match(headHtml, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  assert.match(headHtml, /<meta name="theme-color" content="#[0-9a-f]{6}" \/>/i);
  assert.match(headHtml, /<meta name="mobile-web-app-capable" content="yes" \/>/);
  assert.match(headHtml, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
  assert.match(headHtml, /<meta name="apple-mobile-web-app-title" content="Bubby" \/>/);
  assert.doesNotMatch(afterHeadHtml, /<meta name="theme-color"/);
  assert.doesNotMatch(afterHeadHtml, /<link rel="manifest"/);
  assert.doesNotMatch(afterHeadHtml, /<title>bubby<\/title>/);
});

test('Android TWA docs cover packaging essentials without fake asset links', () => {
  assert.equal(existsSync('docs/android-twa.md'), true);
  const docs = readFileSync('docs/android-twa.md', 'utf8');

  assert.match(docs, /https:\/\/bubby-pearl\.vercel\.app/);
  assert.match(docs, /https:\/\/bubby-pearl\.vercel\.app\/manifest\.webmanifest/);
  assert.match(docs, /https:\/\/bubby-pearl\.vercel\.app\/privacy\.html/);
  assert.match(docs, /app\.bubby\.mobile/);
  assert.match(docs, /public\/\.well-known\/assetlinks\.json/);
  assert.match(docs, /SHA-256 signing certificate fingerprint/);
  assert.match(docs, /targetSdkVersion/);
  assert.doesNotMatch(docs, /REPLACE_WITH_FAKE|AA:BB:CC/i);
});

test('release docs reference the Android TWA guide', () => {
  const releaseChecklist = readFileSync('docs/release-checklist.md', 'utf8');

  assert.match(releaseChecklist, /docs\/android-twa\.md/);
});

test('gitignore excludes generated Android and signing artifacts', () => {
  const gitignore = readFileSync('.gitignore', 'utf8');

  for (const pattern of [
    'android/.gradle/',
    'android/app/build/',
    'android/build/',
    'android/local.properties',
    '*.jks',
    '*.keystore',
    '*.p12',
    '*.pem',
    '*.key',
  ]) {
    assert.match(gitignore, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
});
