import 'dotenv/config';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1900;
const MAX_BODY_BYTES = Math.floor(4.5 * 1024 * 1024);
const CONTEXT_PLACEHOLDERS = [
  'user_profile',
  'macros_today',
  'macros_remaining',
  'training_today',
  'pantry',
  'recent_history',
  'bubby_state',
  'concern_level',
  'weight_loss_rate',
  'current_time',
] as const;

interface TextContentPart {
  type: 'text';
  text: string;
}

type ContentPart = TextContentPart | { type: string; [key: string]: unknown };

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  [key: string]: unknown;
}

export interface ClaudeMessageBlock {
  role: 'user' | 'assistant';
  content: unknown;
}

export interface CreateMessageParams {
  system?: string;
  messages: ClaudeMessageBlock[];
}

export interface CreateMessageResult {
  reply: string;
  raw_usage: ClaudeUsage | null;
}

export interface ClaudeClient {
  createMessage(params: CreateMessageParams): Promise<CreateMessageResult>;
}

export interface Prompts {
  basePrompt: string;
  onboardingPrompt: string;
}

export interface ChatContextPayload {
  user_profile?: unknown;
  macros_today?: unknown;
  macros_remaining?: unknown;
  training_today?: unknown;
  pantry?: unknown;
  recent_history?: unknown;
  bubby_state?: unknown;
  concern_level?: unknown;
  weight_loss_rate?: unknown;
  current_time?: unknown;
  is_onboarding?: boolean;
  [key: string]: unknown;
}

export interface RenderSystemPromptParams {
  basePrompt: string;
  onboardingPrompt: string;
  context?: ChatContextPayload;
  isOnboarding?: boolean;
}

interface ImagePayloadObject {
  data: string;
  media_type: string;
}

type ImagePayload = string | ImagePayloadObject | null | undefined;

interface ParsedImage {
  mediaType: string;
  data: string;
}

interface UserContentImageBlock {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
}

interface UserContentTextBlock {
  type: 'text';
  text: string;
}

type UserContent = string | Array<UserContentImageBlock | UserContentTextBlock>;

interface BuildUserContentParams {
  message: string;
  image?: ImagePayload;
}

interface VercelRequestBody {
  message?: string;
  image?: ImagePayload;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isEmptyContextValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (isPlainObject(value)) {
    return Object.keys(value).length === 0;
  }

  return false;
}

function renderContextValue(value: unknown): string {
  if (isEmptyContextValue(value)) {
    return '(none yet)';
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parseDataUrl(dataUrl: string): ParsedImage {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new Error('image must be a base64 data URL');
  }

  return {
    mediaType: match[1],
    data: match[2],
  };
}

function parseImagePayload(image: ImagePayload): ParsedImage {
  if (typeof image === 'string') {
    return parseDataUrl(image);
  }

  if (
    image &&
    typeof image === 'object' &&
    typeof image.data === 'string' &&
    typeof image.media_type === 'string'
  ) {
    const dataUrlMatch = /^data:([^;,]+);base64,(.+)$/s.exec(image.data);

    return {
      mediaType: dataUrlMatch?.[1] ?? image.media_type,
      data: dataUrlMatch?.[2] ?? image.data,
    };
  }

  throw new Error('image must include base64 data and media_type');
}

function collectTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return (content as ContentPart[])
    .filter((part): part is TextContentPart => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

export function createClaudeClient(): ClaudeClient {
  return {
    async createMessage({ system, messages }: CreateMessageParams): Promise<CreateMessageResult> {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }

      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: messages as Parameters<typeof anthropic.messages.create>[0]['messages'],
      });

      return {
        reply: collectTextContent(response.content),
        raw_usage: (response.usage ?? null) as unknown as ClaudeUsage | null,
      };
    },
  };
}

function readPromptFile(fileName: string): string {
  const promptUrl = new URL(`../server/prompts/${fileName}`, import.meta.url);

  try {
    return fs.readFileSync(promptUrl, 'utf8');
  } catch {
    return fs.readFileSync(path.join(process.cwd(), 'server', 'prompts', fileName), 'utf8');
  }
}

export function loadPrompts(): Prompts {
  return {
    basePrompt: readPromptFile('bubby_base.md'),
    onboardingPrompt: readPromptFile('onboarding.md'),
  };
}

export function renderSystemPrompt({
  basePrompt,
  onboardingPrompt,
  context = {},
  isOnboarding = false,
}: RenderSystemPromptParams): string {
  let rendered = basePrompt;

  for (const key of CONTEXT_PLACEHOLDERS) {
    rendered = rendered.replaceAll(`{{${key}}}`, renderContextValue(context[key]));
  }

  if (isOnboarding) {
    return `${rendered.trimEnd()}\n\n${onboardingPrompt.trim()}`;
  }

  return rendered;
}

export function buildUserContent({ message, image }: BuildUserContentParams): UserContent {
  if (!image) {
    return message;
  }

  const { mediaType, data } = parseImagePayload(image);
  return [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data,
      },
    },
    { type: 'text', text: message || 'user sent a photo with no caption.' },
  ];
}

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
  loadPrompts: loadPromptFiles = loadPrompts,
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
      resolvedPrompts = prompts ?? loadPromptFiles();
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
    let userContent: UserContent;

    try {
      userContent = buildUserContent({ message, image });
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
