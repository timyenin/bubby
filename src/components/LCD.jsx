import BubbySprite from './BubbySprite.jsx';

function LCD({
  onActivate,
  spriteAnimated = true,
  hint,
  animationName = 'idle',
  animationPlaybackId = 0,
  animationLoop = true,
  onAnimationComplete,
}) {
  const isInteractive = typeof onActivate === 'function';

  function handleKeyDown(event) {
    if (!isInteractive) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
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
        />
        {hint ? <p className="lcd-hint">{hint}</p> : null}
      </div>
    </section>
  );
}

export default LCD;
