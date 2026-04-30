const LBS_TO_KG = 0.45359237;
const INCHES_TO_CM = 2.54;
const PROTEIN_CALORIES_PER_GRAM = 4;
const CARB_CALORIES_PER_GRAM = 4;
const FAT_CALORIES_PER_GRAM = 9;
const DEFAULT_CUT_DEFICIT = 650;
const WORKOUT_DAY_CALORIE_BUMP = 175;
const FAT_CALORIE_RATIO = 0.27;

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'moderate' | 'active';

export interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface DailyTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface WeightEntry {
  date?: string;
  weight_lbs?: number;
  weightLbs?: number;
}

export interface MacrosUserProfile {
  weightLbs: number;
  heightInches: number;
  age: number;
  sex?: Sex;
  activityFactor?: ActivityLevel | number;
  isWorkoutDay?: boolean;
}

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.4,
  moderate: 1.55,
  active: 1.7,
};

function round(value: number): number {
  return Math.round(value);
}

function resolveActivityFactor(activityFactor: ActivityLevel | number | undefined): number {
  if (typeof activityFactor === 'number') {
    return activityFactor;
  }

  return ACTIVITY_FACTORS[activityFactor as ActivityLevel] ?? ACTIVITY_FACTORS.moderate;
}

function getWeightValue(entry: number | WeightEntry): number | undefined {
  if (typeof entry === 'number') {
    return entry;
  }

  return entry.weight_lbs ?? entry.weightLbs;
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Calculate BMR using the Mifflin-St Jeor formula.
 */
export function calculateBMR({
  weightLbs,
  heightInches,
  age,
  sex = 'male',
}: {
  weightLbs: number;
  heightInches: number;
  age: number;
  sex?: Sex;
}): number {
  const weightKg = weightLbs * LBS_TO_KG;
  const heightCm = heightInches * INCHES_TO_CM;
  const sexOffset = sex === 'female' ? -161 : 5;
  return round(10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset);
}

/**
 * Calculate TDEE from BMR and an activity factor.
 */
export function calculateTDEE(bmr: number, activityFactor: ActivityLevel | number): number {
  return round(bmr * resolveActivityFactor(activityFactor));
}

/**
 * Calculate the hard calorie floor from SPEC §11.
 */
export function calculateCalorieFloor(bmr: number): number {
  return round(Math.max(1500, bmr * 1.1));
}

/**
 * Calculate daily macro targets for a rest or workout day.
 */
export function calculateMacroTargets({
  weightLbs,
  heightInches,
  age,
  sex = 'male',
  activityFactor = 'moderate',
  isWorkoutDay = false,
}: MacrosUserProfile): MacroTargets {
  const bmr = calculateBMR({ weightLbs, heightInches, age, sex });
  const tdee = calculateTDEE(bmr, activityFactor);
  const floor = calculateCalorieFloor(bmr);
  const workoutCalories = isWorkoutDay ? WORKOUT_DAY_CALORIE_BUMP : 0;
  const calories = round(Math.max(floor, tdee - DEFAULT_CUT_DEFICIT + workoutCalories));
  const protein_g = round(weightLbs);
  const fat_g = round((calories * FAT_CALORIE_RATIO) / FAT_CALORIES_PER_GRAM);
  const proteinCalories = protein_g * PROTEIN_CALORIES_PER_GRAM;
  const fatCalories = fat_g * FAT_CALORIES_PER_GRAM;
  const carbs_g = Math.max(
    0,
    round((calories - proteinCalories - fatCalories) / CARB_CALORIES_PER_GRAM),
  );

  return { calories, protein_g, carbs_g, fat_g };
}

/**
 * Calculate percent bodyweight lost per week by comparing average weight from
 * the latest 7 entries to the prior 7 entries.
 */
export function calculateWeightLossRate(weightHistory: Array<number | WeightEntry>): number {
  if (!Array.isArray(weightHistory) || weightHistory.length < 14) {
    return 0;
  }

  const sortedHistory = [...weightHistory].sort((a, b) => {
    const aDate = typeof a === 'object' ? a.date : undefined;
    const bDate = typeof b === 'object' ? b.date : undefined;
    if (!aDate || !bDate) {
      return 0;
    }
    return aDate.localeCompare(bDate);
  });
  const latestSeven = sortedHistory.slice(-7).map(getWeightValue);
  const priorSeven = sortedHistory.slice(-14, -7).map(getWeightValue);

  if (
    latestSeven.some((value) => typeof value !== 'number') ||
    priorSeven.some((value) => typeof value !== 'number')
  ) {
    return 0;
  }

  const latestAverage = average(latestSeven as number[]);
  const priorAverage = average(priorSeven as number[]);
  if (priorAverage <= 0 || latestAverage >= priorAverage) {
    return 0;
  }

  return Number((((priorAverage - latestAverage) / priorAverage) * 100).toFixed(2));
}

/**
 * Check whether a calorie total is below the hard calorie floor.
 */
export function isUnderCalorieFloor(
  dailyTotal: number | { calories: number },
  floor: number,
): boolean {
  const calories = typeof dailyTotal === 'number' ? dailyTotal : dailyTotal.calories;
  return calories < floor;
}
