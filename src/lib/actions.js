import { todayString } from './dates.js';
import {
  getOrInitDailyLog,
  getPantry,
  getUserProfile,
  setDailyLog,
  setPantry,
  setUserProfile,
} from './storage.js';

/**
 * Supported action envelopes:
 *
 * @typedef {object} LogMealAction
 * @property {'log_meal'} type
 * @property {{description: string, date?: string, macros: {calories: number, protein_g: number, carbs_g: number, fat_g: number}}} data
 *
 * @typedef {object} LogWeightAction
 * @property {'log_weight'} type
 * @property {{weight_lbs: number, date?: string}} data
 *
 * @typedef {object} SetWorkoutDayAction
 * @property {'set_workout_day'} type
 * @property {{is_workout_day: boolean, training_type?: string}} data
 *
 * @typedef {object} UpdatePantryAction
 * @property {'update_pantry'} type
 * @property {{added?: string[], removed?: string[]}} data
 *
 * @typedef {object} UpdateRuleAction
 * @property {'update_rule'} type
 * @property {{added?: string[], removed?: string[]}} data
 *
 * @typedef {object} OnboardingCompleteAction
 * @property {'onboarding_complete'} type
 * @property {{profile: object}} data
 *
 * log_meal is intentionally additive: dispatching the same action twice logs two
 * meals because users can eat the same meal twice. Set-like updates de-dupe.
 */

const ACTION_PATTERN = /\[ACTION\]([\s\S]*?)\[\/ACTION\]/g;
const MACRO_KEYS = ['calories', 'protein_g', 'carbs_g', 'fat_g'];

function timestampFrom(now) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function isValidDateString(dateString) {
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

function resolveActionDate(actionDate, fallbackDateString) {
  return isValidDateString(actionDate) ? actionDate : fallbackDateString;
}

function parseActionJson(rawJson) {
  try {
    return JSON.parse(rawJson);
  } catch {
    return null;
  }
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeMacros(macros = {}) {
  return MACRO_KEYS.reduce((normalized, key) => {
    const value = Number(macros[key] ?? 0);
    return {
      ...normalized,
      [key]: Number.isFinite(value) ? value : 0,
    };
  }, {});
}

function sumMealTotals(meals) {
  return meals.reduce(
    (totals, meal) => {
      const macros = normalizeMacros(meal.macros);

      return MACRO_KEYS.reduce(
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

function lowerSet(values) {
  return new Set(values.map((value) => String(value).toLowerCase()));
}

function applyLogMeal(action, { dateString = todayString(), now = new Date() } = {}) {
  const description = String(action.data?.description ?? '').trim();
  if (!description) {
    return null;
  }

  const targetDateString = resolveActionDate(action.data?.date, dateString);
  const log = getOrInitDailyLog(targetDateString);
  const meals = log.meals ?? [];
  const loggedAt = timestampFrom(now);
  const nextMeals = [
    ...meals,
    {
      id: `meal_${loggedAt.replace(/[^0-9]/g, '')}_${meals.length + 1}`,
      logged_at: loggedAt,
      description,
      macros: normalizeMacros(action.data?.macros),
    },
  ];
  const nextLog = {
    ...log,
    meals: nextMeals,
    totals: sumMealTotals(nextMeals),
  };

  return setDailyLog(targetDateString, nextLog);
}

function applyLogWeight(action) {
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

function applySetWorkoutDay(action, { dateString = todayString() } = {}) {
  const log = getOrInitDailyLog(dateString);
  const nextLog = {
    ...log,
    is_workout_day: Boolean(action.data?.is_workout_day),
  };

  return setDailyLog(dateString, nextLog);
}

function applyUpdatePantry(action, { now = new Date() } = {}) {
  const pantry = getPantry() ?? { items: [], last_updated: null };
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

function applyUpdateRule(action) {
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

export function parseActions(reply = '') {
  return Array.from(reply.matchAll(ACTION_PATTERN))
    .map((match) => parseActionJson(match[1]))
    .filter((action) => typeof action?.type === 'string')
    .map((action) => ({
      type: action.type,
      data: action.data ?? {},
    }));
}

export function stripActionEnvelopes(reply = '') {
  return reply.replace(ACTION_PATTERN, '').trim();
}

export function applyAction(action, options = {}) {
  switch (action?.type) {
    case 'log_meal':
      return applyLogMeal(action, options);
    case 'log_weight':
      return applyLogWeight(action, options);
    case 'set_workout_day':
      return applySetWorkoutDay(action, options);
    case 'update_pantry':
      return applyUpdatePantry(action, options);
    case 'update_rule':
      return applyUpdateRule(action, options);
    case 'onboarding_complete':
      return null;
    default:
      return null;
  }
}

export function applyActions(actions, options = {}) {
  return actions.map((action) => applyAction(action, options));
}
