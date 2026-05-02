// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actionsToReactiveAnimations,
  chooseTapReactionAnimations,
  createAnimationState,
  enqueueReactiveAnimations,
  finishCurrentAnimation,
  maybeTriggerIdleSpin,
  triggerTapReaction,
  syncBaseAnimation,
} from './animationState.ts';

const profile = {
  macro_targets: {
    rest_day: { protein_g: 165 },
    workout_day: { protein_g: 165 },
  },
};

test('state transitions idle to eating and back to idle', () => {
  const eating = enqueueReactiveAnimations(createAnimationState(), ['eating']);

  assert.equal(eating.baseAnimation, 'idle');
  assert.equal(eating.currentAnimation, 'eating');
  assert.equal(eating.isPlayingOneShot, true);

  const finished = finishCurrentAnimation(eating);
  assert.equal(finished.currentAnimation, 'idle');
  assert.equal(finished.isPlayingOneShot, false);
});

test('state transitions idle to sick to recovery to idle', () => {
  const sick = syncBaseAnimation(createAnimationState(), {
    bubbyState: { is_sick: true },
    now: new Date('2026-04-27T12:00:00'),
  });

  assert.equal(sick.baseAnimation, 'sick');
  assert.equal(sick.currentAnimation, 'sick');

  const recovering = syncBaseAnimation(sick, {
    bubbyState: { is_sick: false },
    now: new Date('2026-04-27T12:00:00'),
  });

  assert.equal(recovering.baseAnimation, 'idle');
  assert.equal(recovering.currentAnimation, 'recovery');
  assert.equal(recovering.isPlayingOneShot, true);

  assert.equal(finishCurrentAnimation(recovering).currentAnimation, 'idle');
});

test('sleepy loops during late night when not sick', () => {
  const lateNight = syncBaseAnimation(createAnimationState(), {
    bubbyState: { is_sick: false },
    dailyLog: { is_workout_day: true },
    now: new Date('2026-04-27T23:30:00'),
  });

  assert.equal(lateNight.currentAnimation, 'sleepy');
});

test('sleepy loops when energy is below 25 and not sick', () => {
  const lowEnergy = syncBaseAnimation(createAnimationState(), {
    bubbyState: { is_sick: false, energy: 24 },
    dailyLog: { is_workout_day: true },
    now: new Date('2026-04-27T14:30:00'),
  });

  assert.equal(lowEnergy.currentAnimation, 'sleepy');
});

test('rest day evening with normal energy stays idle', () => {
  const restEvening = syncBaseAnimation(createAnimationState(), {
    bubbyState: { is_sick: false, energy: 80 },
    dailyLog: { is_workout_day: false },
    now: new Date('2026-04-27T19:30:00'),
  });

  assert.equal(restEvening.currentAnimation, 'idle');
});

test('sick overrides sleepy conditions', () => {
  const sickLateNight = syncBaseAnimation(createAnimationState(), {
    bubbyState: { is_sick: true, energy: 10 },
    dailyLog: { is_workout_day: false },
    now: new Date('2026-04-27T23:30:00'),
  });

  assert.equal(sickLateNight.currentAnimation, 'sick');
});

test('reactive animations briefly interrupt sick and then return to sick', () => {
  const sick = syncBaseAnimation(createAnimationState(), {
    bubbyState: { is_sick: true },
  });
  const eating = enqueueReactiveAnimations(sick, ['eating']);

  assert.equal(eating.baseAnimation, 'sick');
  assert.equal(eating.currentAnimation, 'eating');
  assert.equal(finishCurrentAnimation(eating).currentAnimation, 'sick');
});

test('animation queue plays reactive animations in order', () => {
  const queued = enqueueReactiveAnimations(createAnimationState(), [
    'eating',
    'happy_bounce',
  ]);

  assert.equal(queued.currentAnimation, 'eating');
  assert.deepEqual(queued.queue, ['happy_bounce']);

  const second = finishCurrentAnimation(queued);
  assert.equal(second.currentAnimation, 'happy_bounce');
  assert.deepEqual(second.queue, []);

  assert.equal(finishCurrentAnimation(second).currentAnimation, 'idle');
});

test('idle spin triggers only after the idle dwell interval', () => {
  const idle = createAnimationState();

  assert.equal(maybeTriggerIdleSpin(idle, 29_999).currentAnimation, 'idle');

  const spinning = maybeTriggerIdleSpin(idle, 30_000);
  assert.equal(spinning.currentAnimation, 'spin');
  assert.equal(spinning.isPlayingOneShot, true);
});

test('sleepy and sick states never trigger idle spin', () => {
  const sleepy = createAnimationState({
    baseAnimation: 'sleepy',
    currentAnimation: 'sleepy',
  });
  const sick = createAnimationState({
    baseAnimation: 'sick',
    currentAnimation: 'sick',
  });

  assert.equal(maybeTriggerIdleSpin(sleepy, 30_000).currentAnimation, 'sleepy');
  assert.equal(maybeTriggerIdleSpin(sick, 30_000).currentAnimation, 'sick');
});

test('idle spin does not interrupt reactive or non-idle animations', () => {
  const eating = enqueueReactiveAnimations(createAnimationState(), ['eating']);
  const sleepy = createAnimationState({
    baseAnimation: 'sleepy',
    currentAnimation: 'sleepy',
  });

  assert.equal(maybeTriggerIdleSpin(eating, 30_000).currentAnimation, 'eating');
  assert.equal(maybeTriggerIdleSpin(sleepy, 30_000).currentAnimation, 'sleepy');
});

test('idle spin returns to idle after completing', () => {
  const spinning = maybeTriggerIdleSpin(createAnimationState(), 30_000);
  const finished = finishCurrentAnimation(spinning);

  assert.equal(finished.currentAnimation, 'idle');
  assert.equal(finished.isPlayingOneShot, false);
});

test('tap reaction helper chooses happy bounces or x-eyes from random value', () => {
  assert.deepEqual(chooseTapReactionAnimations(() => 0.69), [
    'happy_bounce',
    'happy_bounce',
  ]);
  assert.deepEqual(chooseTapReactionAnimations(() => 0.7), ['tap_x_eyes']);
});

test('happy tap reaction queues two happy bounces', () => {
  const reaction = triggerTapReaction(createAnimationState(), () => 0.1);

  assert.equal(reaction.currentAnimation, 'happy_bounce');
  assert.deepEqual(reaction.queue, ['happy_bounce']);

  const secondBounce = finishCurrentAnimation(reaction);
  assert.equal(secondBounce.currentAnimation, 'happy_bounce');
  assert.deepEqual(secondBounce.queue, []);

  assert.equal(finishCurrentAnimation(secondBounce).currentAnimation, 'idle');
});

test('x-eyes tap reaction plays as a dedicated one-shot and returns to idle', () => {
  const reaction = triggerTapReaction(createAnimationState(), () => 0.95);

  assert.equal(reaction.currentAnimation, 'tap_x_eyes');
  assert.equal(reaction.isPlayingOneShot, true);
  assert.equal(finishCurrentAnimation(reaction).currentAnimation, 'idle');
});

test('tap reactions do nothing while sleepy, sick, one-shot, or queued', () => {
  const sleepy = createAnimationState({
    baseAnimation: 'sleepy',
    currentAnimation: 'sleepy',
  });
  const sick = createAnimationState({
    baseAnimation: 'sick',
    currentAnimation: 'sick',
  });
  const eating = enqueueReactiveAnimations(createAnimationState(), ['eating']);
  const queued = createAnimationState({
    baseAnimation: 'idle',
    currentAnimation: 'idle',
    queue: ['happy_bounce'],
  });

  assert.equal(triggerTapReaction(sleepy, () => 0).currentAnimation, 'sleepy');
  assert.equal(triggerTapReaction(sick, () => 0).currentAnimation, 'sick');
  assert.equal(triggerTapReaction(eating, () => 0).currentAnimation, 'eating');
  assert.deepEqual(triggerTapReaction(queued, () => 0).queue, ['happy_bounce']);
});

test('idle spin can still trigger later after a tap reaction completes', () => {
  const reaction = triggerTapReaction(createAnimationState(), () => 0.1);
  const finished = finishCurrentAnimation(finishCurrentAnimation(reaction));
  const spinning = maybeTriggerIdleSpin(finished, 30_000);

  assert.equal(finished.currentAnimation, 'idle');
  assert.equal(spinning.currentAnimation, 'spin');
});

test('duplicate queued animations advance playback ids so they can restart', () => {
  const queued = enqueueReactiveAnimations(createAnimationState(), ['eating', 'eating']);

  assert.equal(queued.currentAnimation, 'eating');
  assert.equal(queued.playbackId, 1);

  const secondEating = finishCurrentAnimation(queued);
  assert.equal(secondEating.currentAnimation, 'eating');
  assert.equal(secondEating.playbackId, 2);

  assert.equal(finishCurrentAnimation(secondEating).currentAnimation, 'idle');
});

test('protein threshold crossing triggers happy_bounce only when crossing from below', () => {
  const action = {
    type: 'log_meal',
    data: {
      description: 'big protein meal',
      macros: { calories: 600, protein_g: 120, carbs_g: 30, fat_g: 20 },
    },
  };

  assert.deepEqual(
    actionsToReactiveAnimations({
      actions: [action],
      userProfile: profile,
      beforeDailyLog: {
        is_workout_day: true,
        totals: { protein_g: 50 },
      },
      afterDailyLog: {
        is_workout_day: true,
        totals: { protein_g: 170 },
      },
    }),
    ['eating', 'happy_bounce'],
  );

  assert.deepEqual(
    actionsToReactiveAnimations({
      actions: [action],
      userProfile: profile,
      beforeDailyLog: {
        is_workout_day: true,
        totals: { protein_g: 170 },
      },
      afterDailyLog: {
        is_workout_day: true,
        totals: { protein_g: 180 },
      },
    }),
    ['eating'],
  );
});

test('play_animation action queues every safe direct one-shot animation', () => {
  for (const animation of [
    'eating',
    'happy_bounce',
    'workout',
    'recovery',
    'spin',
    'tap_x_eyes',
  ]) {
    assert.deepEqual(
      actionsToReactiveAnimations({
        actions: [{ type: 'play_animation', data: { animation } }],
      }),
      [animation],
    );
  }
});

test('play_animation count defaults to one and clamps to one through three', () => {
  assert.deepEqual(
    actionsToReactiveAnimations({
      actions: [{ type: 'play_animation', data: { animation: 'happy_bounce', count: 2 } }],
    }),
    ['happy_bounce', 'happy_bounce'],
  );

  assert.deepEqual(
    actionsToReactiveAnimations({
      actions: [{ type: 'play_animation', data: { animation: 'happy_bounce', count: 99 } }],
    }),
    ['happy_bounce', 'happy_bounce', 'happy_bounce'],
  );

  assert.deepEqual(
    actionsToReactiveAnimations({
      actions: [{ type: 'play_animation', data: { animation: 'happy_bounce', count: 0 } }],
    }),
    ['happy_bounce'],
  );
});

test('play_animation ignores unknown animation names safely', () => {
  assert.deepEqual(
    actionsToReactiveAnimations({
      actions: [{ type: 'play_animation', data: { animation: 'totally_not_real', count: 2 } }],
    }),
    [],
  );
});
