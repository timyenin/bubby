import { formatDate, todayString } from './dates.ts';
import {
  getBubbyState,
  getCanonicalDailyLog,
  getDailyLog,
  getUserProfile,
  setBubbyState,
  setDailyLog,
  type BubbyState,
  type DailyLog,
  type UserProfile,
  type VitalName,
} from './storage.ts';
import type { ActionMutationResult, ParsedAction } from './actions.ts';

export const CALORIE_FLOOR_PENALTY_FLAG = 'calorie_floor_penalty_applied';
export const PROTEIN_TARGET_REWARD_FLAG = 'protein_target_vitals_awarded';

type VitalAction = Partial<ParsedAction>;

type VitalDeltas = Partial<Record<VitalName, number>>;

const DECAY_RATES: Record<VitalName, number> = {
  vitality: -2,
  energy: -2,
  mood: -1,
  strength: -1,
};
const MAX_DECAY_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VITAL_KEYS: VitalName[] = ['vitality', 'mood', 'strength', 'energy'];
const ACTION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SICK_RECOVERY_MEAL_FLAG = 'sick_recovery_meals';

export function clampVital(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

export function defaultBubbyState(now: Date = new Date()): BubbyState {
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

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseDateString(dateString: string): DateParts {
  const [year, month, day] = dateString.split('-').map(Number);
  return { year, month, day };
}

function utcDayValue(dateString: string): number {
  const { year, month, day } = parseDateString(dateString);
  return Date.UTC(year, month - 1, day);
}

function daysBetween(dateString: string, laterDateString: string): number {
  return Math.round((utcDayValue(laterDateString) - utcDayValue(dateString)) / MS_PER_DAY);
}

function offsetDateString(dateString: string, dayOffset: number): string {
  const { year, month, day } = parseDateString(dateString);
  return formatDate(new Date(year, month - 1, day + dayOffset));
}

function isValidDateString(dateString: unknown): dateString is string {
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

function resolveActionDate(actionDate: unknown, fallbackDateString: string): string {
  return isValidDateString(actionDate) ? actionDate : fallbackDateString;
}

function getStateOrDefault(now: Date = new Date()): BubbyState {
  return getBubbyState() ?? defaultBubbyState(now);
}

function normalizeState(state: Partial<BubbyState> | null | undefined, now: Date = new Date()): BubbyState {
  const fallback = defaultBubbyState(now);

  return {
    ...fallback,
    ...(state ?? {}),
    vitality: clampVital(state?.vitality ?? fallback.vitality),
    mood: clampVital(state?.mood ?? fallback.mood),
    strength: clampVital(state?.strength ?? fallback.strength),
    energy: clampVital(state?.energy ?? fallback.energy),
    last_updated: state?.last_updated ?? fallback.last_updated,
  };
}

function saveBubbyState(state: BubbyState): BubbyState {
  const saved = setBubbyState(state);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bubby-state-updated'));
  }

  return saved;
}

function withVitalDeltas(state: BubbyState, deltas: VitalDeltas, now: Date = new Date()): BubbyState {
  const normalized = normalizeState(state, now);
  const nextState: BubbyState = { ...normalized };

  for (const key of VITAL_KEYS) {
    const delta = deltas[key];
    if (typeof delta === 'number') {
      nextState[key] = clampVital(normalized[key] + delta);
    }
  }

  return {
    ...nextState,
    last_updated: now.toISOString(),
  };
}

function hasLoggedMeal(dailyLog: DailyLog | null | undefined): boolean {
  return Array.isArray(dailyLog?.meals) && (dailyLog?.meals.length ?? 0) > 0;
}

function isBelowCalorieFloor(
  dailyLog: DailyLog | null | undefined,
  userProfile: UserProfile | null | undefined,
): boolean {
  const floor = Number(userProfile?.calorie_floor ?? 0);
  const calories = Number(dailyLog?.totals?.calories ?? 0);

  return floor > 0 && hasLoggedMeal(dailyLog) && calories < floor;
}

function hasFlag(dailyLog: DailyLog | null | undefined, flag: string): boolean {
  return dailyLog?.adherence_flags?.includes(flag) === true;
}

function getNumberFlagValue(dailyLog: DailyLog | null | undefined, flagPrefix: string): number {
  const rawFlag = dailyLog?.adherence_flags?.find((flag) => flag.startsWith(`${flagPrefix}:`));
  const value = Number(rawFlag?.split(':')[1]);
  return Number.isFinite(value) ? value : 0;
}

function setNumberFlagValue(dateString: string, flagPrefix: string, value: number): DailyLog | null {
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

function addFlagToDailyLog(dateString: string, flag: string): DailyLog | null {
  const dailyLog = getDailyLog(dateString);
  if (!dailyLog || hasFlag(dailyLog, flag)) {
    return dailyLog;
  }

  return setDailyLog(dateString, {
    ...dailyLog,
    adherence_flags: [...(dailyLog.adherence_flags ?? []), flag],
  });
}

function getProteinTarget(
  userProfile: UserProfile | null | undefined,
  dailyLog: DailyLog | null | undefined,
): number {
  const targets = userProfile?.macro_targets;
  const target = dailyLog?.is_workout_day ? targets?.workout_day : targets?.rest_day;
  return Number(target?.protein_g ?? 0);
}

function crossesProteinTarget({
  beforeDailyLog,
  afterDailyLog,
  userProfile,
}: {
  beforeDailyLog: DailyLog | null | undefined;
  afterDailyLog: DailyLog | null | undefined;
  userProfile: UserProfile | null | undefined;
}): boolean {
  const target = getProteinTarget(userProfile, afterDailyLog);
  if (target <= 0 || hasFlag(afterDailyLog, PROTEIN_TARGET_REWARD_FLAG)) {
    return false;
  }

  return (
    Number(beforeDailyLog?.totals?.protein_g ?? 0) < target &&
    Number(afterDailyLog?.totals?.protein_g ?? 0) >= target
  );
}

function recentFloorBreaches(
  userProfile: UserProfile | null | undefined,
  now: Date = new Date(),
  dayCount = 3,
): boolean[] {
  const currentDateString = formatDate(now);

  return Array.from({ length: dayCount }, (_, index) => {
    const dateString = offsetDateString(currentDateString, -index);
    return isBelowCalorieFloor(getCanonicalDailyLog(dateString), userProfile);
  });
}

function hasConsecutiveFloorBreaches(
  userProfile: UserProfile | null | undefined,
  now: Date = new Date(),
): boolean {
  const breaches = recentFloorBreaches(userProfile, now, 3);

  return breaches.some((isBreach, index) => isBreach && breaches[index + 1] === true);
}

function hasFloorBreachInLastTwoDays(
  userProfile: UserProfile | null | undefined,
  now: Date = new Date(),
): boolean {
  return recentFloorBreaches(userProfile, now, 2).some(Boolean);
}

function applySickRecoveryMealBoost({
  dailyLog,
  targetDateString,
  currentState,
  deltas,
  userProfile,
  now,
}: {
  dailyLog: DailyLog | null | undefined;
  targetDateString: string;
  currentState: BubbyState;
  deltas: VitalDeltas;
  userProfile: UserProfile | null | undefined;
  now: Date;
}): void {
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

export function applyVitalDecayToState(
  state: Partial<BubbyState> | null | undefined,
  now: Date = new Date(),
): BubbyState {
  const normalized = normalizeState(state, now);
  const lastUpdatedDateString = formatDate(new Date(normalized.last_updated));
  const currentDateString = formatDate(now);
  const daysSinceUpdate = daysBetween(lastUpdatedDateString, currentDateString);

  if (daysSinceUpdate <= 0) {
    return state as BubbyState;
  }

  const decayDays = Math.min(daysSinceUpdate, MAX_DECAY_DAYS);
  const decayedState: BubbyState = { ...normalized };

  for (const [key, rate] of Object.entries(DECAY_RATES) as Array<[VitalName, number]>) {
    decayedState[key] = clampVital(normalized[key] + rate * decayDays);
  }

  return {
    ...decayedState,
    last_updated: now.toISOString(),
  };
}

export function refreshSickState({
  now = new Date(),
  userProfile = getUserProfile(),
}: { now?: Date; userProfile?: UserProfile | null } = {}): BubbyState {
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

export function applyVitalDecay({ now = new Date() }: { now?: Date } = {}): BubbyState {
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

export function applyVitalDeltas(
  deltas: VitalDeltas,
  { now = new Date() }: { now?: Date } = {},
): BubbyState {
  const nextState = withVitalDeltas(getStateOrDefault(now), deltas, now);
  saveBubbyState(nextState);
  return refreshSickState({ now });
}

export function applyCalorieFloorPenaltyForDate(
  dateString: string,
  {
    now = new Date(),
    userProfile = getUserProfile(),
  }: { now?: Date; userProfile?: UserProfile | null } = {},
): BubbyState | null {
  const dailyLog = getCanonicalDailyLog(dateString);
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
  action: VitalAction,
  {
    dateString = todayString(),
    now = new Date(),
    beforeDailyLog = null,
    userProfile = getUserProfile(),
    mutationResult = null,
  }: {
    dateString?: string;
    now?: Date;
    beforeDailyLog?: DailyLog | null;
    userProfile?: UserProfile | null;
    mutationResult?: ActionMutationResult | null;
  } = {},
): BubbyState {
  if (!action?.type) {
    return getStateOrDefault(now);
  }

  if (mutationResult && !mutationResult.changed) {
    return refreshSickState({ now, userProfile });
  }

  const targetDateString = mutationResult?.dateString ?? resolveActionDate(action.data?.date, dateString);
  const deltas: VitalDeltas = {};

  if (action.type === 'log_meal') {
    const protein = Number(action.data?.macros?.protein_g ?? 0);
    const afterDailyLog = getCanonicalDailyLog(targetDateString);

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
  actions: VitalAction[],
  {
    dateString = todayString(),
    now = new Date(),
    beforeDailyLog = null,
    userProfile = getUserProfile(),
    mutationResults = null,
  }: {
    dateString?: string;
    now?: Date;
    beforeDailyLog?: DailyLog | null;
    userProfile?: UserProfile | null;
    mutationResults?: ActionMutationResult[] | null;
  } = {},
): BubbyState {
  let runningBeforeDailyLog = beforeDailyLog;

  for (const [index, action] of actions.entries()) {
    const mutationResult = mutationResults?.[index] ?? null;
    applyActionVitalEffects(action, {
      dateString,
      now,
      beforeDailyLog: runningBeforeDailyLog,
      userProfile,
      mutationResult,
    });

    runningBeforeDailyLog = getCanonicalDailyLog(mutationResult?.dateString ?? dateString);
  }

  return getStateOrDefault(now);
}
