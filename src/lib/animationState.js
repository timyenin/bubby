export const LOOPING_ANIMATIONS = ['idle', 'sleepy', 'sick'];
export const ONE_SHOT_ANIMATIONS = ['eating', 'happy_bounce', 'workout', 'recovery'];

const LATE_NIGHT_HOUR = 23;
const REST_EVENING_HOUR = 19;

function isOneShot(animationName) {
  return ONE_SHOT_ANIMATIONS.includes(animationName);
}

function isLateNight(now) {
  return now.getHours() >= LATE_NIGHT_HOUR || now.getHours() < 5;
}

function isRestDayEvening(dailyLog, now) {
  return dailyLog?.is_workout_day === false && now.getHours() >= REST_EVENING_HOUR;
}

function getProteinTotal(dailyLog) {
  return Number(dailyLog?.totals?.protein_g ?? 0);
}

function getProteinTarget(userProfile, dailyLog) {
  const targets = userProfile?.macro_targets;
  const target = dailyLog?.is_workout_day ? targets?.workout_day : targets?.rest_day;
  return Number(target?.protein_g ?? 0);
}

function didCrossProteinTarget({ userProfile, beforeDailyLog, afterDailyLog }) {
  const target = getProteinTarget(userProfile, afterDailyLog);
  if (target <= 0) {
    return false;
  }

  return getProteinTotal(beforeDailyLog) < target && getProteinTotal(afterDailyLog) >= target;
}

export function resolveBaseAnimation({
  bubbyState = null,
  dailyLog = null,
  now = new Date(),
} = {}) {
  if (bubbyState?.is_sick === true) {
    return 'sick';
  }

  if (isLateNight(now) || isRestDayEvening(dailyLog, now)) {
    return 'sleepy';
  }

  return 'idle';
}

export function createAnimationState({
  baseAnimation = 'idle',
  currentAnimation = baseAnimation,
  queue = [],
  playbackId = 0,
} = {}) {
  return {
    baseAnimation,
    currentAnimation,
    queue,
    playbackId,
    isPlayingOneShot: isOneShot(currentAnimation),
  };
}

export function enqueueReactiveAnimations(state, animations = []) {
  const reactiveAnimations = animations.filter(isOneShot);
  if (reactiveAnimations.length === 0) {
    return state;
  }

  if (state.isPlayingOneShot) {
    return {
      ...state,
      queue: [...state.queue, ...reactiveAnimations],
    };
  }

  const [nextAnimation, ...nextQueue] = reactiveAnimations;
  return {
    ...state,
    currentAnimation: nextAnimation,
    queue: [...state.queue, ...nextQueue],
    playbackId: state.playbackId + 1,
    isPlayingOneShot: true,
  };
}

export function finishCurrentAnimation(state) {
  if (!state.isPlayingOneShot) {
    return state;
  }

  if (state.queue.length > 0) {
    const [nextAnimation, ...nextQueue] = state.queue;
    return {
      ...state,
      currentAnimation: nextAnimation,
      queue: nextQueue,
      playbackId: state.playbackId + 1,
      isPlayingOneShot: true,
    };
  }

  return {
    ...state,
    currentAnimation: state.baseAnimation,
    queue: [],
    isPlayingOneShot: false,
  };
}

export function syncBaseAnimation(state, options = {}) {
  const nextBaseAnimation = resolveBaseAnimation(options);
  const leavingSick = state.baseAnimation === 'sick' && nextBaseAnimation !== 'sick';
  const nextState = {
    ...state,
    baseAnimation: nextBaseAnimation,
    currentAnimation: state.isPlayingOneShot ? state.currentAnimation : nextBaseAnimation,
  };

  if (leavingSick) {
    return enqueueReactiveAnimations(nextState, ['recovery']);
  }

  return nextState;
}

export function actionsToReactiveAnimations({
  actions = [],
  userProfile = null,
  beforeDailyLog = null,
  afterDailyLog = null,
} = {}) {
  const animations = [];

  for (const action of actions) {
    if (action.type === 'log_meal') {
      animations.push('eating');
    }

    if (action.type === 'set_workout_day' && action.data?.is_workout_day === true) {
      animations.push('workout');
    }
  }

  if (
    didCrossProteinTarget({
      userProfile,
      beforeDailyLog,
      afterDailyLog,
    })
  ) {
    animations.push('happy_bounce');
  }

  return animations;
}
