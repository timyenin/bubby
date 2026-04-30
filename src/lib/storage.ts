const KEY_PREFIX = 'bubby:';
const USER_PROFILE_KEY = `${KEY_PREFIX}user_profile`;
const PANTRY_KEY = `${KEY_PREFIX}pantry`;
const BUBBY_STATE_KEY = `${KEY_PREFIX}bubby_state`;
const CONVERSATION_HISTORY_KEY = `${KEY_PREFIX}conversation_history`;
const ONBOARDING_COMPLETE_KEY = `${KEY_PREFIX}onboarding_complete`;
const MAX_HISTORY_MESSAGES = 100;

export type VitalName = 'vitality' | 'mood' | 'strength' | 'energy';

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

export interface PantryItem {
  name: string;
  category: string;
  always: boolean;
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
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  thumbnail?: string;
}

export interface ConversationHistory {
  messages: ChatMessage[];
}

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
  return getJson<ConversationHistory>(CONVERSATION_HISTORY_KEY);
}

export function setConversationHistory(history: ConversationHistory): ConversationHistory {
  return setJson(CONVERSATION_HISTORY_KEY, history);
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

/**
 * Append a message to conversation history and keep only the latest 100.
 */
export function appendMessageToHistory(message: ChatMessage): ConversationHistory {
  const history = getConversationHistory() ?? { messages: [] };
  const messages = [...history.messages, message].slice(-MAX_HISTORY_MESSAGES);
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
