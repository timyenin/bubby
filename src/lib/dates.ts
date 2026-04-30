const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDateString(dateString: string): DateParts {
  const [year, month, day] = dateString.split('-').map(Number);
  return { year, month, day };
}

function utcDayValue({ year, month, day }: DateParts): number {
  return Date.UTC(year, month - 1, day);
}

/**
 * Format a Date object as YYYY-MM-DD using the user's local timezone.
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  return `${year}-${month}-${day}`;
}

/**
 * Return today's date as YYYY-MM-DD using the user's local timezone.
 */
export function todayString(): string {
  return formatDate(new Date());
}

/**
 * Return the integer number of local calendar days from dateString to today.
 */
export function daysSince(dateString: string): number {
  const today = parseDateString(todayString());
  const target = parseDateString(dateString);
  return Math.round((utcDayValue(today) - utcDayValue(target)) / MS_PER_DAY);
}
