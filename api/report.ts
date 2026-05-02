import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface ReportRequest extends IncomingMessage {
  body?: unknown;
}

export interface ReportPayload {
  reason: string;
  lastAssistantMessage: string;
  timestamp: string;
  route: string;
}

export interface CreateVercelReportHandlerOptions {
  logger?: (report: ReportPayload) => void;
}

export type VercelReportHandler = (
  request: ReportRequest,
  response: ServerResponse,
) => Promise<void>;

const MAX_REASON_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 4000;

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function clipped(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function parseBodyValue(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value === 'string') {
    return value.trim() ? (JSON.parse(value) as Record<string, unknown>) : {};
  }

  if (Buffer.isBuffer(value)) {
    const raw = value.toString('utf8');
    return raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return {};
}

async function readRequestBody(request: ReportRequest): Promise<Record<string, unknown>> {
  if (request.body !== undefined) {
    return parseBodyValue(request.body);
  }

  const chunks: Buffer[] = [];

  for await (const chunk of request as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }

  return parseBodyValue(Buffer.concat(chunks));
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

export function createVercelReportHandler({
  logger = (report) => console.warn('bubby ai report', report),
}: CreateVercelReportHandlerOptions = {}): VercelReportHandler {
  return async function reportHandler(request, response) {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method not allowed' });
      return;
    }

    let body: Record<string, unknown>;

    try {
      body = await readRequestBody(request);
    } catch {
      sendJson(response, 400, { error: 'valid JSON is required' });
      return;
    }

    let report: ReportPayload;

    try {
      report = normalizeReport(body);
    } catch {
      sendJson(response, 400, { error: 'reason is required' });
      return;
    }

    logger(report);
    sendJson(response, 200, { ok: true });
  };
}

export default createVercelReportHandler();
