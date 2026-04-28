const LBS_TO_KG = 0.45359237;
const INCHES_TO_CM = 2.54;
const PROTEIN_CALORIES_PER_GRAM = 4;
const CARB_CALORIES_PER_GRAM = 4;
const FAT_CALORIES_PER_GRAM = 9;
const DEFAULT_CUT_DEFICIT = 650;
const WORKOUT_DAY_CALORIE_BUMP = 175;
const FAT_CALORIE_RATIO = 0.27;

const ACTIVITY_FACTORS = {
  sedentary: 1.4,
  moderate: 1.55,
  active: 1.7,
};

function round(value) {
  return Math.round(value);
}

function resolveActivityFactor(activityFactor) {
  if (typeof activityFactor === 'number') {
    return activityFactor;
  }

  return ACTIVITY_FACTORS[activityFactor] ?? ACTIVITY_FACTORS.moderate;
}

function getWeightValue(entry) {
  if (typeof entry === 'number') {
    return entry;
  }

  return entry.weight_lbs ?? entry.weightLbs;
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Calculate BMR using the Mifflin-St Jeor formula.
 *
 * @param {object} params
 * @param {number} params.weightLbs
 * @param {number} params.heightInches
 * @param {number} params.age
 * @param {'male'|'female'} [params.sex='male']
 * @returns {number}
 */
export function calculateBMR({ weightLbs, heightInches, age, sex = 'male' }) {
  const weightKg = weightLbs * LBS_TO_KG;
  const heightCm = heightInches * INCHES_TO_CM;
  const sexOffset = sex === 'female' ? -161 : 5;
  return round(10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset);
}

/**
 * Calculate TDEE from BMR and an activity factor.
 *
 * @param {number} bmr
 * @param {'sedentary'|'moderate'|'active'|number} activityFactor
 * @returns {number}
 */
export function calculateTDEE(bmr, activityFactor) {
  return round(bmr * resolveActivityFactor(activityFactor));
}

/**
 * Calculate the hard calorie floor from SPEC §11.
 *
 * @param {number} bmr
 * @returns {number}
 */
export function calculateCalorieFloor(bmr) {
  return round(Math.max(1500, bmr * 1.1));
}

/**
 * Calculate daily macro targets for a rest or workout day.
 *
 * Uses an aggressive-cut target from TDEE, 1g protein per lb bodyweight,
 * roughly 25-30% calories from fat, and carbs as the remainder.
 *
 * @param {object} params
 * @param {number} params.weightLbs
 * @param {number} params.heightInches
 * @param {number} params.age
 * @param {'male'|'female'} [params.sex='male']
 * @param {'sedentary'|'moderate'|'active'|number} [params.activityFactor='moderate']
 * @param {boolean} [params.isWorkoutDay=false]
 * @returns {{calories: number, protein_g: number, carbs_g: number, fat_g: number}}
 */
export function calculateMacroTargets({
  weightLbs,
  heightInches,
  age,
  sex = 'male',
  activityFactor = 'moderate',
  isWorkoutDay = false,
}) {
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
 *
 * @param {Array<number|{date?: string, weight_lbs?: number, weightLbs?: number}>} weightHistory
 * @returns {number}
 */
export function calculateWeightLossRate(weightHistory) {
  if (!Array.isArray(weightHistory) || weightHistory.length < 14) {
    return 0;
  }

  const sortedHistory = [...weightHistory].sort((a, b) => {
    if (!a.date || !b.date) {
      return 0;
    }
    return a.date.localeCompare(b.date);
  });
  const latestSeven = sortedHistory.slice(-7).map(getWeightValue);
  const priorSeven = sortedHistory.slice(-14, -7).map(getWeightValue);

  if (
    latestSeven.some((value) => typeof value !== 'number') ||
    priorSeven.some((value) => typeof value !== 'number')
  ) {
    return 0;
  }

  const latestAverage = average(latestSeven);
  const priorAverage = average(priorSeven);
  if (priorAverage <= 0 || latestAverage >= priorAverage) {
    return 0;
  }

  return Number((((priorAverage - latestAverage) / priorAverage) * 100).toFixed(2));
}

/**
 * Check whether a calorie total is below the hard calorie floor.
 *
 * @param {number|{calories: number}} dailyTotal
 * @param {number} floor
 * @returns {boolean}
 */
export function isUnderCalorieFloor(dailyTotal, floor) {
  const calories = typeof dailyTotal === 'number' ? dailyTotal : dailyTotal.calories;
  return calories < floor;
}
