// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ChatBar.tsx'),
  'utf8',
);

test('chat bar uses a one-line textarea for the visible composer', () => {
  assert.match(source, /<textarea\s+className="chat-input"/);
  assert.match(source, /rows=\{1\}/);
  assert.match(source, /wrap="off"/);
  assert.doesNotMatch(source, /<input\s+className="chat-input"[\s\S]*type="text"/);
});

test('chat bar submits on Enter without enabling multiline text', () => {
  assert.match(source, /handleInputKeyDown/);
  assert.match(source, /event\.key !== 'Enter'/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /if \(canSend\) \{\s*onSubmit\?\.\(\);\s*\}/s);
  assert.match(source, /onKeyDown=\{handleInputKeyDown\}/);
});

test('chat bar preserves controlled textarea behavior and attachment input', () => {
  assert.match(source, /value=\{value\}/);
  assert.match(source, /onChange=\{\(event\) => onChange\?\.\(event\.target\.value\)\}/);
  assert.match(source, /disabled=\{disabled\}/);
  assert.match(source, /readOnly=\{disabled\}/);
  assert.match(source, /tabIndex=\{disabled \? -1 : 0\}/);
  assert.match(source, /className="chat-file-input"/);
  assert.match(source, /type="file"/);
  assert.match(source, /multiple/);
});

test('chat bar appends later image selections after existing previews up to the max', () => {
  assert.match(source, /const MAX_ATTACHMENTS = 4/);
  assert.match(
    source,
    /const existingFiles = attachmentPreviews\.map\(\(preview\) => preview\.file\);/,
  );
  assert.match(source, /const selectedFiles = Array\.from\(event\.target\.files \?\? \[\]\);/);
  assert.match(
    source,
    /const nextFiles = \[\.\.\.existingFiles,\s*\.\.\.selectedFiles\]\.slice\(0, MAX_ATTACHMENTS\);/,
  );
  assert.match(source, /updateAttachmentPreviews\(nextFiles\)/);
  assert.doesNotMatch(
    source,
    /const files = Array\.from\(event\.target\.files \?\? \[\]\)\.slice\(0, MAX_ATTACHMENTS\);/,
  );
});

test('chat bar remove updates previews and parent file list without clearing remaining images', () => {
  assert.match(
    source,
    /const nextFiles = attachmentPreviews\s*\.filter\(\(_, index\) => index !== indexToRemove\)\s*\.map\(\(preview\) => preview\.file\);/,
  );
  assert.match(source, /updateAttachmentPreviews\(nextFiles\)/);
  assert.match(source, /onAttachmentChange\?\.\(cappedFiles\)/);
});

test('chat bar attachment clear signal clears previews and resets file input', () => {
  assert.match(source, /attachmentClearSignal/);
  assert.match(
    source,
    /setAttachmentPreviews\(\(currentPreviews\) => \{\s*revokePreviews\(currentPreviews\);\s*return \[\];\s*\}\);/s,
  );
  assert.match(source, /fileInputRef\.current\.value = ''/);
});

test('chat bar can restore previews from parent attachment files after a local send failure', () => {
  assert.match(source, /attachmentFiles\?: File\[\]/);
  assert.match(source, /attachmentFiles,/);
  assert.match(source, /if \(attachmentFiles === undefined\) \{/);
  assert.match(source, /const nextFiles = attachmentFiles\.slice\(0, MAX_ATTACHMENTS\);/);
  assert.match(source, /return nextFiles\.map\(createAttachmentPreview\)/);
});
