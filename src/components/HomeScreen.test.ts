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

test('home screen pauses music for background without muting the saved option', () => {
  assert.match(source, /function pauseMusicForBackground\(\)/);
  const pauseStart = source.indexOf('function pauseMusicForBackground()');
  const pauseEnd = source.indexOf('async function startMusicPlayback', pauseStart);
  const pauseBlock = source.slice(pauseStart, pauseEnd);

  assert.ok(pauseStart >= 0);
  assert.match(pauseBlock, /audio\.pause\(\)/);
  assert.match(pauseBlock, /setIsMusicPlaying\(false\)/);
  assert.doesNotMatch(pauseBlock, /currentTime\s*=\s*0/);
  assert.doesNotMatch(pauseBlock, /setActiveMusicOption\('mute'\)/);
});

test('home screen starts playable music only while the document is visible', () => {
  assert.match(source, /function isDocumentVisible\(\)/);
  assert.match(source, /document\.visibilityState !== 'hidden'/);
  assert.match(source, /function startMusicPlaybackIfVisible\(option: MusicOption\)/);
  assert.match(source, /function resumeMusicPlaybackIfVisible\(option: MusicOption\)/);
  assert.match(source, /if \(!option\.src \|\| !isDocumentVisible\(\)\) \{/);
  assert.match(source, /void startMusicPlaybackIfVisible\(nextMusicOption\)/);
  assert.match(source, /await startMusicPlayback\(option, false\)/);
  assert.doesNotMatch(source, /void startMusicPlayback\(nextMusicOption\)/);
});

test('home screen handles page visibility lifecycle for music only in home mode', () => {
  const listenerIndex = source.indexOf("document.addEventListener('visibilitychange', handleMusicVisibilityChange)");
  const visibilityStart = source.lastIndexOf('useEffect(() => {', listenerIndex);
  const visibilityEnd = source.indexOf('function applyTheme', visibilityStart);
  const visibilityBlock = source.slice(visibilityStart, visibilityEnd);

  assert.ok(visibilityStart >= 0);
  assert.match(visibilityBlock, /if \(isControlledChat\) \{\s*return undefined;\s*\}/);
  assert.match(visibilityBlock, /document\.addEventListener\('visibilitychange', handleMusicVisibilityChange\)/);
  assert.match(visibilityBlock, /window\.addEventListener\('pagehide', handleMusicPageHide\)/);
  assert.match(visibilityBlock, /window\.addEventListener\('pageshow', handleMusicPageShow\)/);
  assert.match(visibilityBlock, /document\.removeEventListener\('visibilitychange', handleMusicVisibilityChange\)/);
  assert.match(visibilityBlock, /window\.removeEventListener\('pagehide', handleMusicPageHide\)/);
  assert.match(visibilityBlock, /window\.removeEventListener\('pageshow', handleMusicPageShow\)/);
  assert.match(visibilityBlock, /pauseMusicForBackground\(\)/);
  assert.match(visibilityBlock, /resumeMusicPlaybackIfVisible\(activeMusicOptionRef\.current\)/);
});

test('home screen keeps manual mute separate from background pause and music notes track playback', () => {
  const applyStart = source.indexOf('function applyMusicOption(musicId: string)');
  const applyEnd = source.indexOf('function cycleBubbyColor', applyStart);
  const applyBlock = source.slice(applyStart, applyEnd);

  assert.ok(applyStart >= 0);
  assert.match(applyBlock, /setActiveMusicOption\(musicId\)/);
  assert.match(applyBlock, /if \(!nextMusicOption\.src\) \{\s*stopMusicPlayback\(\);\s*return;\s*\}/);
  assert.doesNotMatch(applyBlock, /pauseMusicForBackground\(\)/);
  assert.match(source, /activeMusicOptionRef\.current = nextMusicOption/);
  assert.match(source, /const areMusicNotesActive = activeMusicOption\.src !== null && isMusicPlaying;/);
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
  assert.match(source, /photoSendUserMessage\(error,\s*imageFiles\.length > 0\)/);
  assert.match(source, /response\.status === 413/);
  assert.match(source, /name:\s*file\.name/);
  assert.match(source, /size:\s*file\.size/);
  assert.match(source, /fullImageBytes:/);
  assert.doesNotMatch(source, /console\.error\([^)]*fullImage/);
});

test('home screen sends full processed images to Claude but stores only thumbnails', () => {
  assert.match(source, /data:\s*dataUrlToBase64\(processedImage\.fullImage\)/);
  assert.match(source, /thumbnails:\s*processedImages\.map\(\(processedImage\) => processedImage\.thumbnail\)/);
  assert.doesNotMatch(source, /fullImages:\s*processedImages\.map/);
});

test('home screen clears composer attachments before processing captured send files', () => {
  const sendStart = source.indexOf('async function sendHomeMessage()');
  const imageFilesIndex = source.indexOf('const imageFiles = attachedImageFiles.slice(0, 4);', sendStart);
  const clearIndex = source.indexOf('setAttachedImageFiles([])', sendStart);
  const clearSignalIndex = source.indexOf('setAttachmentClearSignal((currentSignal) => currentSignal + 1)', sendStart);
  const processIndex = source.indexOf('processImagesForChatUpload(imageFiles)', sendStart);

  assert.ok(sendStart >= 0);
  assert.ok(imageFilesIndex > sendStart);
  assert.ok(clearIndex > imageFilesIndex);
  assert.ok(clearSignalIndex > clearIndex);
  assert.ok(processIndex > clearSignalIndex);
});

test('home screen restores captured attachments only for failures before the request starts', () => {
  const sendStart = source.indexOf('async function sendHomeMessage()');
  const requestFlagIndex = source.indexOf('let requestStarted = false;', sendStart);
  const requestStartedIndex = source.indexOf('requestStarted = true;', requestFlagIndex);
  const fetchIndex = source.indexOf("await fetch('/api/chat'", requestStartedIndex);
  const catchIndex = source.indexOf('} catch (error) {', fetchIndex);
  const catchBlock = source.slice(catchIndex, source.indexOf('} finally {', catchIndex));

  assert.ok(requestFlagIndex > sendStart);
  assert.ok(requestStartedIndex > requestFlagIndex);
  assert.ok(fetchIndex > requestStartedIndex);
  assert.match(catchBlock, /if \(!requestStarted && imageFiles\.length > 0\) \{/);
  assert.match(catchBlock, /setAttachedImageFiles\(imageFiles\)/);
  assert.doesNotMatch(catchBlock, /setAttachmentClearSignal/);
});

test('home screen handles conversation storage failures without retrying persistence forever', () => {
  assert.match(source, /isConversationHistoryStorageError/);
  assert.match(source, /appendHomeMessage/);
  assert.match(source, /persist:\s*false/);
});
