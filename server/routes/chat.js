import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.resolve(__dirname, '../prompts');
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
];

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isEmptyContextValue(value) {
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

function renderContextValue(value) {
  if (isEmptyContextValue(value)) {
    return '(none yet)';
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new Error('image must be a base64 data URL');
  }

  return {
    mediaType: match[1],
    data: match[2],
  };
}

function parseImagePayload(image) {
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

export function loadPrompts() {
  return {
    basePrompt: fs.readFileSync(path.join(PROMPTS_DIR, 'bubby_base.md'), 'utf8'),
    onboardingPrompt: fs.readFileSync(path.join(PROMPTS_DIR, 'onboarding.md'), 'utf8'),
  };
}

export function renderSystemPrompt({
  basePrompt,
  onboardingPrompt,
  context = {},
  isOnboarding = false,
}) {
  let rendered = basePrompt;

  for (const key of CONTEXT_PLACEHOLDERS) {
    rendered = rendered.replaceAll(`{{${key}}}`, renderContextValue(context[key]));
  }

  if (isOnboarding) {
    return `${rendered.trimEnd()}\n\n${onboardingPrompt.trim()}`;
  }

  return rendered;
}

export function buildUserContent({ message, image }) {
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

export function createChatRouter({ claudeClient, prompts }) {
  const router = express.Router();

  router.post('/', async (request, response) => {
    const { image = null, context = {} } = request.body ?? {};
    const message = typeof request.body?.message === 'string'
      ? request.body.message.trim()
      : '';

    if (!message && !image) {
      response.status(400).json({ error: 'message is required' });
      return;
    }

    const isOnboarding = Boolean(context.is_onboarding ?? request.body?.is_onboarding);
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
      response.status(400).json({ error: 'valid image is required' });
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
