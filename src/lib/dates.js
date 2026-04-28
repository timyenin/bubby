const MS_PER_DAY = 24 * 60 * 60 * 1000;

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function parseDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return { year, month, day };
}

function utcDayValue({ year, month, day }) {
  return Date.UTC(year, month - 1, day);
}

/**
 * Format a Date object as YYYY-MM-DD using the user's local timezone.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  return `${year}-${month}-${day}`;
}

/**
 * Return today's date as YYYY-MM-DD using the user's local timezone.
 *
 * @returns {string}
 */
export function todayString() {
  return formatDate(new Date());
}

/**
 * Return the integer number of local calendar days from dateString to today.
 *
 * @param {string} dateString - YYYY-MM-DD
 * @returns {number}
 */
export function daysSince(dateString) {
  const today = parseDateString(todayString());
  const target = parseDateString(dateString);
  return Math.round((utcDayValue(today) - utcDayValue(target)) / MS_PER_DAY);
}
