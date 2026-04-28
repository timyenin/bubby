const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1900;

function collectTextContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

export function createClaudeClient() {
  return {
    async createMessage({ system, messages }) {
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
        messages,
      });

      return {
        reply: collectTextContent(response.content),
        raw_usage: response.usage ?? null,
      };
    },
  };
}

export { MODEL as CLAUDE_MODEL };
