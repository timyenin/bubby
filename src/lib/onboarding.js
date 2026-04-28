import {
  calculateBMR,
  calculateCalorieFloor,
  calculateMacroTargets,
} from './macros.js';
import { todayString } from './dates.js';
import { parseActions, stripActionEnvelopes } from './actions.js';

export { parseActions, stripActionEnvelopes };

export const ONBOARDING_OPENING_LINE =
  "oh — hi. i don't know anything yet. what should i call you?";
export const ONBOARDING_HOME_CLOSING_LINE =
  "this is just my first guess. tell me when something's off and i'll adjust.";

function resolveActivityFactor(activityLevel) {
  const normalized = String(activityLevel ?? '').toLowerCase();

  if (normalized.includes('active') || normalized.includes('restaurant')) {
    return 'active';
  }

  if (normalized.includes('sedentary')) {
    return 'sedentary';
  }

  return 'moderate';
}

function normalizeTrainingSchedule(trainingSchedule) {
  if (trainingSchedule && typeof trainingSchedule === 'object' && !Array.isArray(trainingSchedule)) {
    return trainingSchedule;
  }

  return {};
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(Boolean).map(String);
}

export function parseOnboardingCompleteAction(reply) {
  for (const action of parseActions(reply)) {

    if (action?.type === 'onboarding_complete' && action.data?.profile) {
      return action.data;
    }
  }

  return null;
}

export function getOnboardingRoute(isOnboardingComplete) {
  return isOnboardingComplete === true ? 'home' : 'onboarding';
}

export function buildOnboardingPlan(profileData, now = todayString()) {
  const activityFactor = resolveActivityFactor(profileData.activity_level);
  const restDay = calculateMacroTargets({
    weightLbs: profileData.current_weight_lbs,
    heightInches: profileData.height_inches,
    age: profileData.age,
    activityFactor,
    isWorkoutDay: false,
  });
  const workoutDay = calculateMacroTargets({
    weightLbs: profileData.current_weight_lbs,
    heightInches: profileData.height_inches,
    age: profileData.age,
    activityFactor,
    isWorkoutDay: true,
  });
  const bmr = calculateBMR({
    weightLbs: profileData.current_weight_lbs,
    heightInches: profileData.height_inches,
    age: profileData.age,
  });
  const calorieFloor = calculateCalorieFloor(bmr);
  const pantryItems = normalizeArray(profileData.pantry_items);
  const establishedRules = normalizeArray(profileData.established_rules);

  const profile = {
    name: profileData.name ?? '',
    preferred_name: profileData.preferred_name ?? null,
    age: profileData.age,
    height_inches: profileData.height_inches,
    starting_weight_lbs: profileData.current_weight_lbs,
    current_weight_lbs: profileData.current_weight_lbs,
    goal: profileData.goal ?? '',
    activity_level: profileData.activity_level ?? '',
    training_schedule: normalizeTrainingSchedule(profileData.training_schedule),
    macro_targets: {
      rest_day: restDay,
      workout_day: workoutDay,
    },
    calorie_floor: calorieFloor,
    established_rules: establishedRules,
    work_food_access: profileData.work_food_access ?? '',
    created_at: now,
    last_recalibration_weight: profileData.current_weight_lbs,
  };

  const pantry = {
    items: pantryItems.map((name) => ({
      name,
      category: 'unsorted',
      always: true,
    })),
    last_updated: now,
  };

  return {
    profile,
    pantry,
    reveal: {
      rest_day: restDay,
      workout_day: workoutDay,
      calorie_floor: calorieFloor,
    },
  };
}
