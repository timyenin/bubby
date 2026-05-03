import { todayString } from './dates.ts';
import {
  addMemoryEntry,
  canonicalizeDailyLog,
  getCanonicalDailyLog,
  getOrInitCanonicalDailyLog,
  getPantry,
  getUserProfile,
  normalizeMacroTotals,
  removeMemoryByContent,
  setDailyLog,
  setPantry,
  setUserProfile,
  sumMealTotals,
  type DailyLog,
  type MacroTotals,
  type MemoryCategory,
  type Meal,
  type Pantry,
  type PantryItemMacros,
  type UserProfile,
} from './storage.ts';

type MacroActionPayload = Partial<Record<keyof MacroTotals, number | string>> & {
  serving_size?: unknown;
};

export type ActionType =
  | 'log_meal'
  | 'log_weight'
  | 'set_workout_day'
  | 'update_pantry'
  | 'update_pantry_macros'
  | 'update_rule'
  | 'update_macros'
  | 'save_memory'
  | 'forget_memory'
  | 'delete_meal'
  | 'update_meal'
  | 'replace_daily_log'
  | 'play_animation'
  | 'onboarding_complete';

export interface ActionData {
  description?: string;
  date?: string;
  meal_id?: string;
  macros?: MacroActionPayload;
  meals?: unknown[];
  weight_lbs?: number | string;
  is_workout_day?: boolean;
  training_type?: string;
  item_name?: string;
  content?: string;
  category?: MemoryCategory | string;
  memory_content?: string;
  added?: unknown[];
  removed?: unknown[];
  add?: unknown[];
  remove?: unknown[];
  rest_day?: Partial<Record<keyof MacroTotals, number | string>>;
  workout_day?: Partial<Record<keyof MacroTotals, number | string>>;
  calorie_floor?: number | string;
  profile?: unknown;
  animation?: string;
  count?: number | string;
}

export interface ParsedAction {
  type: ActionType | string;
  data: ActionData;
}

export interface ApplyActionOptions {
  dateString?: string;
  now?: Date;
  returnMutationResult?: boolean;
}

export type ActionMutationStatus =
  | 'inserted'
  | 'updated'
  | 'deleted'
  | 'replaced'
  | 'skipped_duplicate'
  | 'noop';

export interface ActionMutationResult {
  action: ParsedAction | null | undefined;
  type: string | null | undefined;
  status: ActionMutationStatus;
  changed: boolean;
  dateString?: string;
  value?: unknown;
}

interface AppliedActionResult<T = unknown> {
  value: T;
  mutation: ActionMutationResult;
}

const ACTION_PATTERN = /\[ACTION\]([\s\S]*?)\[\/ACTION\]/g;
const MACRO_KEYS: Array<keyof MacroTotals> = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
const MEMORY_CATEGORIES: MemoryCategory[] = [
  'preference',
  'rule',
  'context',
  'goal',
  'health',
  'schedule',
  'other',
];
const DERIVED_ADHERENCE_FLAG_PREFIXES = [
  'calorie_floor_penalty_applied',
  'protein_target_vitals_awarded',
  'sick_recovery_meals:',
];
const DUPLICATE_MEAL_WINDOW_MS = 3 * 60 * 1000;

function timestampFrom(now: Date | string | number): string {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function isValidDateString(dateString: unknown): dateString is string {
  if (typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const [year, month, day] = dateString.split('-').map(Number);
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

function parseActionJson(rawJson: string): unknown {
  try {
    return JSON.parse(rawJson);
  } catch {
    return null;
  }
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeMacros(macros: ActionData['macros'] = {}): MacroTotals {
  return normalizeMacroTotals(macros);
}

function normalizeMacroUpdates(macros: ActionData['rest_day'] = {}): Partial<MacroTotals> {
  return MACRO_KEYS.reduce<Partial<MacroTotals>>((updates, key) => {
    if (Object.hasOwn(macros ?? {}, key)) {
      const value = Number(macros?.[key]);
      if (Number.isFinite(value)) {
        updates[key] = value;
      }
    }

    return updates;
  }, {});
}

function normalizeMemoryCategory(category: unknown): MemoryCategory {
  return MEMORY_CATEGORIES.includes(category as MemoryCategory)
    ? (category as MemoryCategory)
    : 'other';
}

function normalizePantryItemMacros(macros: ActionData['macros']): PantryItemMacros | null {
  if (!macros || typeof macros !== 'object') {
    return null;
  }

  const normalizedMacros = normalizeMacros(macros);
  const servingSize = String(macros.serving_size ?? '').trim();

  if (!servingSize) {
    return null;
  }

  return {
    ...normalizedMacros,
    serving_size: servingSize,
  };
}

function lowerSet(values: string[]): Set<string> {
  return new Set(values.map((value) => String(value).toLowerCase()));
}

function mutationResult(
  action: ParsedAction | null | undefined,
  status: ActionMutationStatus,
  value: unknown,
  dateString?: string,
): ActionMutationResult {
  return {
    action,
    type: action?.type,
    status,
    changed: ['inserted', 'updated', 'deleted', 'replaced'].includes(status),
    ...(dateString ? { dateString } : {}),
    value,
  };
}

function appliedResult<T>(
  action: ParsedAction | null | undefined,
  status: ActionMutationStatus,
  value: T,
  dateString?: string,
): AppliedActionResult<T> {
  return {
    value,
    mutation: mutationResult(action, status, value, dateString),
  };
}

function returnAppliedResult<T>(
  result: AppliedActionResult<T>,
  options: ApplyActionOptions,
): T | ActionMutationResult {
  return options.returnMutationResult ? result.mutation : result.value;
}

function normalizedDescriptionKey(description: unknown): string {
  return String(description ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function macroSignature(macros: unknown): string {
  return JSON.stringify(normalizeMacros(macros as ActionData['macros']));
}

function isDuplicateMeal(existingMeal: Meal, nextMeal: Meal): boolean {
  const existingTime = Date.parse(existingMeal.logged_at);
  const nextTime = Date.parse(nextMeal.logged_at);

  return (
    normalizedDescriptionKey(existingMeal.description) === normalizedDescriptionKey(nextMeal.description) &&
    macroSignature(existingMeal.macros) === macroSignature(nextMeal.macros) &&
    Number.isFinite(existingTime) &&
    Number.isFinite(nextTime) &&
    Math.abs(existingTime - nextTime) <= DUPLICATE_MEAL_WINDOW_MS
  );
}

function removeDerivedAdherenceFlags(flags: string[] = []): string[] {
  return flags.filter((flag) =>
    !DERIVED_ADHERENCE_FLAG_PREFIXES.some((prefix) => flag.startsWith(prefix)),
  );
}

function normalizeReplacementMeals(meals: unknown, now: Date): Meal[] {
  if (!Array.isArray(meals)) {
    return [];
  }

  const baseTimestamp = now.getTime();
  return meals
    .filter((meal): meal is { description?: unknown; macros?: ActionData['macros'] } =>
      meal !== null && typeof meal === 'object',
    )
    .map((meal, index) => ({
      id: `meal_${new Date(baseTimestamp + index).toISOString().replace(/[^0-9]/g, '')}_${index + 1}`,
      logged_at: new Date(baseTimestamp + index).toISOString(),
      description: String(meal.description ?? '').trim(),
      macros: normalizeMacros(meal.macros),
    }))
    .filter((meal) => meal.description);
}

function applyLogMeal(
  action: ParsedAction,
  { dateString = todayString(), now = new Date() }: ApplyActionOptions = {},
): AppliedActionResult<DailyLog | null> {
  const description = String(action.data?.description ?? '').trim();
  if (!description) {
    return appliedResult(action, 'noop', null);
  }

  const targetDateString = resolveActionDate(action.data?.date, dateString);
  const log = getOrInitCanonicalDailyLog(targetDateString);
  const meals = log.meals ?? [];
  const loggedAt = timestampFrom(now);
  const nextMeal: Meal = {
    id: `meal_${loggedAt.replace(/[^0-9]/g, '')}_${meals.length + 1}`,
    logged_at: loggedAt,
    description,
    macros: normalizeMacros(action.data?.macros),
  };

  if (meals.some((meal) => isDuplicateMeal(meal, nextMeal))) {
    return appliedResult(action, 'skipped_duplicate', log, targetDateString);
  }

  const nextMeals: Meal[] = [
    ...meals,
    nextMeal,
  ];
  const nextLog: DailyLog = {
    ...log,
    meals: nextMeals,
    totals: sumMealTotals(nextMeals),
  };

  return appliedResult(action, 'inserted', setDailyLog(targetDateString, nextLog), targetDateString);
}

function applyLogWeight(action: ParsedAction): AppliedActionResult<UserProfile | null> {
  const weight = Number(action.data?.weight_lbs);
  const profile = getUserProfile();
  if (!profile || !Number.isFinite(weight)) {
    return appliedResult(action, 'noop', null);
  }

  return appliedResult(action, 'updated', setUserProfile({
    ...profile,
    current_weight_lbs: weight,
  }));
}

function applySetWorkoutDay(
  action: ParsedAction,
  { dateString = todayString() }: ApplyActionOptions = {},
): AppliedActionResult<DailyLog> {
  const targetDateString = resolveActionDate(action.data?.date, dateString);
  const log = getOrInitCanonicalDailyLog(targetDateString);
  const isWorkoutDay = Boolean(action.data?.is_workout_day);
  if (log.is_workout_day === isWorkoutDay) {
    return appliedResult(action, 'noop', log, targetDateString);
  }

  const nextLog: DailyLog = {
    ...log,
    is_workout_day: isWorkoutDay,
  };

  return appliedResult(action, 'updated', setDailyLog(targetDateString, nextLog), targetDateString);
}

function applyDeleteMeal(
  action: ParsedAction,
  { dateString = todayString() }: ApplyActionOptions = {},
): AppliedActionResult<DailyLog | null> {
  const mealId = String(action.data?.meal_id ?? '').trim();
  if (!mealId) {
    return appliedResult(action, 'noop', null);
  }

  const targetDateString = resolveActionDate(action.data?.date, dateString);
  const log = getCanonicalDailyLog(targetDateString);
  if (!log) {
    return appliedResult(action, 'noop', null, targetDateString);
  }

  const nextMeals = log.meals.filter((meal) => meal.id !== mealId);
  if (nextMeals.length === log.meals.length) {
    return appliedResult(action, 'noop', log, targetDateString);
  }

  const nextLog: DailyLog = {
    ...log,
    meals: nextMeals,
    totals: sumMealTotals(nextMeals),
  };

  return appliedResult(action, 'deleted', setDailyLog(targetDateString, nextLog), targetDateString);
}

function applyUpdateMeal(
  action: ParsedAction,
  { dateString = todayString() }: ApplyActionOptions = {},
): AppliedActionResult<DailyLog | null> {
  const mealId = String(action.data?.meal_id ?? '').trim();
  if (!mealId) {
    return appliedResult(action, 'noop', null);
  }

  const targetDateString = resolveActionDate(action.data?.date, dateString);
  const log = getCanonicalDailyLog(targetDateString);
  if (!log) {
    return appliedResult(action, 'noop', null, targetDateString);
  }

  const mealIndex = log.meals.findIndex((meal) => meal.id === mealId);
  if (mealIndex < 0) {
    return appliedResult(action, 'noop', log, targetDateString);
  }

  const nextMeals = [...log.meals];
  const currentMeal = nextMeals[mealIndex];
  nextMeals[mealIndex] = {
    ...currentMeal,
    ...(action.data?.description !== undefined
      ? { description: String(action.data.description).trim() }
      : {}),
    ...(action.data?.macros !== undefined
      ? { macros: normalizeMacros(action.data.macros) }
      : {}),
  };

  const nextLog: DailyLog = {
    ...log,
    meals: nextMeals,
    totals: sumMealTotals(nextMeals),
  };

  return appliedResult(action, 'updated', setDailyLog(targetDateString, nextLog), targetDateString);
}

function applyReplaceDailyLog(
  action: ParsedAction,
  { dateString = todayString(), now = new Date() }: ApplyActionOptions = {},
): AppliedActionResult<DailyLog | null> {
  const targetDateString = resolveActionDate(action.data?.date, dateString);
  const nextMeals = normalizeReplacementMeals(action.data?.meals, now);
  if (nextMeals.length === 0) {
    return appliedResult(action, 'noop', null, targetDateString);
  }

  const existingLog = getCanonicalDailyLog(targetDateString);
  const fallbackLog = canonicalizeDailyLog({ date: targetDateString }, targetDateString);
  const baseLog = existingLog ?? fallbackLog;
  const nextLog: DailyLog = {
    ...baseLog,
    date: targetDateString,
    is_workout_day: typeof action.data?.is_workout_day === 'boolean'
      ? action.data.is_workout_day
      : baseLog.is_workout_day,
    weigh_in_lbs: baseLog.weigh_in_lbs,
    meals: nextMeals,
    totals: sumMealTotals(nextMeals),
    adherence_flags: removeDerivedAdherenceFlags(baseLog.adherence_flags),
  };

  return appliedResult(action, 'replaced', setDailyLog(targetDateString, nextLog), targetDateString);
}

function applyUpdatePantry(
  action: ParsedAction,
  { now = new Date() }: ApplyActionOptions = {},
): Pantry {
  const pantry: Pantry =
    getPantry() ?? { items: [], last_updated: '' };
  const removed = lowerSet(normalizeStringList(action.data?.removed ?? action.data?.remove));
  const added = normalizeStringList(action.data?.added ?? action.data?.add);
  const nextItems = (pantry.items ?? []).filter(
    (item) => !removed.has(String(item.name).toLowerCase()),
  );
  const existing = lowerSet(nextItems.map((item) => item.name));

  for (const name of added) {
    if (!existing.has(name.toLowerCase())) {
      nextItems.push({ name, category: 'unsorted', always: true });
      existing.add(name.toLowerCase());
    }
  }

  return setPantry({
    ...pantry,
    items: nextItems,
    last_updated: timestampFrom(now),
  });
}

function applyUpdatePantryMacros(
  action: ParsedAction,
  { now = new Date() }: ApplyActionOptions = {},
): Pantry | null {
  const itemName = String(action.data?.item_name ?? '').trim();
  const macros = normalizePantryItemMacros(action.data?.macros);
  if (!itemName || !macros) {
    return null;
  }

  const pantry: Pantry = getPantry() ?? { items: [], last_updated: '' };
  const itemIndex = (pantry.items ?? []).findIndex(
    (item) => item.name.toLowerCase() === itemName.toLowerCase(),
  );
  const items = [...(pantry.items ?? [])];

  if (itemIndex >= 0) {
    items[itemIndex] = {
      ...items[itemIndex],
      macros,
    };
  } else {
    items.push({
      name: itemName,
      category: 'unsorted',
      always: true,
      macros,
    });
  }

  return setPantry({
    ...pantry,
    items,
    last_updated: timestampFrom(now),
  });
}

function emptyMacros(): MacroTotals {
  return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
}

function applyUpdateRule(action: ParsedAction): UserProfile | null {
  const profile = getUserProfile();
  if (!profile) {
    return null;
  }

  const removed = lowerSet(normalizeStringList(action.data?.removed ?? action.data?.remove));
  const added = normalizeStringList(action.data?.added ?? action.data?.add);
  const nextRules = (profile.established_rules ?? []).filter(
    (rule) => !removed.has(String(rule).toLowerCase()),
  );
  const existing = lowerSet(nextRules);

  for (const rule of added) {
    if (!existing.has(rule.toLowerCase())) {
      nextRules.push(rule);
      existing.add(rule.toLowerCase());
    }
  }

  return setUserProfile({
    ...profile,
    established_rules: nextRules,
  });
}

function applyUpdateMacros(action: ParsedAction): UserProfile | null {
  const profile = getUserProfile();
  if (!profile) {
    return null;
  }

  const existingTargets = profile.macro_targets ?? {
    rest_day: emptyMacros(),
    workout_day: emptyMacros(),
  };
  const calorieFloor = Number(action.data?.calorie_floor);
  const hasCalorieFloor = Object.hasOwn(action.data ?? {}, 'calorie_floor') && Number.isFinite(calorieFloor);
  const nextProfile: UserProfile = {
    ...profile,
    macro_targets: {
      rest_day: {
        ...existingTargets.rest_day,
        ...normalizeMacroUpdates(action.data?.rest_day),
      },
      workout_day: {
        ...existingTargets.workout_day,
        ...normalizeMacroUpdates(action.data?.workout_day),
      },
    },
    calorie_floor: hasCalorieFloor ? calorieFloor : profile.calorie_floor,
  };

  return setUserProfile(nextProfile);
}

function applySaveMemory(action: ParsedAction): unknown {
  const content = String(action.data?.content ?? '').trim();
  if (!content) {
    return null;
  }

  return addMemoryEntry({
    content,
    category: normalizeMemoryCategory(action.data?.category),
  });
}

function applyForgetMemory(action: ParsedAction): unknown {
  const memoryContent = String(action.data?.memory_content ?? '').trim();
  if (!memoryContent) {
    return null;
  }

  return removeMemoryByContent(memoryContent);
}

function isActionShape(value: unknown): value is { type: unknown; data?: unknown } {
  return typeof value === 'object' && value !== null && 'type' in value;
}

export function parseActions(reply = ''): ParsedAction[] {
  return Array.from(reply.matchAll(ACTION_PATTERN))
    .map((match) => parseActionJson(match[1]))
    .filter((action): action is { type: string; data?: ActionData } => {
      return isActionShape(action) && typeof action.type === 'string';
    })
    .map((action) => ({
      type: action.type,
      data: (action.data as ActionData) ?? {},
    }));
}

export function stripActionEnvelopes(reply = ''): string {
  return reply.replace(ACTION_PATTERN, '').trim();
}

export function applyAction(
  action: ParsedAction | null | undefined,
  options: ApplyActionOptions = {},
): unknown {
  if (!action) {
    const result = appliedResult(action, 'noop', null);
    return returnAppliedResult(result, options);
  }

  function returnRawMutation(value: unknown, status: ActionMutationStatus = value === null ? 'noop' : 'updated') {
    return returnAppliedResult(
      appliedResult(action, status, value),
      options,
    );
  }

  switch (action?.type) {
    case 'log_meal':
      return returnAppliedResult(applyLogMeal(action, options), options);
    case 'log_weight':
      return returnAppliedResult(applyLogWeight(action), options);
    case 'set_workout_day':
      return returnAppliedResult(applySetWorkoutDay(action, options), options);
    case 'delete_meal':
      return returnAppliedResult(applyDeleteMeal(action, options), options);
    case 'update_meal':
      return returnAppliedResult(applyUpdateMeal(action, options), options);
    case 'replace_daily_log':
      return returnAppliedResult(applyReplaceDailyLog(action, options), options);
    case 'update_pantry':
      return returnRawMutation(applyUpdatePantry(action, options));
    case 'update_pantry_macros':
      return returnRawMutation(applyUpdatePantryMacros(action, options));
    case 'update_rule':
      return returnRawMutation(applyUpdateRule(action));
    case 'update_macros':
      return returnRawMutation(applyUpdateMacros(action));
    case 'save_memory':
      return returnRawMutation(applySaveMemory(action));
    case 'forget_memory':
      return returnRawMutation(applyForgetMemory(action));
    case 'play_animation':
      return returnRawMutation(null, 'noop');
    case 'onboarding_complete':
      return returnRawMutation(null, 'noop');
    default:
      return returnRawMutation(null, 'noop');
  }
}

export function applyActions(
  actions: ParsedAction[],
  options: ApplyActionOptions = {},
): unknown[] {
  return actions.map((action) => applyAction(action, options));
}
