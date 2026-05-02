// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReportPayload,
  getLatestAssistantMessage,
  submitReport,
} from './report.ts';

test('buildReportPayload strips action envelopes and keeps payload minimal', () => {
  const payload = buildReportPayload({
    reason: 'bad advice',
    lastAssistantMessage: 'eat this\n[ACTION]{"type":"log_meal","data":{}}[/ACTION]',
    now: new Date('2026-05-02T12:00:00.000Z'),
    route: 'home',
  });

  assert.deepEqual(payload, {
    reason: 'bad advice',
    lastAssistantMessage: 'eat this',
    timestamp: '2026-05-02T12:00:00.000Z',
    route: 'home',
  });
  assert.equal('history' in payload, false);
  assert.equal('profile' in payload, false);
});

test('getLatestAssistantMessage returns the newest assistant message content only', () => {
  const latest = getLatestAssistantMessage([
    { role: 'assistant', content: 'first', timestamp: '1' },
    { role: 'user', content: 'hi', timestamp: '2' },
    { role: 'assistant', content: 'second', timestamp: '3' },
  ]);

  assert.equal(latest, 'second');
});

test('submitReport posts report payload with mocked fetch', async () => {
  let capturedUrl = '';
  let capturedInit = null;

  await submitReport({
    reason: 'weird response',
    lastAssistantMessage: 'visible only',
    now: new Date('2026-05-02T12:00:00.000Z'),
    fetcher: async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return { ok: true, status: 200 };
    },
  });

  assert.equal(capturedUrl, '/api/report');
  assert.equal(capturedInit.method, 'POST');
  assert.equal(capturedInit.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(capturedInit.body), {
    reason: 'weird response',
    lastAssistantMessage: 'visible only',
    timestamp: '2026-05-02T12:00:00.000Z',
    route: 'home',
  });
});

test('submitReport rejects empty reasons before sending', async () => {
  await assert.rejects(
    submitReport({
      reason: '   ',
      fetcher: async () => {
        throw new Error('should not fetch');
      },
    }),
    /reason is required/,
  );
});
