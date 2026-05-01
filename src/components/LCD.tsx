import type { KeyboardEvent } from 'react';

import BubbySprite from './BubbySprite.tsx';
import type { AnimationName } from '../lib/animationState.ts';

interface LCDProps {
  onActivate?: () => void;
  spriteAnimated?: boolean;
  hint?: string | null;
  animationName?: AnimationName;
  animationPlaybackId?: number;
  animationLoop?: boolean;
  onAnimationComplete?: () => void;
  bubbyFillColor?: string | null;
}

function LCD({
  onActivate,
  spriteAnimated = true,
  hint,
  animationName = 'idle',
  animationPlaybackId = 0,
  animationLoop = true,
  onAnimationComplete,
  bubbyFillColor = null,
}: LCDProps) {
  const isInteractive = typeof onActivate === 'function';

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!isInteractive) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate?.();
    }
  }

  return (
    <section
      className={`lcd-shell${isInteractive ? ' lcd-shell-interactive' : ''}`}
      aria-label="bubby lcd"
      onClick={onActivate}
      onKeyDown={handleKeyDown}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      <div className="lcd-window" aria-label="lcd screen">
        <img
          className="lcd-swirl"
          src="/assets/lcd_swirl_background.png"
          alt=""
          draggable="false"
        />
        <BubbySprite
          key={`${animationName}:${animationPlaybackId ?? 0}`}
          animated={spriteAnimated}
          animationName={animationName}
          playbackId={animationPlaybackId}
          loop={animationLoop}
          onComplete={onAnimationComplete}
          fillColor={bubbyFillColor}
        />
        {hint ? <p className="lcd-hint">{hint}</p> : null}
      </div>
    </section>
  );
}

export default LCD;
