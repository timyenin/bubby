// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import { daysSince, formatDate, todayString } from './dates.ts';

test('todayString returns a local YYYY-MM-DD date', () => {
  assert.match(todayString(), /^\d{4}-\d{2}-\d{2}$/);
});

test('formatDate formats a Date object as YYYY-MM-DD in local time', () => {
  assert.equal(formatDate(new Date(2026, 3, 7, 23, 59)), '2026-04-07');
});

test('daysSince returns 0 for today', () => {
  assert.equal(daysSince(todayString()), 0);
});

test('daysSince returns 1 for yesterday', () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  assert.equal(daysSince(formatDate(yesterday)), 1);
});
