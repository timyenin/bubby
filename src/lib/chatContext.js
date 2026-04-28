import { formatDate, todayString } from './dates.js';
import {
  calculateWeightLossRate,
  isUnderCalorieFloor,
} from './macros.js';
import {
  getBubbyState,
  getConversationHistory,
  getDailyLog,
  getPantry,
  getUserProfile,
} from './storage.js';

const RECENT_HISTORY_LIMIT = 20;
const MACRO_KEYS = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEIGHT_LOSS_RATE_LIMIT = 1.5;

function defaultBubbyState(currentTime) {
  return {
    vitality: 80,
    mood: 70,
    strength: 50,
    energy: 80,
    current_animation: 'idle',
    is_sick: false,
    is_sleepy: false,
    last_updated: currentTime,
  };
}

function compactHistory(conversationHistory) {
  const messages = conversationHistory?.messages ?? [];

  return messages
    .slice(-RECENT_HISTORY_LIMIT)
    .filter((message) => message?.content)
    .map((message) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content,
    }));
}

function getTargetForDay(userProfile, dailyLog) {
  const targets = userProfile?.macro_targets;
  if (!targets) {
    return null;
  }

  return dailyLog?.is_workout_day ? targets.workout_day : targets.rest_day;
}

function getWeekdayKeys(now) {
  const weekdayIndex = now.getDay();
  const fullName = WEEKDAYS[weekdayIndex];
  const shortName = SHORT_WEEKDAYS[weekdayIndex];

  return [fullName, fullName[0].toUpperCase() + fullName.slice(1), shortName, weekdayIndex];
}

function offsetDateString(dateString, dayOffset) {
  const [year, month, day] = dateString.split('-').map(Number);
  return formatDate(new Date(year, month - 1, day + dayOffset));
}

function hasLoggedMeal(dailyLog) {
  return Array.isArray(dailyLog?.meals) && dailyLog.meals.length > 0;
}

function loggedBelowFloor(dailyLog, calorieFloor) {
  return (
    Number(calorieFloor) > 0 &&
    hasLoggedMeal(dailyLog) &&
    isUnderCalorieFloor(dailyLog.totals ?? {}, calorieFloor)
  );
}

function collectRecentDailyLogs(dateString, dayCount) {
  return Array.from({ length: dayCount }, (_, index) => {
    const logDate = offsetDateString(dateString, index - dayCount + 1);
    return getDailyLog(logDate);
  });
}

export function resolveConcernLevel(userProfile, recentDailyLogs = []) {
  const calorieFloor = Number(userProfile?.calorie_floor ?? 0);
  const lastTwoLogs = recentDailyLogs.slice(-2);

  if (
    lastTwoLogs.length === 2 &&
    lastTwoLogs.every((dailyLog) => loggedBelowFloor(dailyLog, calorieFloor))
  ) {
    return 'elevated';
  }

  return 'normal';
}

export function resolveWeightLossRateSignal(recentDailyLogs = []) {
  const weightHistory = recentDailyLogs
    .filter((dailyLog) => Number.isFinite(Number(dailyLog?.weigh_in_lbs)))
    .map((dailyLog) => ({
      date: dailyLog.date,
      weight_lbs: Number(dailyLog.weigh_in_lbs),
    }));

  return calculateWeightLossRate(weightHistory) > WEIGHT_LOSS_RATE_LIMIT
    ? 'too_fast'
    : 'normal';
}

export function calculateMacrosRemaining(target, totals = {}) {
  if (!target) {
    return {};
  }

  return MACRO_KEYS.reduce((remaining, key) => {
    const targetValue = Number(target[key] ?? 0);
    const totalValue = Number(totals?.[key] ?? 0);
    return {
      ...remaining,
      [key]: Math.max(0, targetValue - totalValue),
    };
  }, {});
}

export function resolveTrainingToday(userProfile, now = new Date()) {
  const schedule = userProfile?.training_schedule;
  if (!schedule || typeof schedule !== 'object') {
    return null;
  }

  for (const key of getWeekdayKeys(now)) {
    if (schedule[key]) {
      return schedule[key];
    }
  }

  return null;
}

export function buildChatContext({
  userProfile = null,
  dailyLog = null,
  recentDailyLogs = [],
  pantry = null,
  conversationHistory = null,
  bubbyState = null,
  now = new Date(),
  currentTime = now.toISOString(),
} = {}) {
  const macrosToday = dailyLog?.totals ?? {};
  const target = getTargetForDay(userProfile, dailyLog);

  return {
    user_profile: userProfile,
    macros_today: macrosToday,
    macros_remaining: calculateMacrosRemaining(target, macrosToday),
    training_today: resolveTrainingToday(userProfile, now),
    pantry,
    recent_history: compactHistory(conversationHistory),
    bubby_state: bubbyState ?? defaultBubbyState(currentTime),
    concern_level: resolveConcernLevel(userProfile, recentDailyLogs),
    weight_loss_rate: resolveWeightLossRateSignal(recentDailyLogs),
    current_time: currentTime,
    is_onboarding: false,
  };
}

export function buildChatContextFromStorage({
  now = new Date(),
  dateString = todayString(),
  currentTime = now.toISOString(),
} = {}) {
  const recentDailyLogs = collectRecentDailyLogs(dateString, 14);

  return buildChatContext({
    userProfile: getUserProfile(),
    dailyLog: getDailyLog(dateString),
    recentDailyLogs,
    pantry: getPantry(),
    conversationHistory: getConversationHistory(),
    bubbyState: getBubbyState(),
    now,
    currentTime,
  });
}
