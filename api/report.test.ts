// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import defaultReportHandler, { createVercelReportHandler } from './report.ts';

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

test('vercel report handler accepts minimal report payloads', async () => {
  let capturedReport = null;
  const handler = createVercelReportHandler({
    logger: (report) => {
      capturedReport = report;
    },
  });
  const response = createMockResponse();

  await handler(
    {
      method: 'POST',
      body: {
        reason: 'wrong nutrition advice',
        lastAssistantMessage: 'eat rocks',
        timestamp: '2026-05-02T12:00:00.000Z',
        route: 'home',
      },
    },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
  assert.deepEqual(capturedReport, {
    reason: 'wrong nutrition advice',
    lastAssistantMessage: 'eat rocks',
    timestamp: '2026-05-02T12:00:00.000Z',
    route: 'home',
  });
});

test('vercel report handler rejects missing reason', async () => {
  const handler = createVercelReportHandler({
    logger: () => {
      throw new Error('should not log');
    },
  });
  const response = createMockResponse();

  await handler({ method: 'POST', body: { lastAssistantMessage: 'nope' } }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: 'reason is required' });
});

test('default vercel report handler returns 405 for GET', async () => {
  const response = createMockResponse();

  await defaultReportHandler({ method: 'GET' }, response);

  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.json(), { error: 'method not allowed' });
});
