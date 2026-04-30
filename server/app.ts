import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClaudeClient, type ClaudeClient } from './claude.ts';
import { createChatRouter, loadPrompts, type Prompts } from './routes/chat.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CreateAppOptions {
  claudeClient?: ClaudeClient;
  prompts?: Prompts;
}

export function createApp({
  claudeClient = createClaudeClient(),
  prompts = loadPrompts(),
}: CreateAppOptions = {}): Application {
  const app = express();

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/hello', (_request: Request, response: Response) => {
    response.json({
      message: 'hello from bubby server',
      anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  });

  app.use('/api/chat', createChatRouter({ claudeClient, prompts }));

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, '../dist');

    app.use(express.static(distPath));
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (request.method !== 'GET') {
        next();
        return;
      }

      response.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}
