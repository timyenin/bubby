import express, { type Request, type Response, type Router } from 'express';

export interface ReportPayload {
  reason: string;
  lastAssistantMessage: string;
  timestamp: string;
  route: string;
}

export interface CreateReportRouterOptions {
  logger?: (report: ReportPayload) => void;
}

const MAX_REASON_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 4000;

function clipped(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeReport(body: Record<string, unknown>): ReportPayload {
  const reason = clipped(String(body.reason ?? '').trim(), MAX_REASON_LENGTH);

  if (!reason) {
    throw new Error('reason is required');
  }

  return {
    reason,
    lastAssistantMessage: clipped(
      String(body.lastAssistantMessage ?? '').trim(),
      MAX_MESSAGE_LENGTH,
    ),
    timestamp: String(body.timestamp ?? new Date().toISOString()),
    route: String(body.route ?? 'unknown'),
  };
}

export function createReportRouter({
  logger = (report) => console.warn('bubby ai report', report),
}: CreateReportRouterOptions = {}): Router {
  const router = express.Router();

  router.post('/', (request: Request, response: Response) => {
    let report: ReportPayload;

    try {
      report = normalizeReport((request.body ?? {}) as Record<string, unknown>);
    } catch {
      response.status(400).json({ error: 'reason is required' });
      return;
    }

    logger(report);
    response.json({ ok: true });
  });

  router.all('/', (_request: Request, response: Response) => {
    response.status(405).json({ error: 'method not allowed' });
  });

  return router;
}
