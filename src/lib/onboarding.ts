import {
  calculateBMR,
  calculateCalorieFloor,
  calculateMacroTargets,
  type ActivityLevel,
  type MacroTargets,
} from './macros.ts';
import { todayString } from './dates.ts';
import { parseActions, stripActionEnvelopes } from './actions.ts';
import type { Pantry, UserProfile } from './storage.ts';

export { parseActions, stripActionEnvelopes };

export const ONBOARDING_OPENING_LINE =
  "oh — hi. i don't know anything yet. what should i call you?";
export const ONBOARDING_HOME_CLOSING_LINE =
  "this is just my first guess. tell me when something's off and i'll adjust.";

export type OnboardingRoute = 'home' | 'onboarding';

export interface OnboardingProfileData {
  name?: string;
  preferred_name?: string | null;
  age: number;
  height_inches: number;
  current_weight_lbs: number;
  goal?: string;
  activity_level?: string;
  training_schedule?: Record<string, string> | null;
  pantry_items?: unknown[];
  established_rules?: unknown[];
  work_food_access?: string;
}

export interface OnboardingCompleteData {
  profile?: OnboardingProfileData;
  [key: string]: unknown;
}

export interface OnboardingPlan {
  profile: UserProfile;
  pantry: Pantry;
  reveal: {
    rest_day: MacroTargets;
    workout_day: MacroTargets;
    calorie_floor: number;
  };
}

function resolveActivityFactor(activityLevel: unknown): ActivityLevel {
  const normalized = String(activityLevel ?? '').toLowerCase();

  if (normalized.includes('active') || normalized.includes('restaurant')) {
    return 'active';
  }

  if (normalized.includes('sedentary')) {
    return 'sedentary';
  }

  return 'moderate';
}

function normalizeTrainingSchedule(
  trainingSchedule: unknown,
): Record<string, string> {
  if (
    trainingSchedule &&
    typeof trainingSchedule === 'object' &&
    !Array.isArray(trainingSchedule)
  ) {
    return trainingSchedule as Record<string, string>;
  }

  return {};
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(Boolean).map(String);
}

export function parseOnboardingCompleteAction(reply: string): OnboardingCompleteData | null {
  for (const action of parseActions(reply)) {
    if (action?.type === 'onboarding_complete' && action.data?.profile) {
      return action.data as OnboardingCompleteData;
    }
  }

  return null;
}

export function getOnboardingRoute(isOnboardingComplete: boolean): OnboardingRoute {
  return isOnboardingComplete === true ? 'home' : 'onboarding';
}

export function buildOnboardingPlan(
  profileData: OnboardingProfileData,
  now: string = todayString(),
): OnboardingPlan {
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

  const profile: UserProfile = {
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

  const pantry: Pantry = {
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
