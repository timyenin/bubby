import type { BubbyState, DailyLog, UserProfile } from './storage.ts';
import type { ParsedAction } from './actions.ts';

export type LoopingAnimation = 'idle' | 'sleepy' | 'sick';
export type OneShotAnimation =
  | 'eating'
  | 'happy_bounce'
  | 'workout'
  | 'recovery'
  | 'spin';
export type AnimationName = LoopingAnimation | OneShotAnimation;

export const LOOPING_ANIMATIONS: LoopingAnimation[] = ['idle', 'sleepy', 'sick'];
export const ONE_SHOT_ANIMATIONS: OneShotAnimation[] = [
  'eating',
  'happy_bounce',
  'workout',
  'recovery',
  'spin',
];
export const IDLE_SPIN_INTERVAL_MS = 30_000;

const LATE_NIGHT_HOUR = 23;
const LOW_ENERGY_SLEEPY_THRESHOLD = 25;

export interface AnimationState {
  baseAnimation: LoopingAnimation;
  currentAnimation: AnimationName;
  queue: OneShotAnimation[];
  playbackId: number;
  isPlayingOneShot: boolean;
}

export interface BaseAnimationOptions {
  bubbyState?: BubbyState | null;
  dailyLog?: DailyLog | null;
  now?: Date;
}

function isOneShot(animationName: AnimationName | string): animationName is OneShotAnimation {
  return ONE_SHOT_ANIMATIONS.includes(animationName as OneShotAnimation);
}

function isLateNight(now: Date): boolean {
  return now.getHours() >= LATE_NIGHT_HOUR || now.getHours() < 5;
}

function isLowEnergy(bubbyState: BubbyState | null | undefined): boolean {
  return Number(bubbyState?.energy ?? 100) < LOW_ENERGY_SLEEPY_THRESHOLD;
}

function getProteinTotal(dailyLog: DailyLog | null | undefined): number {
  return Number(dailyLog?.totals?.protein_g ?? 0);
}

function getProteinTarget(
  userProfile: UserProfile | null | undefined,
  dailyLog: DailyLog | null | undefined,
): number {
  const targets = userProfile?.macro_targets;
  const target = dailyLog?.is_workout_day ? targets?.workout_day : targets?.rest_day;
  return Number(target?.protein_g ?? 0);
}

function didCrossProteinTarget({
  userProfile,
  beforeDailyLog,
  afterDailyLog,
}: {
  userProfile: UserProfile | null | undefined;
  beforeDailyLog: DailyLog | null | undefined;
  afterDailyLog: DailyLog | null | undefined;
}): boolean {
  const target = getProteinTarget(userProfile, afterDailyLog);
  if (target <= 0) {
    return false;
  }

  return getProteinTotal(beforeDailyLog) < target && getProteinTotal(afterDailyLog) >= target;
}

export function resolveBaseAnimation({
  bubbyState = null,
  now = new Date(),
}: BaseAnimationOptions = {}): LoopingAnimation {
  if (bubbyState?.is_sick === true) {
    return 'sick';
  }

  if (isLateNight(now) || isLowEnergy(bubbyState)) {
    return 'sleepy';
  }

  return 'idle';
}

export function createAnimationState({
  baseAnimation = 'idle',
  currentAnimation = baseAnimation,
  queue = [],
  playbackId = 0,
}: Partial<AnimationState> = {}): AnimationState {
  return {
    baseAnimation,
    currentAnimation,
    queue,
    playbackId,
    isPlayingOneShot: isOneShot(currentAnimation),
  };
}

export function enqueueReactiveAnimations(
  state: AnimationState,
  animations: AnimationName[] = [],
): AnimationState {
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

export function finishCurrentAnimation(state: AnimationState): AnimationState {
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

export function canTriggerIdleSpin(state: AnimationState): boolean {
  return (
    state.baseAnimation === 'idle' &&
    state.currentAnimation === 'idle' &&
    !state.isPlayingOneShot &&
    state.queue.length === 0
  );
}

export function maybeTriggerIdleSpin(
  state: AnimationState,
  idleDwellMs: number,
): AnimationState {
  if (idleDwellMs < IDLE_SPIN_INTERVAL_MS || !canTriggerIdleSpin(state)) {
    return state;
  }

  return enqueueReactiveAnimations(state, ['spin']);
}

export function syncBaseAnimation(
  state: AnimationState,
  options: BaseAnimationOptions = {},
): AnimationState {
  const nextBaseAnimation = resolveBaseAnimation(options);
  const leavingSick = state.baseAnimation === 'sick' && nextBaseAnimation !== 'sick';
  const nextState: AnimationState = {
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
}: {
  actions?: ParsedAction[];
  userProfile?: UserProfile | null;
  beforeDailyLog?: DailyLog | null;
  afterDailyLog?: DailyLog | null;
} = {}): OneShotAnimation[] {
  const animations: OneShotAnimation[] = [];

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
