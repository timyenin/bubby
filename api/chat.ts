import 'dotenv/config';
import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createClaudeClient, type ClaudeClient, type ClaudeMessageBlock } from '../server/claude.ts';
import {
  buildUserContent,
  loadPrompts as loadPromptFiles,
  renderSystemPrompt,
  type ChatContextPayload,
  type Prompts,
} from '../server/routes/chat.ts';

const MAX_BODY_BYTES = Math.floor(4.5 * 1024 * 1024);

interface VercelRequestBody {
  message?: string;
  image?: unknown;
  context?: ChatContextPayload;
  is_onboarding?: boolean;
}

interface VercelLikeRequest extends IncomingMessage {
  body?: unknown;
}

interface SizedError extends Error {
  statusCode?: number;
}

export interface CreateVercelChatHandlerOptions {
  claudeClient?: ClaudeClient;
  prompts?: Prompts;
  loadPrompts?: () => Prompts;
}

export type VercelChatHandler = (
  request: VercelLikeRequest,
  response: ServerResponse,
) => Promise<void>;

function normalizeHistory(
  recentHistory: unknown,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(recentHistory)) {
    return [];
  }

  return recentHistory
    .filter((message): message is { role: 'user' | 'assistant'; content: string } => (
      (message?.role === 'user' || message?.role === 'assistant') &&
      typeof message?.content === 'string'
    ))
    .map(({ role, content }) => ({ role, content }));
}

function errorMessageForClient(error: unknown): string {
  if (error instanceof Error && error.message === 'ANTHROPIC_API_KEY is not configured') {
    return error.message;
  }

  return 'Claude API request failed';
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function parseBodyValue(value: unknown): VercelRequestBody {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value === 'string') {
    return value.trim() ? (JSON.parse(value) as VercelRequestBody) : {};
  }

  if (Buffer.isBuffer(value)) {
    const raw = value.toString('utf8');
    return raw.trim() ? (JSON.parse(raw) as VercelRequestBody) : {};
  }

  return value as VercelRequestBody;
}

async function readRequestBody(request: VercelLikeRequest): Promise<VercelRequestBody> {
  if (request.body !== undefined) {
    return parseBodyValue(request.body);
  }

  let totalBytes = 0;
  const chunks: Buffer[] = [];

  // Vercel's serverless body ceiling is about 4.5MB on Hobby. The client
  // compresses uploads to roughly 100-300KB, so anything near this limit is
  // unexpected and should fail before buffering too much memory.
  for await (const chunk of request as AsyncIterable<Buffer>) {
    totalBytes += chunk.length;

    if (totalBytes > MAX_BODY_BYTES) {
      const error: SizedError = new Error('request body is too large');
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  return parseBodyValue(Buffer.concat(chunks));
}

export function createVercelChatHandler({
  claudeClient = createClaudeClient(),
  prompts,
  loadPrompts = loadPromptFiles,
}: CreateVercelChatHandlerOptions = {}): VercelChatHandler {
  return async function chatHandler(request, response) {
    if (request.method && request.method !== 'POST') {
      sendJson(response, 405, { error: 'method not allowed' });
      return;
    }

    let body: VercelRequestBody;

    try {
      body = await readRequestBody(request);
    } catch (error) {
      const statusCode = (error as SizedError).statusCode ?? 400;
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
    let resolvedPrompts: Prompts;

    try {
      resolvedPrompts = prompts ?? loadPrompts();
    } catch (error) {
      console.error('Claude Vercel chat function failed to load prompts:', error);
      sendJson(response, 500, { error: 'Claude API request failed' });
      return;
    }

    const system = renderSystemPrompt({
      basePrompt: resolvedPrompts.basePrompt,
      onboardingPrompt: resolvedPrompts.onboardingPrompt,
      context,
      isOnboarding,
    });
    let userContent: ReturnType<typeof buildUserContent>;

    try {
      userContent = buildUserContent({ message, image: image as Parameters<typeof buildUserContent>[0]['image'] });
    } catch {
      sendJson(response, 400, { error: 'valid image is required' });
      return;
    }

    const messages: ClaudeMessageBlock[] = [
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
