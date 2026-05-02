// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../app.ts';

test('POST /api/report accepts a minimal report without full private context', async () => {
  const app = createApp({
    claudeClient: {
      createMessage: async () => {
        throw new Error('should not call Claude');
      },
    },
    prompts: { basePrompt: '', onboardingPrompt: '' },
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'wrong tone',
        lastAssistantMessage: 'visible message',
        timestamp: '2026-05-02T12:00:00.000Z',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
