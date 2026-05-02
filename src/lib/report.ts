import { stripActionEnvelopes } from './actions.ts';

export interface ReportPayload {
  reason: string;
  lastAssistantMessage: string;
  timestamp: string;
  route: string;
}

export interface BuildReportPayloadOptions {
  reason: string;
  lastAssistantMessage?: string | null;
  now?: Date;
  route?: string;
}

export type ReportFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status'>>;

export interface SubmitReportOptions extends BuildReportPayloadOptions {
  fetcher?: ReportFetch;
}

const MAX_REASON_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 4000;

function clipped(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function getLatestAssistantMessage(
  messages: Array<{ role: string; content?: string | null }> | null | undefined,
): string {
  if (!Array.isArray(messages)) {
    return '';
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant' && typeof message.content === 'string') {
      return stripActionEnvelopes(message.content);
    }
  }

  return '';
}

export function buildReportPayload({
  reason,
  lastAssistantMessage = '',
  now = new Date(),
  route = 'home',
}: BuildReportPayloadOptions): ReportPayload {
  const normalizedReason = clipped(reason.trim(), MAX_REASON_LENGTH);

  if (!normalizedReason) {
    throw new Error('reason is required');
  }

  return {
    reason: normalizedReason,
    lastAssistantMessage: clipped(
      stripActionEnvelopes(lastAssistantMessage ?? '').trim(),
      MAX_MESSAGE_LENGTH,
    ),
    timestamp: now.toISOString(),
    route,
  };
}

export async function submitReport({
  fetcher = fetch,
  ...payloadOptions
}: SubmitReportOptions): Promise<void> {
  const payload = buildReportPayload(payloadOptions);
  const response = await fetcher('/api/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`report request failed with status ${response.status}`);
  }
}
