import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClaudeClient } from './claude.js';
import { createChatRouter, loadPrompts } from './routes/chat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp({ claudeClient = createClaudeClient(), prompts = loadPrompts() } = {}) {
  const app = express();

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/hello', (_request, response) => {
    response.json({
      message: 'hello from bubby server',
      anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  });

  app.use('/api/chat', createChatRouter({ claudeClient, prompts }));

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, '../dist');

    app.use(express.static(distPath));
    app.use((request, response, next) => {
      if (request.method !== 'GET') {
        next();
        return;
      }

      response.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}
