import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import HomeScreen from './HomeScreen.tsx';
import {
  buildOnboardingPlan,
  ONBOARDING_HOME_CLOSING_LINE,
  ONBOARDING_OPENING_LINE,
  parseOnboardingCompleteAction,
  stripActionEnvelopes,
  type OnboardingPlan,
  type OnboardingProfileData,
} from '../lib/onboarding.ts';
import {
  DIALOGUE_CHARACTER_DELAY_MS,
  getDialogueRolloutDelay,
} from '../lib/dialogueRollout.ts';
import {
  setConversationHistory,
  setOnboardingComplete,
  setPantry,
  setUserProfile,
  type ChatMessage,
} from '../lib/storage.ts';
import { buildCurrentTimeContext } from '../lib/timeContext.ts';

interface OnboardingMessage extends ChatMessage {
  id: string;
}

type OnboardingPhase = 'hatch' | 'chat' | 'reveal';

interface PendingPlan extends OnboardingPlan {
  messages: OnboardingMessage[];
}

interface OnboardingProps {
  onComplete: (closingMessage: ChatMessage) => void;
}

interface RevealProps {
  plan: PendingPlan;
  onConfirm: (reveal: PendingPlan['reveal']) => void;
}

type MacroField = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g';
type MacroTarget = PendingPlan['reveal']['rest_day'];

function createMessage(role: ChatMessage['role'], content: string): OnboardingMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

function historyForApi(messages: OnboardingMessage[]): Array<Pick<ChatMessage, 'role' | 'content'>> {
  return messages.map(({ role, content }) => ({ role, content }));
}

function sanitizeNumberInput(value: string): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? Math.max(0, Math.round(nextValue)) : 0;
}

function Reveal({ plan, onConfirm }: RevealProps) {
  const [restDay, setRestDay] = useState<MacroTarget>(() => ({ ...plan.reveal.rest_day }));
  const [workoutDay, setWorkoutDay] = useState<MacroTarget>(() => ({ ...plan.reveal.workout_day }));
  const [calorieFloor, setCalorieFloor] = useState(plan.reveal.calorie_floor);

  function updateTarget(
    setter: Dispatch<SetStateAction<MacroTarget>>,
    field: MacroField,
    value: string,
  ) {
    setter((currentTarget) => ({
      ...currentTarget,
      [field]: sanitizeNumberInput(value),
    }));
  }

  function renderMacroInputs(
    label: string,
    target: MacroTarget,
    setter: Dispatch<SetStateAction<MacroTarget>>,
  ) {
    return (
      <article>
        <h3>{label}</h3>
        <label className="macro-input-row macro-input-row-primary">
          <span>cal</span>
          <input
            aria-label={`${label} day calories`}
            type="number"
            min="0"
            inputMode="numeric"
            value={target.calories}
            onChange={(event) => updateTarget(setter, 'calories', event.target.value)}
          />
        </label>
        <div className="macro-input-grid">
          <label className="macro-input-row">
            <span>p</span>
            <input
              aria-label={`${label} day protein grams`}
              type="number"
              min="0"
              inputMode="numeric"
              value={target.protein_g}
              onChange={(event) => updateTarget(setter, 'protein_g', event.target.value)}
            />
          </label>
          <label className="macro-input-row">
            <span>c</span>
            <input
              aria-label={`${label} day carb grams`}
              type="number"
              min="0"
              inputMode="numeric"
              value={target.carbs_g}
              onChange={(event) => updateTarget(setter, 'carbs_g', event.target.value)}
            />
          </label>
          <label className="macro-input-row">
            <span>f</span>
            <input
              aria-label={`${label} day fat grams`}
              type="number"
              min="0"
              inputMode="numeric"
              value={target.fat_g}
              onChange={(event) => updateTarget(setter, 'fat_g', event.target.value)}
            />
          </label>
        </div>
      </article>
    );
  }

  return (
    <div className="reveal-backdrop" role="dialog" aria-modal="true" aria-label="daily plan">
      <section className="reveal-panel">
        <p className="reveal-kicker">daily plan</p>
        <h2>bubby's first guess</h2>
        <div className="macro-grid" aria-label="macro targets">
          {renderMacroInputs('rest', restDay, setRestDay)}
          {renderMacroInputs('workout', workoutDay, setWorkoutDay)}
        </div>
        <label className="reveal-floor">
          <span>calorie floor</span>
          <input
            aria-label="calorie floor"
            type="number"
            min="0"
            inputMode="numeric"
            value={calorieFloor}
            onChange={(event) => setCalorieFloor(sanitizeNumberInput(event.target.value))}
          />
        </label>
        <button
          className="reveal-button"
          type="button"
          onClick={() => onConfirm({
            rest_day: restDay,
            workout_day: workoutDay,
            calorie_floor: calorieFloor,
          })}
        >
          looks good
        </button>
      </section>
    </div>
  );
}

function Onboarding({ onComplete }: OnboardingProps) {
  const [phase, setPhase] = useState<OnboardingPhase>('hatch');
  const [messages, setMessages] = useState<OnboardingMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [rollingMessageId, setRollingMessageId] = useState<string | null>(null);
  const [revealedLength, setRevealedLength] = useState(0);
  const rolloutIntervalRef = useRef<number | null>(null);

  function clearRolloutInterval() {
    if (rolloutIntervalRef.current !== null) {
      window.clearInterval(rolloutIntervalRef.current);
      rolloutIntervalRef.current = null;
    }
  }

  function startReplyRollout(messageId: string, reply: string): Promise<void> {
    clearRolloutInterval();
    setRollingMessageId(messageId);
    setRevealedLength(0);

    if (!reply) {
      setRollingMessageId(null);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let currentLength = 0;
      let pauseUntil = 0;

      rolloutIntervalRef.current = window.setInterval(() => {
        const now = Date.now();

        if (now < pauseUntil) {
          return;
        }

        currentLength += 1;
        setRevealedLength(currentLength);

        if (currentLength >= reply.length) {
          clearRolloutInterval();
          setRollingMessageId(null);
          resolve();
          return;
        }

        const nextDelay = getDialogueRolloutDelay(reply, currentLength);
        if (nextDelay > DIALOGUE_CHARACTER_DELAY_MS) {
          pauseUntil = now + nextDelay;
        }
      }, DIALOGUE_CHARACTER_DELAY_MS);
    });
  }

  useEffect(() => {
    return () => {
      clearRolloutInterval();
    };
  }, []);

  function beginConversation() {
    setPhase('chat');
    setMessages([createMessage('assistant', ONBOARDING_OPENING_LINE)]);
  }

  async function sendMessage() {
    const content = inputValue.trim();
    if (!content || isSending) {
      return;
    }

    const userMessage = createMessage('user', content);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputValue('');
    setIsSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: content,
          image: null,
          context: {
            recent_history: historyForApi(messages),
            current_time: buildCurrentTimeContext(),
            is_onboarding: true,
          },
          is_onboarding: true,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'chat request failed');
      }

      const visibleReply = stripActionEnvelopes(body.reply);
      const assistantMessage = createMessage('assistant', visibleReply);
      const action = parseOnboardingCompleteAction(body.reply);
      const updatedMessages = [...nextMessages, assistantMessage];
      setMessages(updatedMessages);
      await startReplyRollout(assistantMessage.id, visibleReply);

      if (action?.profile) {
        setPendingPlan({
          ...buildOnboardingPlan(action.profile as OnboardingProfileData),
          messages: updatedMessages,
        });
        setPhase('reveal');
      }
    } catch {
      const errorMessage = createMessage('assistant', 'something glitched. try that again?');
      setMessages((currentMessages) => [
        ...currentMessages,
        errorMessage,
      ]);
      await startReplyRollout(errorMessage.id, errorMessage.content);
    } finally {
      setIsSending(false);
    }
  }

  function finishOnboarding(reveal: PendingPlan['reveal']) {
    if (!pendingPlan) {
      return;
    }

    const closingMessage = createMessage('assistant', ONBOARDING_HOME_CLOSING_LINE);
    const finalProfile = {
      ...pendingPlan.profile,
      macro_targets: {
        rest_day: reveal.rest_day,
        workout_day: reveal.workout_day,
      },
      calorie_floor: reveal.calorie_floor,
    };
    setUserProfile(finalProfile);
    setPantry(pendingPlan.pantry);
    setConversationHistory({
      messages: [...pendingPlan.messages, closingMessage].map(({ role, content, timestamp }) => ({
        role,
        content,
        timestamp,
      })),
    });
    setOnboardingComplete(true);
    onComplete(closingMessage);
  }

  const isHatch = phase === 'hatch';

  return (
    <HomeScreen
      ariaLabel="bubby onboarding"
      lcdProps={{
        onActivate: isHatch ? beginConversation : undefined,
        spriteAnimated: !isHatch,
        hint: isHatch ? 'tap bubby' : undefined,
      }}
      messages={messages}
      rollingMessageId={rollingMessageId}
      revealedLength={revealedLength}
      chatBarProps={{
        value: inputValue,
        onChange: setInputValue,
        onSubmit: sendMessage,
        disabled: phase !== 'chat' || isSending,
        isSending,
      }}
    >
      {phase === 'reveal' && pendingPlan ? (
        <Reveal plan={pendingPlan} onConfirm={finishOnboarding} />
      ) : null}
    </HomeScreen>
  );
}

export default Onboarding;
