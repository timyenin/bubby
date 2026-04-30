// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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

test('api/chat.ts does not runtime-import server TypeScript modules', async () => {
  const source = await fs.readFile(new URL('./chat.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /from ['"]\.\.\/server\/[^'"]+\.ts['"]/);
});
