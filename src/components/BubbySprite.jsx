import { useEffect, useMemo, useState } from 'react';

import {
  getActionFrameDelayMs,
  getIdleFrameDelayMs,
  getNextIdleFrameIndex,
  getSpriteBackgroundPositionPercent,
} from '../lib/idleAnimation.js';
import { loadSpriteManifest, resolveAnimationSheet } from '../lib/spriteManifest.js';

const IDLE_ANIMATION = 'idle';
const SPRITE_NATIVE_SCALE = 4;

function BubbySprite({
  animated = true,
  animationName = IDLE_ANIMATION,
  playbackId = 0,
  loop = true,
  onComplete,
}) {
  const normalizedPlaybackId = Number.isFinite(Number(playbackId))
    ? Number(playbackId)
    : 0;
  const playbackKey = `${animationName}:${normalizedPlaybackId}`;
  const [manifest, setManifest] = useState(null);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadManifest() {
      const spriteManifest = await loadSpriteManifest();

      if (!cancelled) {
        setManifest(spriteManifest);
      }
    }

    loadManifest().catch(() => {
      if (!cancelled) {
        setManifest(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const animationSheet = useMemo(() => {
    if (!manifest) {
      return null;
    }

    return resolveAnimationSheet(manifest, animationName);
  }, [animationName, manifest]);

  useEffect(() => {
    if (!animationSheet || !animated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      if (!loop && frameIndex >= animationSheet.frameCount - 1) {
        onComplete?.(animationName, normalizedPlaybackId);
        return;
      }

      setFrameIndex((currentFrame) =>
        getNextIdleFrameIndex(currentFrame, animationSheet.frameCount),
      );
    }, loop ? getIdleFrameDelayMs(frameIndex) : getActionFrameDelayMs());

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    animated,
    playbackKey,
    animationSheet,
    frameIndex,
    loop,
    onComplete,
  ]);

  const spriteStyle = useMemo(() => {
    if (!animationSheet) {
      return undefined;
    }

    const [frameWidth, frameHeight] = animationSheet.frameSize;
    const [sheetWidth] = animationSheet.sheetSize;

    return {
      '--sprite-width': `${frameWidth * SPRITE_NATIVE_SCALE}px`,
      '--sprite-height': `${frameHeight * SPRITE_NATIVE_SCALE}px`,
      '--sprite-native-scale': SPRITE_NATIVE_SCALE,
      '--sprite-sheet-frame-count': sheetWidth / frameWidth,
      '--sprite-position-x': `${getSpriteBackgroundPositionPercent({
        frameIndex,
        frameWidth,
        sheetWidth,
        xOffset: animationSheet.xOffset,
      })}%`,
      backgroundImage: `url("${animationSheet.src}")`,
    };
  }, [animationSheet, frameIndex]);

  if (!animationSheet) {
    return null;
  }

  return (
    <div
      className="bubby-sprite"
      aria-label={`bubby ${animationName} animation`}
      data-animation-name={animationName}
      data-frame-index={frameIndex}
      data-playback-id={normalizedPlaybackId}
      style={spriteStyle}
    />
  );
}

export default BubbySprite;
