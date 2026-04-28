import 'dotenv/config';

import { createClaudeClient } from '../server/claude.js';
import {
  buildUserContent,
  loadPrompts,
  renderSystemPrompt,
} from '../server/routes/chat.js';

const MAX_BODY_BYTES = Math.floor(4.5 * 1024 * 1024);

function normalizeHistory(recentHistory) {
  if (!Array.isArray(recentHistory)) {
    return [];
  }

  return recentHistory
    .filter((message) => (
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string'
    ))
    .map(({ role, content }) => ({ role, content }));
}

function errorMessageForClient(error) {
  if (error?.message === 'ANTHROPIC_API_KEY is not configured') {
    return error.message;
  }

  return 'Claude API request failed';
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function parseBodyValue(value) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value === 'string') {
    return value.trim() ? JSON.parse(value) : {};
  }

  if (Buffer.isBuffer(value)) {
    const raw = value.toString('utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  }

  return value;
}

async function readRequestBody(request) {
  if (request.body !== undefined) {
    return parseBodyValue(request.body);
  }

  let totalBytes = 0;
  const chunks = [];

  // Vercel's serverless body ceiling is about 4.5MB on Hobby. The client
  // compresses uploads to roughly 100-300KB, so anything near this limit is
  // unexpected and should fail before buffering too much memory.
  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error('request body is too large');
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  return parseBodyValue(Buffer.concat(chunks));
}

export function createVercelChatHandler({
  claudeClient = createClaudeClient(),
  prompts = loadPrompts(),
} = {}) {
  return async function chatHandler(request, response) {
    if (request.method && request.method !== 'POST') {
      sendJson(response, 405, { error: 'method not allowed' });
      return;
    }

    let body;

    try {
      body = await readRequestBody(request);
    } catch (error) {
      const statusCode = error.statusCode ?? 400;
      sendJson(response, statusCode, {
        error: statusCode === 413 ? 'request body is too large' : 'valid JSON is required',
      });
      return;
    }

    const { image = null, context = {} } = body ?? {};
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!message && !image) {
      sendJson(response, 400, { error: 'message is required' });
      return;
    }

    const isOnboarding = Boolean(context.is_onboarding ?? body?.is_onboarding);
    const system = renderSystemPrompt({
      basePrompt: prompts.basePrompt,
      onboardingPrompt: prompts.onboardingPrompt,
      context,
      isOnboarding,
    });
    let userContent;

    try {
      userContent = buildUserContent({ message, image });
    } catch {
      sendJson(response, 400, { error: 'valid image is required' });
      return;
    }

    const messages = [
      ...normalizeHistory(context.recent_history),
      {
        role: 'user',
        content: userContent,
      },
    ];

    try {
      const result = await claudeClient.createMessage({ system, messages });
      sendJson(response, 200, {
        reply: result.reply,
        raw_usage: result.raw_usage,
      });
    } catch (error) {
      console.error('Claude Vercel chat function failed:', error);
      sendJson(response, 500, { error: errorMessageForClient(error) });
    }
  };
}

export default createVercelChatHandler();
