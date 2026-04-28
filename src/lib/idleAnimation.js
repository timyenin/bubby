const LONG_HOLD_MS = [3000, 7000];
const SHORT_FRAME_MS = [150, 300];
const ACTION_FRAME_MS = [150, 200];

export function getIdleFrameDelayMs(frameIndex, random = Math.random) {
  const [min, max] = frameIndex === 0 ? LONG_HOLD_MS : SHORT_FRAME_MS;

  return Math.round(min + random() * (max - min));
}

export function getActionFrameDelayMs(random = Math.random) {
  const [min, max] = ACTION_FRAME_MS;

  return Math.round(min + random() * (max - min));
}

export function getNextIdleFrameIndex(frameIndex, frameCount) {
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    return 0;
  }

  return (frameIndex + 1) % frameCount;
}

export function getSpriteBackgroundPositionPercent({
  frameIndex,
  frameWidth,
  sheetWidth,
  xOffset,
}) {
  const sheetFrameCount = sheetWidth / frameWidth;
  const frameOffset = xOffset / frameWidth + frameIndex;

  if (sheetFrameCount <= 1) {
    return 0;
  }

  return Number(((frameOffset / (sheetFrameCount - 1)) * 100).toFixed(4));
}
