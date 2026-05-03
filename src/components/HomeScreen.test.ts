// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'HomeScreen.tsx'),
  'utf8',
);

test('home screen renders vital bars before the LCD in the case layout', () => {
  const caseContentStart = source.indexOf('case-content-with-vitals');
  const vitalBarsIndex = source.indexOf('<VitalBars', caseContentStart);
  const lcdIndex = source.indexOf('<LCD', caseContentStart);

  assert.ok(caseContentStart >= 0);
  assert.ok(vitalBarsIndex >= 0);
  assert.ok(lcdIndex >= 0);
  assert.ok(vitalBarsIndex < lcdIndex);
});

test('controlled home screen can receive external reply rollout state', () => {
  assert.match(source, /rollingMessageId\?: string \| null/);
  assert.match(source, /revealedLength\?: number/);
  assert.match(source, /resolvedRollingMessageId/);
  assert.match(source, /resolvedRevealedLength/);
  assert.match(
    source,
    /const resolvedRollingMessageId = isControlledChat\s*\?\s*controlledRollingMessageId\s*:\s*homeRollingMessageId;/,
  );
  assert.match(
    source,
    /const resolvedRevealedLength = isControlledChat\s*\?\s*controlledRevealedLength\s*:\s*homeRevealedLength;/,
  );
});

test('home screen uses the top-right header button as a bubby color cycler', () => {
  assert.match(source, /cycleBubbyColor/);
  assert.match(source, /aria-label=\{`bubby color:/);
  assert.match(source, /bubbyFillColor/);
  assert.doesNotMatch(source, /<button className="header-icon-button" type="button" disabled>/);
});

test('home screen arms periodic spin only through the idle dwell timer', () => {
  assert.match(source, /IDLE_SPIN_INTERVAL_MS/);
  assert.match(source, /maybeTriggerIdleSpin/);
  assert.match(source, /canTriggerIdleSpin\(animationState\)/);
  assert.match(source, /window\.setTimeout/);
  assert.match(source, /clearIdleSpinTimeout/);
});

test('home screen wires post-onboarding LCD taps to tap reactions only in home mode', () => {
  assert.match(source, /triggerTapReaction/);
  assert.match(source, /handleLcdTapReaction/);
  assert.match(source, /onActivate:\s*lcdProps\?\.onActivate\s*\?\?\s*handleLcdTapReaction/);
  assert.match(source, /isControlledChat\s*\?\s*\{/);
  assert.match(source, /isControlledChat[\s\S]*\.\.\.lcdProps[\s\S]*:/);
});

test('home screen extends the hamburger menu with music controls', () => {
  assert.match(source, /MUSIC_OPTIONS\.map/);
  assert.match(source, /mute music/);
  assert.match(source, /play classic bubby 8-bit music/);
  assert.match(source, /setActiveMusicOption/);
  assert.match(source, /audioRef/);
  assert.match(source, /play\(\)\.catch|await audio\.play/);
  assert.match(source, /musicNotesActive/);
});

test('home screen extends the hamburger menu with release info controls', () => {
  assert.match(source, /theme-picker-label">info/);
  assert.match(source, /setIsInfoPanelOpen\(true\)/);
  assert.match(source, /isInfoPanelOpen/);
  assert.match(source, /href="\/privacy\.html"/);
  assert.match(source, /Bubby is AI-generated and can be wrong/i);
  assert.match(source, /what went wrong\?/);
  assert.match(source, /submitReport/);
  assert.match(source, /getLatestAssistantMessage/);
  assert.match(source, /clearAll/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /window\.location\.reload/);
});

test('home screen processes chat photos sequentially and enforces the client request budget', () => {
  assert.match(source, /processImagesForChatUpload/);
  assert.doesNotMatch(source, /Promise\.all\(\s*imageFiles\.map/);
  assert.match(source, /assertChatRequestWithinImageBudget\(requestBody\)/);
});

test('home screen uses action mutation metadata for vitals and filters skipped duplicate animations', () => {
  assert.match(source, /returnMutationResult:\s*true/);
  assert.match(source, /mutationResults/);
  assert.match(source, /applyActionsVitalEffects\(actions,\s*\{/);
  assert.match(source, /mutationResults,/);
  assert.match(source, /animationActions/);
  assert.match(source, /action\.type === 'play_animation'/);
  assert.match(source, /mutationResults\[index\]\?\.changed/);
  assert.match(source, /actions:\s*animationActions/);
});

test('home screen gives clearer photo upload failures without logging raw image data', () => {
  assert.match(source, /logHomeChatError\(error,\s*imageFiles,\s*processedImages\)/);
  assert.match(source, /imageUploadUserMessage\(error\)/);
  assert.match(source, /response\.status === 413/);
  assert.match(source, /name:\s*file\.name/);
  assert.match(source, /size:\s*file\.size/);
  assert.match(source, /fullImageBytes:/);
  assert.doesNotMatch(source, /console\.error\([^)]*fullImage/);
});
