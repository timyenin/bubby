import { formatDate, todayString } from './dates.js';
import {
  getBubbyState,
  getDailyLog,
  getUserProfile,
  setBubbyState,
  setDailyLog,
} from './storage.js';

export const CALORIE_FLOOR_PENALTY_FLAG = 'calorie_floor_penalty_applied';
export const PROTEIN_TARGET_REWARD_FLAG = 'protein_target_vitals_awarded';

const DECAY_RATES = {
  vitality: -2,
  energy: -2,
  mood: -1,
  strength: -1,
};
const MAX_DECAY_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VITAL_KEYS = ['vitality', 'mood', 'strength', 'energy'];
const ACTION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SICK_RECOVERY_MEAL_FLAG = 'sick_recovery_meals';

export function clampVital(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

export function defaultBubbyState(now = new Date()) {
  return {
    vitality: 80,
    mood: 70,
    strength: 50,
    energy: 80,
    current_animation: 'idle',
    is_sick: false,
    is_sleepy: false,
    last_updated: now.toISOString(),
  };
}

function parseDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return { year, month, day };
}

function utcDayValue(dateString) {
  const { year, month, day } = parseDateString(dateString);
  return Date.UTC(year, month - 1, day);
}

function daysBetween(dateString, laterDateString) {
  return Math.round((utcDayValue(laterDateString) - utcDayValue(dateString)) / MS_PER_DAY);
}

function offsetDateString(dateString, dayOffset) {
  const { year, month, day } = parseDateString(dateString);
  return formatDate(new Date(year, month - 1, day + dayOffset));
}

function isValidDateString(dateString) {
  if (typeof dateString !== 'string' || !ACTION_DATE_PATTERN.test(dateString)) {
    return false;
  }

  const { year, month, day } = parseDateString(dateString);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function resolveActionDate(actionDate, fallbackDateString) {
  return isValidDateString(actionDate) ? actionDate : fallbackDateString;
}

function getStateOrDefault(now = new Date()) {
  return getBubbyState() ?? defaultBubbyState(now);
}

function normalizeState(state, now = new Date()) {
  const fallback = defaultBubbyState(now);

  return {
    ...fallback,
    ...state,
    vitality: clampVital(state?.vitality ?? fallback.vitality),
    mood: clampVital(state?.mood ?? fallback.mood),
    strength: clampVital(state?.strength ?? fallback.strength),
    energy: clampVital(state?.energy ?? fallback.energy),
    last_updated: state?.last_updated ?? fallback.last_updated,
  };
}

function saveBubbyState(state) {
  const saved = setBubbyState(state);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bubby-state-updated'));
  }

  return saved;
}

function withVitalDeltas(state, deltas, now = new Date()) {
  const normalized = normalizeState(state, now);
  const nextState = { ...normalized };

  for (const key of VITAL_KEYS) {
    if (typeof deltas[key] === 'number') {
      nextState[key] = clampVital(normalized[key] + deltas[key]);
    }
  }

  return {
    ...nextState,
    last_updated: now.toISOString(),
  };
}

function hasLoggedMeal(dailyLog) {
  return Array.isArray(dailyLog?.meals) && dailyLog.meals.length > 0;
}

function isBelowCalorieFloor(dailyLog, userProfile) {
  const floor = Number(userProfile?.calorie_floor ?? 0);
  const calories = Number(dailyLog?.totals?.calories ?? 0);

  return floor > 0 && hasLoggedMeal(dailyLog) && calories < floor;
}

function hasFlag(dailyLog, flag) {
  return dailyLog?.adherence_flags?.includes(flag) === true;
}

function getNumberFlagValue(dailyLog, flagPrefix) {
  const rawFlag = dailyLog?.adherence_flags?.find((flag) => flag.startsWith(`${flagPrefix}:`));
  const value = Number(rawFlag?.split(':')[1]);
  return Number.isFinite(value) ? value : 0;
}

function setNumberFlagValue(dateString, flagPrefix, value) {
  const dailyLog = getDailyLog(dateString);
  if (!dailyLog) {
    return null;
  }

  return setDailyLog(dateString, {
    ...dailyLog,
    adherence_flags: [
      ...(dailyLog.adherence_flags ?? []).filter((flag) => !flag.startsWith(`${flagPrefix}:`)),
      `${flagPrefix}:${value}`,
    ],
  });
}

function addFlagToDailyLog(dateString, flag) {
  const dailyLog = getDailyLog(dateString);
  if (!dailyLog || hasFlag(dailyLog, flag)) {
    return dailyLog;
  }

  return setDailyLog(dateString, {
    ...dailyLog,
    adherence_flags: [...(dailyLog.adherence_flags ?? []), flag],
  });
}

function getProteinTarget(userProfile, dailyLog) {
  const targets = userProfile?.macro_targets;
  const target = dailyLog?.is_workout_day ? targets?.workout_day : targets?.rest_day;
  return Number(target?.protein_g ?? 0);
}

function crossesProteinTarget({ beforeDailyLog, afterDailyLog, userProfile }) {
  const target = getProteinTarget(userProfile, afterDailyLog);
  if (target <= 0 || hasFlag(afterDailyLog, PROTEIN_TARGET_REWARD_FLAG)) {
    return false;
  }

  return (
    Number(beforeDailyLog?.totals?.protein_g ?? 0) < target &&
    Number(afterDailyLog?.totals?.protein_g ?? 0) >= target
  );
}

function recentFloorBreaches(userProfile, now = new Date(), dayCount = 3) {
  const currentDateString = formatDate(now);

  return Array.from({ length: dayCount }, (_, index) => {
    const dateString = offsetDateString(currentDateString, -index);
    return isBelowCalorieFloor(getDailyLog(dateString), userProfile);
  });
}

function hasConsecutiveFloorBreaches(userProfile, now = new Date()) {
  const breaches = recentFloorBreaches(userProfile, now, 3);

  return breaches.some((isBreach, index) => isBreach && breaches[index + 1] === true);
}

function hasFloorBreachInLastTwoDays(userProfile, now = new Date()) {
  return recentFloorBreaches(userProfile, now, 2).some(Boolean);
}

function applySickRecoveryMealBoost({
  dailyLog,
  targetDateString,
  currentState,
  deltas,
  userProfile,
  now,
}) {
  if (
    !currentState.is_sick ||
    hasFloorBreachInLastTwoDays(userProfile, now)
  ) {
    return;
  }

  const recoveryMealCount = getNumberFlagValue(dailyLog, SICK_RECOVERY_MEAL_FLAG) + 1;
  setNumberFlagValue(targetDateString, SICK_RECOVERY_MEAL_FLAG, recoveryMealCount);

  if (recoveryMealCount >= 3) {
    deltas.vitality = (deltas.vitality ?? 0) + Math.max(0, 50 - currentState.vitality);
  }
}

export function applyVitalDecayToState(state, now = new Date()) {
  const normalized = normalizeState(state, now);
  const lastUpdatedDateString = formatDate(new Date(normalized.last_updated));
  const currentDateString = formatDate(now);
  const daysSinceUpdate = daysBetween(lastUpdatedDateString, currentDateString);

  if (daysSinceUpdate <= 0) {
    return state;
  }

  const decayDays = Math.min(daysSinceUpdate, MAX_DECAY_DAYS);
  const decayedState = { ...normalized };

  for (const [key, rate] of Object.entries(DECAY_RATES)) {
    decayedState[key] = clampVital(normalized[key] + rate * decayDays);
  }

  return {
    ...decayedState,
    last_updated: now.toISOString(),
  };
}

export function refreshSickState({ now = new Date(), userProfile = getUserProfile() } = {}) {
  const currentState = getStateOrDefault(now);
  let nextIsSick = Boolean(currentState.is_sick);

  if (currentState.vitality < 30 || hasConsecutiveFloorBreaches(userProfile, now)) {
    nextIsSick = true;
  } else if (
    currentState.is_sick &&
    currentState.vitality >= 50 &&
    !hasFloorBreachInLastTwoDays(userProfile, now)
  ) {
    nextIsSick = false;
  }

  if (nextIsSick === currentState.is_sick) {
    return currentState;
  }

  return saveBubbyState({
    ...currentState,
    is_sick: nextIsSick,
  });
}

export function applyVitalDecay({ now = new Date() } = {}) {
  const currentState = getBubbyState();

  if (!currentState) {
    return saveBubbyState(defaultBubbyState(now));
  }

  const decayedState = applyVitalDecayToState(currentState, now);
  const savedState = decayedState === currentState
    ? currentState
    : saveBubbyState(decayedState);

  refreshSickState({ now });
  return getBubbyState() ?? savedState;
}

export function applyVitalDeltas(deltas, { now = new Date() } = {}) {
  const nextState = withVitalDeltas(getStateOrDefault(now), deltas, now);
  saveBubbyState(nextState);
  return refreshSickState({ now });
}

export function applyCalorieFloorPenaltyForDate(
  dateString,
  { now = new Date(), userProfile = getUserProfile() } = {},
) {
  const dailyLog = getDailyLog(dateString);
  if (
    !dailyLog ||
    !isBelowCalorieFloor(dailyLog, userProfile) ||
    hasFlag(dailyLog, CALORIE_FLOOR_PENALTY_FLAG)
  ) {
    return refreshSickState({ now, userProfile });
  }

  addFlagToDailyLog(dateString, CALORIE_FLOOR_PENALTY_FLAG);
  applyVitalDeltas({ vitality: -10, mood: -5 }, { now });
  return getBubbyState();
}

export function applyActionVitalEffects(
  action,
  {
    dateString = todayString(),
    now = new Date(),
    beforeDailyLog = null,
    userProfile = getUserProfile(),
  } = {},
) {
  if (!action?.type) {
    return getStateOrDefault(now);
  }

  const targetDateString = resolveActionDate(action.data?.date, dateString);
  const deltas = {};

  if (action.type === 'log_meal') {
    const protein = Number(action.data?.macros?.protein_g ?? 0);
    const afterDailyLog = getDailyLog(targetDateString);

    if (protein >= 20) {
      deltas.vitality = (deltas.vitality ?? 0) + 3;
      deltas.strength = (deltas.strength ?? 0) + 2;
      applySickRecoveryMealBoost({
        dailyLog: afterDailyLog,
        targetDateString,
        currentState: getStateOrDefault(now),
        deltas,
        userProfile,
        now,
      });
    }

    if (
      crossesProteinTarget({
        beforeDailyLog,
        afterDailyLog,
        userProfile,
      })
    ) {
      deltas.mood = (deltas.mood ?? 0) + 5;
      deltas.vitality = (deltas.vitality ?? 0) + 3;
      addFlagToDailyLog(targetDateString, PROTEIN_TARGET_REWARD_FLAG);
    }

    if (targetDateString !== formatDate(now)) {
      applyCalorieFloorPenaltyForDate(targetDateString, { now, userProfile });
    }
  }

  if (action.type === 'log_weight') {
    deltas.mood = (deltas.mood ?? 0) + 2;
  }

  if (action.type === 'set_workout_day' && action.data?.is_workout_day === true) {
    deltas.strength = (deltas.strength ?? 0) + 5;
    deltas.energy = (deltas.energy ?? 0) + 3;
  }

  if (Object.keys(deltas).length > 0) {
    return applyVitalDeltas(deltas, { now });
  }

  return refreshSickState({ now, userProfile });
}

export function applyActionsVitalEffects(
  actions,
  {
    dateString = todayString(),
    now = new Date(),
    beforeDailyLog = null,
    userProfile = getUserProfile(),
  } = {},
) {
  let runningBeforeDailyLog = beforeDailyLog;

  for (const action of actions) {
    applyActionVitalEffects(action, {
      dateString,
      now,
      beforeDailyLog: runningBeforeDailyLog,
      userProfile,
    });

    runningBeforeDailyLog = getDailyLog(dateString);
  }

  return getStateOrDefault(now);
}
