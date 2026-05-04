const KEY_PREFIX = 'bubby:';
const USER_PROFILE_KEY = `${KEY_PREFIX}user_profile`;
const PANTRY_KEY = `${KEY_PREFIX}pantry`;
const BUBBY_STATE_KEY = `${KEY_PREFIX}bubby_state`;
const CONVERSATION_HISTORY_KEY = `${KEY_PREFIX}conversation_history`;
const ONBOARDING_COMPLETE_KEY = `${KEY_PREFIX}onboarding_complete`;
const MEMORY_KEY = `${KEY_PREFIX}memory`;
const BUBBY_COLOR_KEY = `${KEY_PREFIX}bubby_color`;
const MAX_HISTORY_MESSAGES = 300;
const MAX_PERSISTED_IMAGE_THUMBNAIL_MESSAGES = 10;
const LAST_RESORT_HISTORY_MESSAGE_LIMITS = [250, 200, 150, 100, 75, 50, 40, 30, 20, 10, 1];
const DEFAULT_BUBBY_COLOR_ID = 'default';
const DUPLICATE_MEAL_WINDOW_MS = 3 * 60 * 1000;
const MACRO_KEYS: Array<keyof MacroTotals> = ['calories', 'protein_g', 'carbs_g', 'fat_g'];

export type VitalName = 'vitality' | 'mood' | 'strength' | 'energy';
export type MemoryCategory =
  | 'preference'
  | 'rule'
  | 'context'
  | 'goal'
  | 'health'
  | 'schedule'
  | 'other';

const VITAL_BARS: VitalName[] = ['vitality', 'mood', 'strength', 'energy'];

export interface MacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface UserProfile {
  name: string;
  preferred_name: string | null;
  age: number;
  height_inches: number;
  starting_weight_lbs: number;
  current_weight_lbs: number;
  goal: string;
  activity_level: string;
  training_schedule: Record<string, string>;
  macro_targets: {
    workout_day: MacroTotals;
    rest_day: MacroTotals;
  };
  calorie_floor: number;
  established_rules: string[];
  work_food_access: string;
  created_at: string;
  last_recalibration_weight: number;
}

export interface Meal {
  id: string;
  logged_at: string;
  description: string;
  macros: MacroTotals;
}

export interface DailyLog {
  date: string;
  is_workout_day: boolean;
  weigh_in_lbs: number | null;
  meals: Meal[];
  totals: MacroTotals;
  adherence_flags: string[];
}

export interface PantryItemMacros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_size: string;
}

export interface PantryItem {
  name: string;
  category: string;
  always: boolean;
  macros?: PantryItemMacros | null;
}

export interface Pantry {
  items: PantryItem[];
  last_updated: string;
}

export interface BubbyState {
  vitality: number;
  mood: number;
  strength: number;
  energy: number;
  current_animation: string;
  is_sick: boolean;
  is_sleepy: boolean;
  last_updated: string;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  thumbnail?: string;
  thumbnails?: string[];
  fullImages?: string[];
}

export interface ConversationHistory {
  messages: ChatMessage[];
}

export class ConversationHistoryStorageError extends Error {
  readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'ConversationHistoryStorageError';
    this.originalError = originalError;
  }
}

export function isConversationHistoryStorageError(
  error: unknown,
): error is ConversationHistoryStorageError {
  return error instanceof ConversationHistoryStorageError;
}

export interface MemoryEntry {
  id: string;
  content: string;
  category: MemoryCategory;
  created_at: string;
  updated_at: string;
}

export interface BubbyMemory {
  entries: MemoryEntry[];
  last_updated: string;
}

type DailyLogInput = Partial<Omit<DailyLog, 'meals'>> & {
  meals?: ReadonlyArray<Partial<Meal> | null | undefined>;
};

function dailyLogKey(dateString: string): string {
  return `${KEY_PREFIX}daily_log:${dateString}`;
}

function getStorage(): Storage {
  if (!globalThis.localStorage) {
    throw new Error('localStorage is not available');
  }
  return globalThis.localStorage;
}

function getJson<T>(key: string, fallback: T): T;
function getJson<T>(key: string): T | null;
function getJson<T>(key: string, fallback: T | null = null): T | null {
  const raw = getStorage().getItem(key);
  if (raw === null) {
    return fallback;
  }
  return JSON.parse(raw) as T;
}

function setJson<T>(key: string, value: T): T {
  getStorage().setItem(key, JSON.stringify(value));
  return value;
}

function deleteKey(key: string): void {
  getStorage().removeItem(key);
}

function clampVital(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function timestampFrom(date = new Date()): string {
  return date.toISOString();
}

function sanitizedOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sanitizedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => (
    typeof item === 'string' && item.length > 0
  ));

  return strings.length > 0 ? strings : undefined;
}

export function sanitizeChatMessageForStorage(message: ChatMessage): ChatMessage {
  const sanitized: ChatMessage = {
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: typeof message.content === 'string' ? message.content : String(message.content ?? ''),
    timestamp: typeof message.timestamp === 'string' ? message.timestamp : timestampFrom(),
  };
  const id = sanitizedOptionalString(message.id);
  const thumbnail = sanitizedOptionalString(message.thumbnail);
  const thumbnails = sanitizedStringArray(message.thumbnails);

  if (id) {
    sanitized.id = id;
  }

  if (thumbnail) {
    sanitized.thumbnail = thumbnail;
  }

  if (thumbnails) {
    sanitized.thumbnails = thumbnails;
  }

  return sanitized;
}

export function sanitizeConversationHistoryForStorage(
  history: ConversationHistory | null | undefined,
  messageLimit = MAX_HISTORY_MESSAGES,
): ConversationHistory {
  const messages = Array.isArray(history?.messages) ? history.messages : [];

  return {
    messages: messages
      .map((message) => sanitizeChatMessageForStorage(message))
      .slice(-messageLimit),
  };
}

function messageHasPersistedImagePreview(message: ChatMessage): boolean {
  return Boolean(message.thumbnail || (message.thumbnails && message.thumbnails.length > 0));
}

function withoutImagePreviews(message: ChatMessage): ChatMessage {
  const { thumbnail, thumbnails, ...messageWithoutPreviews } = message;
  return messageWithoutPreviews;
}

export function pruneConversationHistoryImagePayloads(
  history: ConversationHistory,
  keepRecentImageMessages = MAX_PERSISTED_IMAGE_THUMBNAIL_MESSAGES,
): ConversationHistory {
  const sanitizedHistory = sanitizeConversationHistoryForStorage(history);
  const imageMessageIndexes = sanitizedHistory.messages
    .map((message, index) => (messageHasPersistedImagePreview(message) ? index : -1))
    .filter((index) => index >= 0);
  const keptImageIndexes = new Set(
    imageMessageIndexes.slice(-Math.max(0, keepRecentImageMessages)),
  );

  return {
    messages: sanitizedHistory.messages.map((message, index) => (
      keptImageIndexes.has(index) ? message : withoutImagePreviews(message)
    )),
  };
}

function uniqueConversationHistoryCandidates(
  candidates: ConversationHistory[],
): ConversationHistory[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function conversationHistoryStorageCandidates(history: ConversationHistory): ConversationHistory[] {
  const sanitizedHistory = sanitizeConversationHistoryForStorage(history);
  const recentImagePreviewsOnly = pruneConversationHistoryImagePayloads(
    sanitizedHistory,
    MAX_PERSISTED_IMAGE_THUMBNAIL_MESSAGES,
  );
  const textOnlyHistory = pruneConversationHistoryImagePayloads(sanitizedHistory, 0);
  const lastResortTextHistories = LAST_RESORT_HISTORY_MESSAGE_LIMITS.map((messageLimit) =>
    sanitizeConversationHistoryForStorage(textOnlyHistory, messageLimit),
  );

  return uniqueConversationHistoryCandidates([
    sanitizedHistory,
    recentImagePreviewsOnly,
    textOnlyHistory,
    ...lastResortTextHistories,
  ]);
}

function writeConversationHistoryWithFallback(history: ConversationHistory): ConversationHistory {
  let lastError: unknown = null;

  for (const candidate of conversationHistoryStorageCandidates(history)) {
    try {
      return setJson(CONVERSATION_HISTORY_KEY, candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw new ConversationHistoryStorageError(
    'Conversation history could not be saved.',
    lastError,
  );
}

function generateMemoryId(now: string): string {
  return `memory_${now.replace(/[^0-9]/g, '')}_${Math.random().toString(36).slice(2)}`;
}

function normalizeMemoryContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

function emptyDailyLog(dateString: string): DailyLog {
  return {
    date: dateString,
    is_workout_day: false,
    weigh_in_lbs: null,
    meals: [],
    totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    adherence_flags: [],
  };
}

function roundMacroValue(key: keyof MacroTotals, value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  if (key === 'calories') {
    return Math.round(numericValue);
  }

  return Math.round(numericValue * 10) / 10;
}

function offsetDateString(dateString: string, dayOffset: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day + dayOffset);
  const dateMonth = String(date.getMonth() + 1).padStart(2, '0');
  const dateDay = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${dateMonth}-${dateDay}`;
}

function normalizeMealDescription(description: unknown): string {
  return String(description ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeMealDescriptionKey(description: unknown): string {
  return normalizeMealDescription(description).toLowerCase();
}

function macroSignature(macros: unknown): string {
  return JSON.stringify(normalizeMacroTotals(macros));
}

function mealTimeValue(meal: Pick<Meal, 'logged_at'>): number {
  const value = Date.parse(meal.logged_at);
  return Number.isFinite(value) ? value : Number.NaN;
}

function areDuplicateMeals(a: Meal, b: Meal): boolean {
  const aTime = mealTimeValue(a);
  const bTime = mealTimeValue(b);

  return (
    normalizeMealDescriptionKey(a.description) === normalizeMealDescriptionKey(b.description) &&
    macroSignature(a.macros) === macroSignature(b.macros) &&
    Number.isFinite(aTime) &&
    Number.isFinite(bTime) &&
    Math.abs(aTime - bTime) <= DUPLICATE_MEAL_WINDOW_MS
  );
}

export function normalizeMacroTotals(macros: unknown = {}): MacroTotals {
  const source = macros && typeof macros === 'object'
    ? (macros as Partial<Record<keyof MacroTotals, unknown>>)
    : {};

  return MACRO_KEYS.reduce<MacroTotals>(
    (normalized, key) => {
      normalized[key] = roundMacroValue(key, source[key]);
      return normalized;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

export function sumMealTotals(
  meals: ReadonlyArray<Partial<Meal> | null | undefined> = [],
): MacroTotals {
  const totals = meals.reduce<MacroTotals>(
    (runningTotals, meal) => {
      const macros = normalizeMacroTotals(meal?.macros);

      for (const key of MACRO_KEYS) {
        runningTotals[key] += macros[key];
      }

      return runningTotals;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  return normalizeMacroTotals(totals);
}

export function canonicalizeDailyLog(
  log: DailyLogInput | null | undefined,
  fallbackDateString = '',
): DailyLog {
  const source = log ?? {};
  const rawWeight = source.weigh_in_lbs;
  const meals = Array.isArray(source.meals)
    ? source.meals
      .filter((meal): meal is Partial<Meal> => meal !== null && typeof meal === 'object')
      .map((meal, index) => ({
        id: String(meal.id ?? `meal_${index + 1}`),
        logged_at: String(meal.logged_at ?? ''),
        description: normalizeMealDescription(meal.description),
        macros: normalizeMacroTotals(meal.macros),
      }))
    : [];

  return {
    date: String(source.date ?? fallbackDateString),
    is_workout_day: Boolean(source.is_workout_day),
    weigh_in_lbs: rawWeight !== null && rawWeight !== undefined && Number.isFinite(Number(rawWeight))
      ? Number(rawWeight)
      : null,
    meals,
    totals: sumMealTotals(meals),
    adherence_flags: Array.isArray(source.adherence_flags)
      ? source.adherence_flags.map((flag) => String(flag)).filter(Boolean)
      : [],
  };
}

export function collapseDuplicateMeals(
  meals: ReadonlyArray<Partial<Meal> | null | undefined> = [],
): Meal[] {
  const canonicalMeals = canonicalizeDailyLog({ meals }, '').meals;
  return canonicalMeals.reduce<Meal[]>((keptMeals, meal) => {
    const isDuplicate = keptMeals.some((keptMeal) => areDuplicateMeals(keptMeal, meal));
    return isDuplicate ? keptMeals : [...keptMeals, meal];
  }, []);
}

function defaultBubbyState(): BubbyState {
  return {
    vitality: 80,
    mood: 70,
    strength: 50,
    energy: 80,
    current_animation: 'idle',
    is_sick: false,
    is_sleepy: false,
    last_updated: new Date().toISOString(),
  };
}

export function getUserProfile(): UserProfile | null {
  return getJson<UserProfile>(USER_PROFILE_KEY);
}

export function setUserProfile(profile: UserProfile): UserProfile {
  return setJson(USER_PROFILE_KEY, profile);
}

export function deleteUserProfile(): void {
  deleteKey(USER_PROFILE_KEY);
}

export function getDailyLog(dateString: string): DailyLog | null {
  return getJson<DailyLog>(dailyLogKey(dateString));
}

export function setDailyLog(dateString: string, dailyLog: DailyLog): DailyLog {
  return setJson(dailyLogKey(dateString), dailyLog);
}

export function deleteDailyLog(dateString: string): void {
  deleteKey(dailyLogKey(dateString));
}

export function getOrInitDailyLog(dateString: string): DailyLog {
  const existingLog = getDailyLog(dateString);
  if (existingLog) {
    return existingLog;
  }
  return setDailyLog(dateString, emptyDailyLog(dateString));
}

export function getCanonicalDailyLog(dateString: string): DailyLog | null {
  const existingLog = getDailyLog(dateString);
  if (!existingLog) {
    return null;
  }

  const canonicalLog = canonicalizeDailyLog(existingLog, dateString);
  if (JSON.stringify(existingLog) !== JSON.stringify(canonicalLog)) {
    return setDailyLog(dateString, canonicalLog);
  }

  return canonicalLog;
}

export function getOrInitCanonicalDailyLog(dateString: string): DailyLog {
  return getCanonicalDailyLog(dateString) ?? setDailyLog(dateString, emptyDailyLog(dateString));
}

export function repairDailyLogs(anchorDateString: string, dayCount = 7): DailyLog[] {
  return Array.from({ length: dayCount }, (_, index) => {
    const dateString = offsetDateString(anchorDateString, index - dayCount + 1);
    const existingLog = getDailyLog(dateString);
    if (!existingLog) {
      return null;
    }

    const canonicalLog = canonicalizeDailyLog(existingLog, dateString);
    const meals = collapseDuplicateMeals(canonicalLog.meals);
    const repairedLog: DailyLog = {
      ...canonicalLog,
      meals,
      totals: sumMealTotals(meals),
    };

    return JSON.stringify(existingLog) === JSON.stringify(repairedLog)
      ? canonicalLog
      : setDailyLog(dateString, repairedLog);
  }).filter((log): log is DailyLog => log !== null);
}

export function getPantry(): Pantry | null {
  return getJson<Pantry>(PANTRY_KEY);
}

export function setPantry(pantry: Pantry): Pantry {
  return setJson(PANTRY_KEY, pantry);
}

export function deletePantry(): void {
  deleteKey(PANTRY_KEY);
}

export function getBubbyState(): BubbyState | null {
  return getJson<BubbyState>(BUBBY_STATE_KEY);
}

export function setBubbyState(state: BubbyState): BubbyState {
  return setJson(BUBBY_STATE_KEY, state);
}

export function deleteBubbyState(): void {
  deleteKey(BUBBY_STATE_KEY);
}

export function getConversationHistory(): ConversationHistory | null {
  const history = getJson<ConversationHistory>(CONVERSATION_HISTORY_KEY);
  if (!history) {
    return null;
  }

  const sanitizedHistory = sanitizeConversationHistoryForStorage(history);
  if (JSON.stringify(history) !== JSON.stringify(sanitizedHistory)) {
    try {
      writeConversationHistoryWithFallback(sanitizedHistory);
    } catch {
      // Reads should remain usable even if storage is already over quota.
    }
  }

  return sanitizedHistory;
}

export function setConversationHistory(history: ConversationHistory): ConversationHistory {
  return writeConversationHistoryWithFallback(history);
}

export function deleteConversationHistory(): void {
  deleteKey(CONVERSATION_HISTORY_KEY);
}

export function getOnboardingComplete(): boolean {
  return getJson<boolean>(ONBOARDING_COMPLETE_KEY, false);
}

export function setOnboardingComplete(isComplete: boolean): boolean {
  return setJson(ONBOARDING_COMPLETE_KEY, Boolean(isComplete));
}

export function deleteOnboardingComplete(): void {
  deleteKey(ONBOARDING_COMPLETE_KEY);
}

export function getMemory(): BubbyMemory | null {
  return getJson<BubbyMemory>(MEMORY_KEY);
}

export function setMemory(memory: BubbyMemory): BubbyMemory {
  return setJson(MEMORY_KEY, memory);
}

export function deleteMemory(): void {
  deleteKey(MEMORY_KEY);
}

export function getBubbyColorId(): string {
  return getJson<string>(BUBBY_COLOR_KEY, DEFAULT_BUBBY_COLOR_ID);
}

export function setBubbyColorId(colorId: string): string {
  return setJson(BUBBY_COLOR_KEY, colorId);
}

export function deleteBubbyColorId(): void {
  deleteKey(BUBBY_COLOR_KEY);
}

export function addMemoryEntry(
  entry: Omit<MemoryEntry, 'id' | 'created_at' | 'updated_at'>,
): BubbyMemory {
  const now = timestampFrom();
  const content = normalizeMemoryContent(entry.content);
  const memory = getMemory() ?? { entries: [], last_updated: '' };
  const existingIndex = memory.entries.findIndex(
    (existingEntry) => normalizeMemoryContent(existingEntry.content).toLowerCase() === content.toLowerCase(),
  );

  if (existingIndex >= 0) {
    const entries = [...memory.entries];
    entries[existingIndex] = {
      ...entries[existingIndex],
      content,
      category: entry.category,
      updated_at: now,
    };
    return setMemory({ entries, last_updated: now });
  }

  const nextEntry: MemoryEntry = {
    id: generateMemoryId(now),
    content,
    category: entry.category,
    created_at: now,
    updated_at: now,
  };

  return setMemory({
    entries: [...memory.entries, nextEntry],
    last_updated: now,
  });
}

export function removeMemoryEntry(id: string): BubbyMemory | null {
  const memory = getMemory();
  if (!memory) {
    return null;
  }

  const entries = memory.entries.filter((entry) => entry.id !== id);
  const now = timestampFrom();
  return setMemory({ entries, last_updated: now });
}

export function removeMemoryByContent(content: string): BubbyMemory | null {
  const memory = getMemory();
  if (!memory) {
    return null;
  }

  const normalizedContent = normalizeMemoryContent(content).toLowerCase();
  const entries = memory.entries.filter(
    (entry) => normalizeMemoryContent(entry.content).toLowerCase() !== normalizedContent,
  );

  if (entries.length === memory.entries.length) {
    return null;
  }

  const now = timestampFrom();
  return setMemory({ entries, last_updated: now });
}

export function updateMemoryEntry(
  id: string,
  updates: Partial<Pick<MemoryEntry, 'content' | 'category'>>,
): BubbyMemory | null {
  const memory = getMemory();
  if (!memory) {
    return null;
  }

  const entryIndex = memory.entries.findIndex((entry) => entry.id === id);
  if (entryIndex < 0) {
    return null;
  }

  const now = timestampFrom();
  const entries = [...memory.entries];
  entries[entryIndex] = {
    ...entries[entryIndex],
    ...(updates.content !== undefined ? { content: normalizeMemoryContent(updates.content) } : {}),
    ...(updates.category !== undefined ? { category: updates.category } : {}),
    updated_at: now,
  };

  return setMemory({ entries, last_updated: now });
}

/**
 * Append a message to conversation history and keep only the latest 300.
 */
export function appendMessageToHistory(message: ChatMessage): ConversationHistory {
  const history = getConversationHistory() ?? { messages: [] };
  const messages = [...history.messages, sanitizeChatMessageForStorage(message)]
    .slice(-MAX_HISTORY_MESSAGES);
  return setConversationHistory({ messages });
}

/**
 * Increment a vital bar by delta, clamped to 0-100.
 */
export function incrementVital(barName: VitalName, delta: number): BubbyState {
  if (!VITAL_BARS.includes(barName)) {
    throw new Error(`Unknown vital bar: ${barName}`);
  }

  const state = getBubbyState() ?? defaultBubbyState();
  return setBubbyState({
    ...state,
    [barName]: clampVital(state[barName] + delta),
    last_updated: new Date().toISOString(),
  });
}

export function clearAll(): void {
  const storage = getStorage();
  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
}
