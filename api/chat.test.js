import assert from 'node:assert/strict';
import test from 'node:test';

import { createVercelChatHandler } from './chat.js';

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

test('vercel chat handler calls Claude and returns the expected response shape', async () => {
  let capturedRequest;
  const handler = createVercelChatHandler({
    claudeClient: {
      createMessage: async (request) => {
        capturedRequest = request;
        return {
          reply: 'hey. logged it.',
          raw_usage: { input_tokens: 20, output_tokens: 5 },
        };
      },
    },
    prompts: {
      basePrompt: 'user profile: {{user_profile}}\nhistory: {{recent_history}}',
      onboardingPrompt: '',
    },
  });
  const response = createMockResponse();

  await handler(
    {
      method: 'POST',
      body: {
        message: 'hi',
        image: null,
        context: {
          user_profile: { name: 'Tim' },
          recent_history: [{ role: 'assistant', content: 'morning.' }],
        },
      },
    },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/json');
  assert.deepEqual(response.json(), {
    reply: 'hey. logged it.',
    raw_usage: { input_tokens: 20, output_tokens: 5 },
  });
  assert.match(capturedRequest.system, /user profile: \{"name":"Tim"\}/);
  assert.deepEqual(capturedRequest.messages, [
    { role: 'assistant', content: 'morning.' },
    { role: 'user', content: 'hi' },
  ]);
});

test('vercel chat handler rejects missing message and image', async () => {
  const handler = createVercelChatHandler({
    claudeClient: {
      createMessage: async () => {
        throw new Error('should not be called');
      },
    },
    prompts: { basePrompt: '', onboardingPrompt: '' },
  });
  const response = createMockResponse();

  await handler({ method: 'POST', body: { context: {} } }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: 'message is required' });
});
