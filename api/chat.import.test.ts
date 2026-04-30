// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

test('importing api/chat.ts does not eagerly load prompts or require runtime env', async () => {
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const module = await import(`./chat.ts?module-init=${Date.now()}`);

    assert.equal(typeof module.default, 'function');
    assert.equal(typeof module.createVercelChatHandler, 'function');
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousApiKey;
    }
  }
});
