import { dateStringForOffset, formatDate, todayString, yesterdayString } from './dates.ts';
import {
  calculateWeightLossRate,
  isUnderCalorieFloor,
  type MacroTargets,
} from './macros.ts';
import { buildCurrentTimeContext } from './timeContext.ts';
import {
  getBubbyState,
  canonicalizeDailyLog,
  getConversationHistory,
  getCanonicalDailyLog,
  getOrInitCanonicalDailyLog,
  getMemory,
  getPantry,
  getUserProfile,
  normalizeMacroTotals,
  repairDailyLogs,
  type BubbyState,
  type ConversationHistory,
  type DailyLog,
  type MacroTotals,
  type MemoryEntry,
  type Pantry,
  type UserProfile,
} from './storage.ts';

const RECENT_HISTORY_LIMIT = 150;
const RECENT_HISTORY_CHARACTER_BUDGET = 50_000;
const MACRO_KEYS: Array<keyof MacroTotals> = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEIGHT_LOSS_RATE_LIMIT = 1.5;

export type ConcernLevel = 'normal' | 'elevated';
export type WeightLossSignal = 'normal' | 'too_fast';

export interface CompactHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DailyLogMealContext {
  id: string;
  description: string;
  logged_at: string;
  macros: MacroTotals;
}

export interface DailyLogContext {
  date: string;
  is_workout_day: boolean;
  meals: DailyLogMealContext[];
  totals: MacroTotals;
  target: MacroTargets | null;
  remaining: Partial<MacroTotals>;
  deltas: Partial<MacroTotals>;
}

export interface RecentDailySummary {
  date: string;
  is_workout_day: boolean;
  meal_count: number;
  totals: MacroTotals;
}

export interface ChatContext {
  today_date: string;
  yesterday_date: string;
  user_profile: UserProfile | null;
  macros_today: Partial<MacroTotals>;
  macros_remaining: Partial<MacroTotals>;
  daily_log_today: DailyLogContext | null;
  daily_log_yesterday: DailyLogContext | null;
  recent_daily_summaries: RecentDailySummary[];
  training_today: string | null;
  pantry: Pantry | null;
  recent_history: CompactHistoryMessage[];
  bubby_state: BubbyState;
  concern_level: ConcernLevel;
  weight_loss_rate: WeightLossSignal;
  memory: MemoryEntry[] | null;
  current_time: string;
  is_onboarding: boolean;
}

function defaultBubbyState(currentTime: string): BubbyState {
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

function compactHistory(
  conversationHistory: ConversationHistory | null | undefined,
): CompactHistoryMessage[] {
  const messages = conversationHistory?.messages ?? [];
  const retainedMessages: CompactHistoryMessage[] = [];
  let retainedCharacters = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message?.content || message.content.trim() === '') {
      continue;
    }

    const compactMessage = {
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content,
    } satisfies CompactHistoryMessage;
    const messageCharacters = compactMessage.role.length + compactMessage.content.length;

    if (
      retainedMessages.length >= RECENT_HISTORY_LIMIT ||
      retainedCharacters + messageCharacters > RECENT_HISTORY_CHARACTER_BUDGET
    ) {
      break;
    }

    retainedMessages.push(compactMessage);
    retainedCharacters += messageCharacters;
  }

  return retainedMessages.reverse();
}

function getTargetForDay(
  userProfile: UserProfile | null | undefined,
  dailyLog: DailyLog | null | undefined,
): MacroTargets | null {
  const targets = userProfile?.macro_targets;
  if (!targets) {
    return null;
  }

  return dailyLog?.is_workout_day ? targets.workout_day : targets.rest_day;
}

function roundContextMacroValue(key: keyof MacroTotals, value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  if (key === 'calories') {
    return Math.round(numericValue);
  }

  return Math.round(numericValue * 10) / 10;
}

function getWeekdayKeys(now: Date): Array<string | number> {
  const weekdayIndex = now.getDay();
  const fullName = WEEKDAYS[weekdayIndex];
  const shortName = SHORT_WEEKDAYS[weekdayIndex];

  return [fullName, fullName[0].toUpperCase() + fullName.slice(1), shortName, weekdayIndex];
}

function hasLoggedMeal(dailyLog: DailyLog | null | undefined): boolean {
  return Array.isArray(dailyLog?.meals) && (dailyLog?.meals.length ?? 0) > 0;
}

function loggedBelowFloor(
  dailyLog: DailyLog | null | undefined,
  calorieFloor: number,
): boolean {
  return (
    Number(calorieFloor) > 0 &&
    hasLoggedMeal(dailyLog) &&
    isUnderCalorieFloor(dailyLog?.totals ?? { calories: 0 }, calorieFloor)
  );
}

function collectRecentDailyLogs(dateString: string, dayCount: number): Array<DailyLog | null> {
  return Array.from({ length: dayCount }, (_, index) => {
    const logDate = dateStringForOffset(new Date(`${dateString}T12:00:00`), index - dayCount + 1);
    return getCanonicalDailyLog(logDate);
  });
}

function normalizeMemoryEntries(memory: MemoryEntry[] | null | undefined): MemoryEntry[] | null {
  if (!Array.isArray(memory)) {
    return null;
  }

  const entries = memory.filter((entry): entry is MemoryEntry => (
    entry !== null &&
    typeof entry === 'object' &&
    typeof entry.content === 'string' &&
    entry.content.trim() !== '' &&
    typeof entry.category === 'string'
  ));

  return entries.length > 0 ? entries : null;
}

export function resolveConcernLevel(
  userProfile: UserProfile | null | undefined,
  recentDailyLogs: Array<DailyLog | null> = [],
): ConcernLevel {
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

export function resolveWeightLossRateSignal(
  recentDailyLogs: Array<DailyLog | null> = [],
): WeightLossSignal {
  const weightHistory = recentDailyLogs
    .filter((dailyLog): dailyLog is DailyLog => Number.isFinite(Number(dailyLog?.weigh_in_lbs)))
    .map((dailyLog) => ({
      date: dailyLog.date,
      weight_lbs: Number(dailyLog.weigh_in_lbs),
    }));

  return calculateWeightLossRate(weightHistory) > WEIGHT_LOSS_RATE_LIMIT
    ? 'too_fast'
    : 'normal';
}

export function calculateMacrosRemaining(
  target: MacroTargets | null | undefined,
  totals: Partial<MacroTotals> = {},
): Partial<MacroTotals> {
  if (!target) {
    return {};
  }

  return MACRO_KEYS.reduce<Partial<MacroTotals>>((remaining, key) => {
    const targetValue = Number(target[key] ?? 0);
    const totalValue = Number(totals?.[key] ?? 0);
    return {
      ...remaining,
      [key]: Math.max(0, roundContextMacroValue(key, targetValue - totalValue)),
    };
  }, {});
}

export function calculateMacroDeltas(
  target: MacroTargets | null | undefined,
  totals: Partial<MacroTotals> = {},
): Partial<MacroTotals> {
  if (!target) {
    return {};
  }

  return MACRO_KEYS.reduce<Partial<MacroTotals>>((deltas, key) => {
    const targetValue = Number(target[key] ?? 0);
    const totalValue = Number(totals?.[key] ?? 0);
    return {
      ...deltas,
      [key]: roundContextMacroValue(key, targetValue - totalValue),
    };
  }, {});
}

function dailyLogToContext(
  dailyLog: DailyLog | null | undefined,
  userProfile: UserProfile | null | undefined,
): DailyLogContext | null {
  if (!dailyLog) {
    return null;
  }

  const canonicalLog = canonicalizeDailyLog(dailyLog, dailyLog.date);
  const totals = normalizeMacroTotals(canonicalLog.totals);
  const target = getTargetForDay(userProfile, canonicalLog);

  return {
    date: canonicalLog.date,
    is_workout_day: canonicalLog.is_workout_day,
    meals: (canonicalLog.meals ?? []).map((meal) => ({
      id: meal.id,
      description: meal.description,
      logged_at: meal.logged_at,
      macros: normalizeMacroTotals(meal.macros),
    })),
    totals,
    target,
    remaining: calculateMacrosRemaining(target, totals),
    deltas: calculateMacroDeltas(target, totals),
  };
}

function dailyLogSummary(dailyLog: DailyLog | null): RecentDailySummary | null {
  if (!dailyLog) {
    return null;
  }

  return {
    date: dailyLog.date,
    is_workout_day: dailyLog.is_workout_day,
    meal_count: dailyLog.meals.length,
    totals: normalizeMacroTotals(dailyLog.totals),
  };
}

export function resolveTrainingToday(
  userProfile: UserProfile | null | undefined,
  now: Date = new Date(),
): string | null {
  const schedule = userProfile?.training_schedule;
  if (!schedule || typeof schedule !== 'object') {
    return null;
  }

  for (const key of getWeekdayKeys(now)) {
    const value = schedule[key as keyof typeof schedule];
    if (value) {
      return value;
    }
  }

  return null;
}

export interface BuildChatContextOptions {
  userProfile?: UserProfile | null;
  dailyLog?: DailyLog | null;
  yesterdayLog?: DailyLog | null;
  recentDailyLogs?: Array<DailyLog | null>;
  pantry?: Pantry | null;
  memory?: MemoryEntry[] | null;
  conversationHistory?: ConversationHistory | null;
  bubbyState?: BubbyState | null;
  now?: Date;
  dateString?: string;
  yesterdayDateString?: string;
  currentTime?: string;
}

export function buildChatContext({
  userProfile = null,
  dailyLog = null,
  yesterdayLog = null,
  recentDailyLogs = [],
  pantry = null,
  memory = null,
  conversationHistory = null,
  bubbyState = null,
  now = new Date(),
  dateString = dailyLog?.date ?? formatDate(now),
  yesterdayDateString = yesterdayLog?.date ?? yesterdayString(now),
  currentTime = buildCurrentTimeContext(now),
}: BuildChatContextOptions = {}): ChatContext {
  const canonicalDailyLog = dailyLog ? canonicalizeDailyLog(dailyLog, dateString) : null;
  const macrosToday = canonicalDailyLog?.totals ? normalizeMacroTotals(canonicalDailyLog.totals) : {};
  const target = getTargetForDay(userProfile, canonicalDailyLog);
  const dailyLogToday = dailyLogToContext(canonicalDailyLog, userProfile);
  const dailyLogYesterday = dailyLogToContext(yesterdayLog, userProfile);

  return {
    today_date: dateString,
    yesterday_date: yesterdayDateString,
    user_profile: userProfile,
    macros_today: macrosToday,
    macros_remaining: calculateMacrosRemaining(target, macrosToday),
    daily_log_today: dailyLogToday,
    daily_log_yesterday: dailyLogYesterday,
    recent_daily_summaries: recentDailyLogs
      .slice(-7)
      .map(dailyLogSummary)
      .filter((summary): summary is RecentDailySummary => summary !== null),
    training_today: resolveTrainingToday(userProfile, now),
    pantry,
    recent_history: compactHistory(conversationHistory),
    bubby_state: bubbyState ?? defaultBubbyState(currentTime),
    concern_level: resolveConcernLevel(userProfile, recentDailyLogs),
    weight_loss_rate: resolveWeightLossRateSignal(recentDailyLogs),
    memory: normalizeMemoryEntries(memory),
    current_time: currentTime,
    is_onboarding: false,
  };
}

export function buildChatContextFromStorage({
  now = new Date(),
  dateString = todayString(),
  currentTime = buildCurrentTimeContext(now),
}: { now?: Date; dateString?: string; currentTime?: string } = {}): ChatContext {
  repairDailyLogs(dateString, 7);
  const recentDailyLogs = collectRecentDailyLogs(dateString, 14);
  const currentDate = new Date(`${dateString}T12:00:00`);
  const previousDateString = dateStringForOffset(currentDate, -1);

  return buildChatContext({
    userProfile: getUserProfile(),
    dailyLog: getOrInitCanonicalDailyLog(dateString),
    yesterdayLog: getCanonicalDailyLog(previousDateString),
    recentDailyLogs,
    pantry: getPantry(),
    memory: getMemory()?.entries ?? null,
    conversationHistory: getConversationHistory(),
    bubbyState: getBubbyState(),
    now,
    dateString,
    yesterdayDateString: previousDateString,
    currentTime,
  });
}
