import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import {
  getActionFrameDelayMs,
  getInitialAnimationFrameIndex,
  getLoopingAnimationFrameDelayMs,
  getNextAnimationFrameIndex,
  getSpriteBackgroundPositionPercent,
} from '../lib/idleAnimation.ts';
import {
  loadSpriteManifest,
  resolveAnimationSheet,
  type ResolvedAnimationSheet,
  type SpriteManifest,
} from '../lib/spriteManifest.ts';
import { recolorSpriteImageData } from '../lib/spriteTint.ts';
import type { AnimationName } from '../lib/animationState.ts';

const IDLE_ANIMATION = 'idle';
const SPRITE_NATIVE_SCALE = 4;

interface BubbySpriteProps {
  animated?: boolean;
  animationName?: AnimationName;
  playbackId?: number;
  loop?: boolean;
  onComplete?: (animationName: AnimationName, playbackId: number) => void;
  fillColor?: string | null;
}

type SpriteCSS = CSSProperties & {
  '--sprite-width'?: string;
  '--sprite-height'?: string;
  '--sprite-native-scale'?: number;
  '--sprite-sheet-frame-count'?: number;
  '--sprite-position-x'?: string;
};

function BubbySprite({
  animated = true,
  animationName = IDLE_ANIMATION,
  playbackId = 0,
  loop = true,
  onComplete,
  fillColor = null,
}: BubbySpriteProps) {
  const normalizedPlaybackId = Number.isFinite(Number(playbackId))
    ? Number(playbackId)
    : 0;
  const playbackKey = `${animationName}:${normalizedPlaybackId}`;
  const [manifest, setManifest] = useState<SpriteManifest | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [tintedSpriteSrc, setTintedSpriteSrc] = useState<string | null>(null);

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

  const animationSheet = useMemo<ResolvedAnimationSheet | null>(() => {
    if (!manifest) {
      return null;
    }

    return resolveAnimationSheet(manifest, animationName);
  }, [animationName, manifest]);

  useEffect(() => {
    if (!animationSheet?.src || !fillColor) {
      setTintedSpriteSrc(null);
      return undefined;
    }

    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (cancelled) {
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext('2d');

        if (!context) {
          setTintedSpriteSrc(null);
          return;
        }

        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const [frameWidth, frameHeight] = animationSheet.frameSize;
        context.putImageData(
          recolorSpriteImageData(imageData, fillColor, { frameWidth, frameHeight }),
          0,
          0,
        );

        if (!cancelled) {
          setTintedSpriteSrc(canvas.toDataURL('image/png'));
        }
      } catch (error) {
        console.error('Failed to tint Bubby sprite sheet', error);
        if (!cancelled) {
          setTintedSpriteSrc(null);
        }
      }
    };

    image.onerror = () => {
      if (!cancelled) {
        setTintedSpriteSrc(null);
      }
    };

    image.src = animationSheet.src;

    return () => {
      cancelled = true;
    };
  }, [animationSheet?.src, fillColor]);

  useEffect(() => {
    if (!animationSheet) {
      setFrameIndex(0);
      return;
    }

    setFrameIndex(getInitialAnimationFrameIndex(animationName, animationSheet.frameCount));
  }, [animationName, animationSheet, normalizedPlaybackId]);

  useEffect(() => {
    if (!animationSheet || !animated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(
      () => {
        if (!loop && frameIndex >= animationSheet.frameCount - 1) {
          onComplete?.(animationName, normalizedPlaybackId);
          return;
        }

        setFrameIndex((currentFrame) =>
          getNextAnimationFrameIndex(
            animationName,
            currentFrame,
            animationSheet.frameCount,
          ),
        );
      },
      loop
        ? getLoopingAnimationFrameDelayMs(animationName, frameIndex)
        : getActionFrameDelayMs(animationName),
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated, playbackKey, animationSheet, frameIndex, loop, onComplete]);

  const spriteStyle = useMemo<SpriteCSS | undefined>(() => {
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
      backgroundImage: `url("${tintedSpriteSrc ?? animationSheet.src}")`,
    };
  }, [animationSheet, frameIndex, tintedSpriteSrc]);

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
