import express, { type Request, type Response, type Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClaudeClient, ClaudeMessageBlock } from '../claude.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PROMPT_URL = new URL('../prompts/bubby_base.md', import.meta.url);
const ONBOARDING_PROMPT_URL = new URL('../prompts/onboarding.md', import.meta.url);
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

interface ChatRequestBody {
  message?: string;
  image?: ImagePayload;
  context?: ChatContextPayload;
  is_onboarding?: boolean;
}

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

export function loadPrompts(): Prompts {
  try {
    return {
      basePrompt: fs.readFileSync(BASE_PROMPT_URL, 'utf8'),
      onboardingPrompt: fs.readFileSync(ONBOARDING_PROMPT_URL, 'utf8'),
    };
  } catch {
    const promptsDir = path.resolve(__dirname, '../prompts');

    return {
      basePrompt: fs.readFileSync(path.join(promptsDir, 'bubby_base.md'), 'utf8'),
      onboardingPrompt: fs.readFileSync(path.join(promptsDir, 'onboarding.md'), 'utf8'),
    };
  }
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

function normalizeHistory(recentHistory: unknown): Array<{ role: 'user' | 'assistant'; content: string }> {
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

export interface CreateChatRouterParams {
  claudeClient: ClaudeClient;
  prompts: Prompts;
}

export function createChatRouter({ claudeClient, prompts }: CreateChatRouterParams): Router {
  const router = express.Router();

  router.post('/', async (request: Request, response: Response) => {
    const body = (request.body ?? {}) as ChatRequestBody;
    const { image = null, context = {} } = body;
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!message && !image) {
      response.status(400).json({ error: 'message is required' });
      return;
    }

    const isOnboarding = Boolean(context.is_onboarding ?? body.is_onboarding);
    const system = renderSystemPrompt({
      basePrompt: prompts.basePrompt,
      onboardingPrompt: prompts.onboardingPrompt,
      context,
      isOnboarding,
    });
    let userContent: UserContent;

    try {
      userContent = buildUserContent({ message, image });
    } catch {
      response.status(400).json({ error: 'valid image is required' });
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
      response.json({
        reply: result.reply,
        raw_usage: result.raw_usage,
      });
    } catch (error) {
      console.error('Claude chat route failed:', error);
      response.status(500).json({ error: errorMessageForClient(error) });
    }
  });

  return router;
}
