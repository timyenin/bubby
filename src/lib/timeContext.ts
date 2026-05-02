import { formatDate } from './dates.ts';

function padOffsetPart(value: number): string {
  return String(value).padStart(2, '0');
}

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function formatUtcOffset(timezoneOffsetMinutes: number): string {
  const offsetMinutes = -timezoneOffsetMinutes;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `${sign}${padOffsetPart(hours)}:${padOffsetPart(minutes)}`;
}

export function buildCurrentTimeContext(now = new Date()): string {
  const localDate = formatDate(now);
  const localTime = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const timeZone = getBrowserTimeZone();
  const utcOffset = formatUtcOffset(now.getTimezoneOffset());

  return `local date: ${localDate}; local time: ${localTime}; time zone: ${timeZone}; utc offset: ${utcOffset}; utc: ${now.toISOString()}`;
}
