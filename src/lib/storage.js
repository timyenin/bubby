const KEY_PREFIX = 'bubby:';
const USER_PROFILE_KEY = `${KEY_PREFIX}user_profile`;
const PANTRY_KEY = `${KEY_PREFIX}pantry`;
const BUBBY_STATE_KEY = `${KEY_PREFIX}bubby_state`;
const CONVERSATION_HISTORY_KEY = `${KEY_PREFIX}conversation_history`;
const ONBOARDING_COMPLETE_KEY = `${KEY_PREFIX}onboarding_complete`;
const MAX_HISTORY_MESSAGES = 100;

const VITAL_BARS = ['vitality', 'mood', 'strength', 'energy'];

/**
 * @typedef {object} MacroTotals
 * @property {number} calories
 * @property {number} protein_g
 * @property {number} carbs_g
 * @property {number} fat_g
 */

/**
 * Stored under `bubby:user_profile`.
 *
 * @typedef {object} UserProfile
 * @property {string} name
 * @property {?string} preferred_name
 * @property {number} age
 * @property {number} height_inches
 * @property {number} starting_weight_lbs
 * @property {number} current_weight_lbs
 * @property {string} goal
 * @property {string} activity_level
 * @property {Record<string, string>} training_schedule
 * @property {{workout_day: MacroTotals, rest_day: MacroTotals}} macro_targets
 * @property {number} calorie_floor
 * @property {string[]} established_rules
 * @property {string} work_food_access
 * @property {string} created_at
 * @property {number} last_recalibration_weight
 */

/**
 * Stored under `bubby:daily_log:YYYY-MM-DD`.
 *
 * @typedef {object} DailyLog
 * @property {string} date
 * @property {boolean} is_workout_day
 * @property {?number} weigh_in_lbs
 * @property {Array<{id: string, logged_at: string, description: string, macros: MacroTotals}>} meals
 * @property {MacroTotals} totals
 * @property {string[]} adherence_flags
 */

/**
 * Stored under `bubby:pantry`.
 *
 * @typedef {object} Pantry
 * @property {Array<{name: string, category: string, always: boolean}>} items
 * @property {string} last_updated
 */

/**
 * Stored under `bubby:bubby_state`.
 *
 * @typedef {object} BubbyState
 * @property {number} vitality
 * @property {number} mood
 * @property {number} strength
 * @property {number} energy
 * @property {string} current_animation
 * @property {boolean} is_sick
 * @property {boolean} is_sleepy
 * @property {string} last_updated
 */

/**
 * Stored under `bubby:conversation_history`.
 *
 * @typedef {object} ConversationHistory
 * @property {Array<{role: 'user'|'assistant', content: string, timestamp: string, thumbnail?: string}>} messages
 */

function dailyLogKey(dateString) {
  return `${KEY_PREFIX}daily_log:${dateString}`;
}

function getStorage() {
  if (!globalThis.localStorage) {
    throw new Error('localStorage is not available');
  }
  return globalThis.localStorage;
}

function getJson(key, fallback = null) {
  const raw = getStorage().getItem(key);
  if (raw === null) {
    return fallback;
  }
  return JSON.parse(raw);
}

function setJson(key, value) {
  getStorage().setItem(key, JSON.stringify(value));
  return value;
}

function deleteKey(key) {
  getStorage().removeItem(key);
}

function clampVital(value) {
  return Math.max(0, Math.min(100, value));
}

function emptyDailyLog(dateString) {
  return {
    date: dateString,
    is_workout_day: false,
    weigh_in_lbs: null,
    meals: [],
    totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    adherence_flags: [],
  };
}

function defaultBubbyState() {
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

/**
 * @returns {?UserProfile}
 */
export function getUserProfile() {
  return getJson(USER_PROFILE_KEY);
}

/**
 * @param {UserProfile} profile
 * @returns {UserProfile}
 */
export function setUserProfile(profile) {
  return setJson(USER_PROFILE_KEY, profile);
}

export function deleteUserProfile() {
  deleteKey(USER_PROFILE_KEY);
}

/**
 * @param {string} dateString - YYYY-MM-DD
 * @returns {?DailyLog}
 */
export function getDailyLog(dateString) {
  return getJson(dailyLogKey(dateString));
}

/**
 * @param {string} dateString - YYYY-MM-DD
 * @param {DailyLog} dailyLog
 * @returns {DailyLog}
 */
export function setDailyLog(dateString, dailyLog) {
  return setJson(dailyLogKey(dateString), dailyLog);
}

/**
 * @param {string} dateString - YYYY-MM-DD
 */
export function deleteDailyLog(dateString) {
  deleteKey(dailyLogKey(dateString));
}

/**
 * @param {string} dateString - YYYY-MM-DD
 * @returns {DailyLog}
 */
export function getOrInitDailyLog(dateString) {
  const existingLog = getDailyLog(dateString);
  if (existingLog) {
    return existingLog;
  }
  return setDailyLog(dateString, emptyDailyLog(dateString));
}

/**
 * @returns {?Pantry}
 */
export function getPantry() {
  return getJson(PANTRY_KEY);
}

/**
 * @param {Pantry} pantry
 * @returns {Pantry}
 */
export function setPantry(pantry) {
  return setJson(PANTRY_KEY, pantry);
}

export function deletePantry() {
  deleteKey(PANTRY_KEY);
}

/**
 * @returns {?BubbyState}
 */
export function getBubbyState() {
  return getJson(BUBBY_STATE_KEY);
}

/**
 * @param {BubbyState} state
 * @returns {BubbyState}
 */
export function setBubbyState(state) {
  return setJson(BUBBY_STATE_KEY, state);
}

export function deleteBubbyState() {
  deleteKey(BUBBY_STATE_KEY);
}

/**
 * @returns {?ConversationHistory}
 */
export function getConversationHistory() {
  return getJson(CONVERSATION_HISTORY_KEY);
}

/**
 * @param {ConversationHistory} history
 * @returns {ConversationHistory}
 */
export function setConversationHistory(history) {
  return setJson(CONVERSATION_HISTORY_KEY, history);
}

export function deleteConversationHistory() {
  deleteKey(CONVERSATION_HISTORY_KEY);
}

/**
 * @returns {boolean}
 */
export function getOnboardingComplete() {
  return getJson(ONBOARDING_COMPLETE_KEY, false);
}

/**
 * @param {boolean} isComplete
 * @returns {boolean}
 */
export function setOnboardingComplete(isComplete) {
  return setJson(ONBOARDING_COMPLETE_KEY, Boolean(isComplete));
}

export function deleteOnboardingComplete() {
  deleteKey(ONBOARDING_COMPLETE_KEY);
}

/**
 * Append a message to conversation history and keep only the latest 100.
 *
 * @param {{role: 'user'|'assistant', content: string, timestamp: string, thumbnail?: string}} message
 * @returns {ConversationHistory}
 */
export function appendMessageToHistory(message) {
  const history = getConversationHistory() ?? { messages: [] };
  const messages = [...history.messages, message].slice(-MAX_HISTORY_MESSAGES);
  return setConversationHistory({ messages });
}

/**
 * Increment a vital bar by delta, clamped to 0-100.
 *
 * @param {'vitality'|'mood'|'strength'|'energy'} barName
 * @param {number} delta
 * @returns {BubbyState}
 */
export function incrementVital(barName, delta) {
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

export function clearAll() {
  const storage = getStorage();
  const keysToRemove = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
}
