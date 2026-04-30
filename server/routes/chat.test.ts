// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../app.ts';
import {
  buildUserContent,
  renderSystemPrompt,
} from './chat.ts';

const basePrompt = [
  'user profile: {{user_profile}}',
  'today: {{macros_today}}',
  'remaining: {{macros_remaining}}',
  'training: {{training_today}}',
  'pantry: {{pantry}}',
  'history: {{recent_history}}',
  'state: {{bubby_state}}',
  'concern: {{concern_level}}',
  'weight loss: {{weight_loss_rate}}',
  'memory: {{memory}}',
  'time: {{current_time}}',
].join('\n');

test('renderSystemPrompt renders empty context fields as none yet', () => {
  const rendered = renderSystemPrompt({
    basePrompt,
    onboardingPrompt: '',
    context: {
      user_profile: null,
      macros_today: {},
      training_today: '',
    },
    isOnboarding: false,
  });

  assert.match(rendered, /user profile: \(none yet\)/);
  assert.match(rendered, /today: \(none yet\)/);
  assert.match(rendered, /remaining: \(none yet\)/);
  assert.match(rendered, /training: \(none yet\)/);
  assert.match(rendered, /concern: \(none yet\)/);
  assert.match(rendered, /weight loss: \(none yet\)/);
  assert.match(rendered, /memory: \(none yet\)/);
});

test('renderSystemPrompt JSON-stringifies populated context fields', () => {
  const rendered = renderSystemPrompt({
    basePrompt,
    onboardingPrompt: '',
    context: {
      user_profile: { name: 'Tim' },
      macros_today: { calories: 420, protein_g: 45 },
      recent_history: [{ role: 'user', content: 'hi' }],
      concern_level: 'elevated',
      weight_loss_rate: 'too_fast',
      memory: [{ content: 'hates mushrooms', category: 'preference' }],
    },
    isOnboarding: false,
  });

  assert.match(rendered, /user profile: \{"name":"Tim"\}/);
  assert.match(rendered, /today: \{"calories":420,"protein_g":45\}/);
  assert.match(rendered, /history: \[\{"role":"user","content":"hi"\}\]/);
  assert.match(rendered, /concern: elevated/);
  assert.match(rendered, /weight loss: too_fast/);
  assert.match(rendered, /memory: \[\{"content":"hates mushrooms","category":"preference"\}\]/);
});

test('renderSystemPrompt appends onboarding addendum in onboarding mode', () => {
  const rendered = renderSystemPrompt({
    basePrompt,
    onboardingPrompt: '# you are in onboarding mode',
    context: {},
    isOnboarding: true,
  });

  assert.match(rendered, /memory: \(none yet\)/);
  assert.match(rendered, /time: \(none yet\)/);
  assert.match(rendered, /# you are in onboarding mode/);
});

test('POST /api/chat returns 400 when message is missing', async () => {
  const app = createApp({
    claudeClient: {
      createMessage: async () => {
        throw new Error('should not be called');
      },
    },
    prompts: { basePrompt, onboardingPrompt: '' },
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context: {} }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, { error: 'message is required' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/chat accepts an image-only message', async () => {
  let capturedRequest;
  const app = createApp({
    claudeClient: {
      createMessage: async (request) => {
        capturedRequest = request;
        return {
          reply: 'looks like lunch.',
          raw_usage: { input_tokens: 20, output_tokens: 6 },
        };
      },
    },
    prompts: { basePrompt, onboardingPrompt: '' },
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: '',
        image: { data: 'abc123', media_type: 'image/jpeg' },
        context: {},
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(capturedRequest.messages.at(-1), {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: 'abc123',
          },
        },
        { type: 'text', text: 'user sent a photo with no caption.' },
      ],
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/chat forwards rendered prompt and history to Claude client', async () => {
  let capturedRequest;
  const app = createApp({
    claudeClient: {
      createMessage: async (request) => {
        capturedRequest = request;
        return {
          reply: 'hey. what are we doing today?',
          raw_usage: { input_tokens: 12, output_tokens: 8 },
        };
      },
    },
    prompts: { basePrompt, onboardingPrompt: '# onboarding' },
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'hi',
        image: null,
        context: {
          user_profile: { name: 'Tim' },
          recent_history: [{ role: 'assistant', content: 'hey.' }],
          is_onboarding: true,
        },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      reply: 'hey. what are we doing today?',
      raw_usage: { input_tokens: 12, output_tokens: 8 },
    });
    assert.match(capturedRequest.system, /user profile: \{"name":"Tim"\}/);
    assert.match(capturedRequest.system, /# onboarding/);
    assert.deepEqual(capturedRequest.messages, [
      { role: 'assistant', content: 'hey.' },
      { role: 'user', content: 'hi' },
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('buildUserContent formats data URL images for Anthropic vision messages', () => {
  assert.deepEqual(
    buildUserContent({
      message: 'what is this?',
      image: { data: 'abc123', media_type: 'image/jpeg' },
    }),
    [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: 'abc123',
        },
      },
      { type: 'text', text: 'what is this?' },
    ],
  );
});
