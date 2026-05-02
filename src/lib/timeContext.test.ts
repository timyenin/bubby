// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCurrentTimeContext,
  formatUtcOffset,
  getBrowserTimeZone,
} from './timeContext.ts';

test('buildCurrentTimeContext includes UTC ISO timestamp, local date, local time, timezone, and offset', () => {
  const now = new Date(2026, 4, 2, 22, 44, 0);
  const context = buildCurrentTimeContext(now);

  assert.match(context, /local date: 2026-05-02/);
  assert.match(context, /local time:/);
  assert.match(context, /time zone:/);
  assert.match(context, /utc offset: [+-]\d{2}:\d{2}/);
  assert.match(context, /utc: \d{4}-\d{2}-\d{2}T/);
  assert.match(context, new RegExp(`utc: ${now.toISOString().replaceAll('.', '\\.')}`));
});

test('getBrowserTimeZone reads the Intl resolved IANA timezone when available', () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = (() => ({
    resolvedOptions: () => ({ timeZone: 'America/New_York' }),
  })) as typeof Intl.DateTimeFormat;

  try {
    assert.equal(getBrowserTimeZone(), 'America/New_York');
  } finally {
    Intl.DateTimeFormat = originalDateTimeFormat;
  }
});

test('getBrowserTimeZone falls back safely when Intl timezone is unavailable', () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = (() => ({
    resolvedOptions: () => ({}),
  })) as typeof Intl.DateTimeFormat;

  try {
    assert.equal(getBrowserTimeZone(), 'unknown');
  } finally {
    Intl.DateTimeFormat = originalDateTimeFormat;
  }
});

test('formatUtcOffset formats JavaScript timezone offsets', () => {
  assert.equal(formatUtcOffset(240), '-04:00');
  assert.equal(formatUtcOffset(0), '+00:00');
  assert.equal(formatUtcOffset(-330), '+05:30');
});
