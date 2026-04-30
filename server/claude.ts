const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1900;

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

function collectTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return (content as ContentPart[])
    .filter((part): part is TextContentPart => part.type === 'text' && typeof (part as TextContentPart).text === 'string')
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

export { MODEL as CLAUDE_MODEL };
