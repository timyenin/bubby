const LONG_HOLD_MS: [number, number] = [3000, 7000];
const SHORT_FRAME_MS: [number, number] = [150, 300];
const ACTION_FRAME_MS: [number, number] = [150, 200];
const SLEEPY_Z_FRAME_INDEX = 1;
const SLEEPY_Z_HOLD_MS: [number, number] = [2000, 4000];
const IDLE_BLINK_ROLL = 0.5;
const IDLE_LOOK_LEFT_ROLL = 0.68;
const IDLE_LOOK_RIGHT_ROLL = 0.86;

export function getIdleFrameDelayMs(
  frameIndex: number,
  random: () => number = Math.random,
): number {
  const [min, max] = frameIndex === 0 ? LONG_HOLD_MS : SHORT_FRAME_MS;

  return Math.round(min + random() * (max - min));
}

export function getActionFrameDelayMs(random: () => number = Math.random): number {
  const [min, max] = ACTION_FRAME_MS;

  return Math.round(min + random() * (max - min));
}

export function getInitialAnimationFrameIndex(animationName: string, frameCount: number): number {
  if (animationName === 'sleepy' && frameCount > SLEEPY_Z_FRAME_INDEX) {
    return SLEEPY_Z_FRAME_INDEX;
  }

  return 0;
}

export function getLoopingAnimationFrameDelayMs(
  animationName: string,
  frameIndex: number,
  random: () => number = Math.random,
): number {
  if (animationName === 'sleepy' && frameIndex === SLEEPY_Z_FRAME_INDEX) {
    const [min, max] = SLEEPY_Z_HOLD_MS;

    return Math.round(min + random() * (max - min));
  }

  return getIdleFrameDelayMs(frameIndex, random);
}

export function getNextIdleFrameIndex(
  frameIndex: number,
  frameCount: number,
  random: () => number = Math.random,
): number {
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    return 0;
  }

  if (frameCount <= 2) {
    return (frameIndex + 1) % frameCount;
  }

  if (frameIndex !== 0) {
    return 0;
  }

  const roll = random();
  const maxFrameIndex = frameCount - 1;

  if (roll < IDLE_BLINK_ROLL) {
    return Math.min(1, maxFrameIndex);
  }

  if (roll < IDLE_LOOK_LEFT_ROLL) {
    return Math.min(2, maxFrameIndex);
  }

  if (roll < IDLE_LOOK_RIGHT_ROLL) {
    return Math.min(3, maxFrameIndex);
  }

  return Math.min(4, maxFrameIndex);
}

export function getNextAnimationFrameIndex(
  animationName: string,
  frameIndex: number,
  frameCount: number,
  random: () => number = Math.random,
): number {
  if (animationName === 'idle') {
    return getNextIdleFrameIndex(frameIndex, frameCount, random);
  }

  if (!Number.isInteger(frameCount) || frameCount < 1) {
    return 0;
  }

  return (frameIndex + 1) % frameCount;
}

export interface SpriteBackgroundPositionParams {
  frameIndex: number;
  frameWidth: number;
  sheetWidth: number;
  xOffset: number;
}

export function getSpriteBackgroundPositionPercent({
  frameIndex,
  frameWidth,
  sheetWidth,
  xOffset,
}: SpriteBackgroundPositionParams): number {
  const sheetFrameCount = sheetWidth / frameWidth;
  const frameOffset = xOffset / frameWidth + frameIndex;

  if (sheetFrameCount <= 1) {
    return 0;
  }

  return Number(((frameOffset / (sheetFrameCount - 1)) * 100).toFixed(4));
}
