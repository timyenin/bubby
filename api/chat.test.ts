// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import defaultChatHandler, { buildUserContent, createVercelChatHandler, renderSystemPrompt } from './chat.ts';

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

test('vercel chat handler returns 405 for GET without loading prompts', async () => {
  let promptLoaderWasCalled = false;
  const handler = createVercelChatHandler({
    claudeClient: {
      createMessage: async () => {
        throw new Error('should not be called');
      },
    },
    loadPrompts: () => {
      promptLoaderWasCalled = true;
      throw new Error('should not load prompts for GET');
    },
  });
  const response = createMockResponse();

  await handler({ method: 'GET' }, response);

  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.json(), { error: 'method not allowed' });
  assert.equal(promptLoaderWasCalled, false);
});

test('default vercel chat handler returns 405 for GET without runtime env', async () => {
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const response = createMockResponse();

    await defaultChatHandler({ method: 'GET' }, response);

    assert.equal(response.statusCode, 405);
    assert.deepEqual(response.json(), { error: 'method not allowed' });
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousApiKey;
    }
  }
});

test('vercel chat handler lazily loads prompts for valid POST requests', async () => {
  let promptLoaderWasCalled = false;
  let capturedRequest;
  const handler = createVercelChatHandler({
    claudeClient: {
      createMessage: async (request) => {
        capturedRequest = request;
        return {
          reply: 'lazy prompt worked.',
          raw_usage: { input_tokens: 10, output_tokens: 4 },
        };
      },
    },
    loadPrompts: () => {
      promptLoaderWasCalled = true;
      return {
        basePrompt: 'lazy profile: {{user_profile}}',
        onboardingPrompt: '',
      };
    },
  });
  const response = createMockResponse();

  await handler(
    {
      method: 'POST',
      body: {
        message: 'hi',
        context: { user_profile: { name: 'Tim' } },
      },
    },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(promptLoaderWasCalled, true);
  assert.match(capturedRequest.system, /lazy profile: \{"name":"Tim"\}/);
});

test('vercel prompt renderer includes canonical daily log placeholders', () => {
  const rendered = renderSystemPrompt({
    basePrompt: [
      'today date: {{today_date}}',
      'yesterday date: {{yesterday_date}}',
      'daily today: {{daily_log_today}}',
      'daily yesterday: {{daily_log_yesterday}}',
      'summaries: {{recent_daily_summaries}}',
    ].join('\n'),
    onboardingPrompt: '',
    context: {
      today_date: '2026-05-02',
      yesterday_date: '2026-05-01',
      daily_log_today: {
        date: '2026-05-02',
        meals: [{ id: 'meal_1', description: 'eggs' }],
      },
      daily_log_yesterday: { date: '2026-05-01', meals: [] },
      recent_daily_summaries: [{ date: '2026-05-02', meal_count: 1 }],
    },
  });

  assert.match(rendered, /today date: 2026-05-02/);
  assert.match(rendered, /yesterday date: 2026-05-01/);
  assert.match(rendered, /daily today: \{"date":"2026-05-02","meals":\[\{"id":"meal_1","description":"eggs"\}\]\}/);
  assert.match(rendered, /summaries: \[\{"date":"2026-05-02","meal_count":1\}\]/);
});

test('vercel buildUserContent formats multiple images before one text block', () => {
  assert.deepEqual(
    buildUserContent({
      message: 'these are lunch',
      images: [
        { data: 'first', media_type: 'image/jpeg' },
        { data: 'second', media_type: 'image/png' },
      ],
    }),
    [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: 'first',
        },
      },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'second',
        },
      },
      { type: 'text', text: 'these are lunch' },
    ],
  );
});

test('vercel chat handler returns 413 for request bodies above the serverless limit', async () => {
  const handler = createVercelChatHandler({
    claudeClient: {
      createMessage: async () => {
        throw new Error('should not be called');
      },
    },
    prompts: { basePrompt: '', onboardingPrompt: '' },
  });
  const response = createMockResponse();
  const request = {
    method: 'POST',
    async *[Symbol.asyncIterator]() {
      yield Buffer.alloc(5 * 1024 * 1024);
    },
  };

  await handler(request, response);

  assert.equal(response.statusCode, 413);
  assert.deepEqual(response.json(), { error: 'request body is too large' });
});

test('vercel chat handler rejects malformed image payloads without calling Claude', async () => {
  const handler = createVercelChatHandler({
    claudeClient: {
      createMessage: async () => {
        throw new Error('should not be called');
      },
    },
    prompts: { basePrompt: '', onboardingPrompt: '' },
  });
  const response = createMockResponse();

  await handler(
    {
      method: 'POST',
      body: {
        message: '',
        images: [{ data: 123, media_type: 'image/jpeg' }],
      },
    },
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: 'valid image is required' });
});

test('chat API keeps the Claude Sonnet 4.6 model string', () => {
  assert.match(readFileSync(new URL('./chat.ts', import.meta.url), 'utf8'), /const MODEL = 'claude-sonnet-4-6'/);
  assert.match(readFileSync(new URL('../server/claude.ts', import.meta.url), 'utf8'), /const MODEL = 'claude-sonnet-4-6'/);
});
