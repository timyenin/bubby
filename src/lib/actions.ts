import { todayString } from './dates.ts';
import {
  addMemoryEntry,
  getOrInitDailyLog,
  getPantry,
  getUserProfile,
  removeMemoryByContent,
  setDailyLog,
  setPantry,
  setUserProfile,
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
  | 'onboarding_complete';

export interface ActionData {
  description?: string;
  date?: string;
  macros?: MacroActionPayload;
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
}

export interface ParsedAction {
  type: ActionType | string;
  data: ActionData;
}

export interface ApplyActionOptions {
  dateString?: string;
  now?: Date;
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
  return MACRO_KEYS.reduce<MacroTotals>(
    (normalized, key) => {
      const value = Number(macros?.[key] ?? 0);
      normalized[key] = Number.isFinite(value) ? value : 0;
      return normalized;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
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

function sumMealTotals(meals: Meal[]): MacroTotals {
  return meals.reduce<MacroTotals>(
    (totals, meal) => {
      const macros = normalizeMacros(meal.macros);

      return MACRO_KEYS.reduce<MacroTotals>(
        (nextTotals, key) => ({
          ...nextTotals,
          [key]: nextTotals[key] + macros[key],
        }),
        totals,
      );
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

function lowerSet(values: string[]): Set<string> {
  return new Set(values.map((value) => String(value).toLowerCase()));
}

function applyLogMeal(
  action: ParsedAction,
  { dateString = todayString(), now = new Date() }: ApplyActionOptions = {},
): DailyLog | null {
  const description = String(action.data?.description ?? '').trim();
  if (!description) {
    return null;
  }

  const targetDateString = resolveActionDate(action.data?.date, dateString);
  const log = getOrInitDailyLog(targetDateString);
  const meals = log.meals ?? [];
  const loggedAt = timestampFrom(now);
  const nextMeals: Meal[] = [
    ...meals,
    {
      id: `meal_${loggedAt.replace(/[^0-9]/g, '')}_${meals.length + 1}`,
      logged_at: loggedAt,
      description,
      macros: normalizeMacros(action.data?.macros),
    },
  ];
  const nextLog: DailyLog = {
    ...log,
    meals: nextMeals,
    totals: sumMealTotals(nextMeals),
  };

  return setDailyLog(targetDateString, nextLog);
}

function applyLogWeight(action: ParsedAction): UserProfile | null {
  const weight = Number(action.data?.weight_lbs);
  const profile = getUserProfile();
  if (!profile || !Number.isFinite(weight)) {
    return null;
  }

  return setUserProfile({
    ...profile,
    current_weight_lbs: weight,
  });
}

function applySetWorkoutDay(
  action: ParsedAction,
  { dateString = todayString() }: ApplyActionOptions = {},
): DailyLog {
  const log = getOrInitDailyLog(dateString);
  const nextLog: DailyLog = {
    ...log,
    is_workout_day: Boolean(action.data?.is_workout_day),
  };

  return setDailyLog(dateString, nextLog);
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
  switch (action?.type) {
    case 'log_meal':
      return applyLogMeal(action, options);
    case 'log_weight':
      return applyLogWeight(action);
    case 'set_workout_day':
      return applySetWorkoutDay(action, options);
    case 'update_pantry':
      return applyUpdatePantry(action, options);
    case 'update_pantry_macros':
      return applyUpdatePantryMacros(action, options);
    case 'update_rule':
      return applyUpdateRule(action);
    case 'update_macros':
      return applyUpdateMacros(action);
    case 'save_memory':
      return applySaveMemory(action);
    case 'forget_memory':
      return applyForgetMemory(action);
    case 'onboarding_complete':
      return null;
    default:
      return null;
  }
}

export function applyActions(
  actions: ParsedAction[],
  options: ApplyActionOptions = {},
): unknown[] {
  return actions.map((action) => applyAction(action, options));
}
