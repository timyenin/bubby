import { useState } from 'react';

import HomeScreen from './HomeScreen.jsx';
import {
  buildOnboardingPlan,
  ONBOARDING_HOME_CLOSING_LINE,
  ONBOARDING_OPENING_LINE,
  parseOnboardingCompleteAction,
  stripActionEnvelopes,
} from '../lib/onboarding.ts';
import {
  setConversationHistory,
  setOnboardingComplete,
  setPantry,
  setUserProfile,
} from '../lib/storage.ts';

function createMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

function historyForApi(messages) {
  return messages.map(({ role, content }) => ({ role, content }));
}

function Reveal({ plan, onConfirm }) {
  const { rest_day: restDay, workout_day: workoutDay, calorie_floor: floor } = plan.reveal;

  return (
    <div className="reveal-backdrop" role="dialog" aria-modal="true" aria-label="daily plan">
      <section className="reveal-panel">
        <p className="reveal-kicker">daily plan</p>
        <h2>bubby's first guess</h2>
        <div className="macro-grid" aria-label="macro targets">
          <article>
            <h3>rest</h3>
            <p>{restDay.calories} cal</p>
            <span>{restDay.protein_g}p / {restDay.carbs_g}c / {restDay.fat_g}f</span>
          </article>
          <article>
            <h3>workout</h3>
            <p>{workoutDay.calories} cal</p>
            <span>{workoutDay.protein_g}p / {workoutDay.carbs_g}c / {workoutDay.fat_g}f</span>
          </article>
        </div>
        <p className="reveal-floor">calorie floor: {floor}</p>
        <button className="reveal-button" type="button" onClick={onConfirm}>
          looks good
        </button>
      </section>
    </div>
  );
}

function Onboarding({ onComplete }) {
  const [phase, setPhase] = useState('hatch');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);

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
            current_time: new Date().toISOString(),
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

      if (action) {
        setPendingPlan({
          ...buildOnboardingPlan(action.profile),
          messages: updatedMessages,
        });
        setPhase('reveal');
      }
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage('assistant', 'something glitched. try that again?'),
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function finishOnboarding() {
    if (!pendingPlan) {
      return;
    }

    const closingMessage = createMessage('assistant', ONBOARDING_HOME_CLOSING_LINE);
    setUserProfile(pendingPlan.profile);
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
