import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import ChatBar from './ChatBar.tsx';
import ChatMessages, { type DisplayMessage } from './ChatMessages.tsx';
import LCD from './LCD.tsx';
import VitalBars from './VitalBars.tsx';
import {
  applyActions,
  parseActions,
  stripActionEnvelopes,
} from '../lib/actions.ts';
import {
  actionsToReactiveAnimations,
  createAnimationState,
  enqueueReactiveAnimations,
  finishCurrentAnimation,
  syncBaseAnimation,
  type AnimationName,
  type AnimationState,
} from '../lib/animationState.ts';
import { buildChatContextFromStorage } from '../lib/chatContext.ts';
import { todayString } from '../lib/dates.ts';
import {
  DIALOGUE_CHARACTER_DELAY_MS,
  getDialogueRolloutDelay,
} from '../lib/dialogueRollout.ts';
import { processImageForUpload } from '../lib/imageProcessing.ts';
import { ONBOARDING_HOME_CLOSING_LINE } from '../lib/onboarding.ts';
import {
  appendMessageToHistory,
  getBubbyState,
  getConversationHistory,
  getDailyLog,
  getUserProfile,
  setBubbyState,
  type ChatMessage,
  type ConversationHistory,
} from '../lib/storage.ts';
import {
  applyActionsVitalEffects,
  applyVitalDecay,
} from '../lib/vitalDecay.ts';

interface LcdPropsShape {
  onActivate?: () => void;
  spriteAnimated?: boolean;
  hint?: string | null;
  animationName?: AnimationName;
  animationPlaybackId?: number;
  animationLoop?: boolean;
  onAnimationComplete?: () => void;
}

interface ChatBarPropsShape {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onAttachmentChange?: (file: File | null) => void;
  attachmentClearSignal?: number;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
}

export interface HomeScreenProps {
  messages?: DisplayMessage[];
  initialMessages?: ChatMessage[] | DisplayMessage[];
  chatBarProps?: ChatBarPropsShape;
  lcdProps?: LcdPropsShape;
  children?: ReactNode;
  ariaLabel?: string;
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;,]+;base64,/s, '');
}

function createMessage(
  role: ChatMessage['role'],
  content: string,
  extras: Partial<ChatMessage> = {},
): ChatMessage {
  const timestamp = new Date().toISOString();

  return {
    id: `message_${timestamp.replace(/[^0-9]/g, '')}_${Math.random().toString(36).slice(2)}`,
    role,
    content,
    timestamp,
    ...extras,
  };
}

function homeVisibleMessages(
  historyOrMessages: ConversationHistory | ChatMessage[] | DisplayMessage[] | null | undefined,
): DisplayMessage[] {
  const messages: DisplayMessage[] = Array.isArray(historyOrMessages)
    ? (historyOrMessages as DisplayMessage[])
    : ((historyOrMessages?.messages ?? []) as DisplayMessage[]);
  let startIndex = -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].content === ONBOARDING_HOME_CLOSING_LINE) {
      startIndex = index;
      break;
    }
  }

  return startIndex >= 0 ? messages.slice(startIndex) : messages;
}

function readAnimationInputs() {
  return {
    bubbyState: getBubbyState(),
    dailyLog: getDailyLog(todayString()),
    now: new Date(),
  };
}

function buildInitialAnimationState(): AnimationState {
  const inputs = readAnimationInputs();
  const initialState = syncBaseAnimation(createAnimationState(), inputs);

  if (
    inputs.bubbyState?.current_animation === 'sick' &&
    inputs.bubbyState?.is_sick !== true
  ) {
    return enqueueReactiveAnimations(initialState, ['recovery']);
  }

  return initialState;
}

function persistAnimationName(animationName: AnimationName) {
  const bubbyState = getBubbyState();

  if (!bubbyState || bubbyState.current_animation === animationName) {
    return;
  }

  setBubbyState({
    ...bubbyState,
    current_animation: animationName,
  });
}

function HomeScreen({
  messages,
  initialMessages,
  chatBarProps,
  lcdProps,
  children,
  ariaLabel = 'bubby home screen',
}: HomeScreenProps) {
  const isControlledChat = Boolean(chatBarProps);
  const [homeMessages, setHomeMessages] = useState<DisplayMessage[]>(() =>
    homeVisibleMessages(initialMessages),
  );
  const [inputValue, setInputValue] = useState('');
  const [attachedImageFile, setAttachedImageFile] = useState<File | null>(null);
  const [attachmentClearSignal, setAttachmentClearSignal] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [rollingMessageId, setRollingMessageId] = useState<string | null>(null);
  const [revealedLength, setRevealedLength] = useState(0);
  const [animationState, setAnimationState] = useState<AnimationState>(buildInitialAnimationState);
  const [vitalBarsRefreshKey, setVitalBarsRefreshKey] = useState(0);
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

  const syncAnimationBaseFromStorage = useCallback(() => {
    setAnimationState((currentState) =>
      syncBaseAnimation(currentState, readAnimationInputs()),
    );
  }, []);

  const handleAnimationComplete = useCallback(() => {
    setAnimationState((currentState) => finishCurrentAnimation(currentState));
  }, []);

  useEffect(() => {
    if (isControlledChat) {
      return;
    }

    if (initialMessages) {
      setHomeMessages(homeVisibleMessages(initialMessages));
      return;
    }

    setHomeMessages(homeVisibleMessages(getConversationHistory()));
  }, [initialMessages, isControlledChat]);

  useEffect(() => {
    if (isControlledChat) {
      return undefined;
    }

    applyVitalDecay();
    setVitalBarsRefreshKey((currentKey) => currentKey + 1);
    syncAnimationBaseFromStorage();
    const intervalId = window.setInterval(syncAnimationBaseFromStorage, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isControlledChat, syncAnimationBaseFromStorage]);

  useEffect(() => {
    if (!isControlledChat) {
      persistAnimationName(animationState.currentAnimation);
    }
  }, [animationState.currentAnimation, isControlledChat]);

  useEffect(() => {
    return () => {
      clearRolloutInterval();
    };
  }, []);

  async function sendHomeMessage() {
    const content = inputValue.trim();
    const imageFile = attachedImageFile;
    if ((!content && !imageFile) || isSending) {
      return;
    }

    setInputValue('');
    setIsSending(true);

    try {
      const processedImage = imageFile
        ? await processImageForUpload(imageFile)
        : null;
      const context = buildChatContextFromStorage();
      const userHistory = appendMessageToHistory(
        createMessage(
          'user',
          content,
          processedImage ? { thumbnail: processedImage.thumbnail } : {},
        ),
      );

      setHomeMessages(homeVisibleMessages(userHistory));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: content,
          image: processedImage
            ? {
                data: dataUrlToBase64(processedImage.fullImage),
                media_type: processedImage.mediaType,
              }
            : null,
          context,
          is_onboarding: false,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? 'chat request failed');
      }

      const visibleReply = stripActionEnvelopes(body.reply);
      const actions = parseActions(body.reply);
      const dateString = todayString();
      const beforeDailyLog = getDailyLog(dateString);
      const beforeProfile = getUserProfile();
      applyActions(actions);
      applyActionsVitalEffects(actions, {
        dateString,
        beforeDailyLog,
        userProfile: beforeProfile,
      });
      setVitalBarsRefreshKey((currentKey) => currentKey + 1);
      const reactiveAnimations = actionsToReactiveAnimations({
        actions,
        userProfile: getUserProfile() ?? beforeProfile,
        beforeDailyLog,
        afterDailyLog: getDailyLog(dateString),
      });

      if (reactiveAnimations.length > 0) {
        setAnimationState((currentState) =>
          enqueueReactiveAnimations(
            syncBaseAnimation(currentState, readAnimationInputs()),
            reactiveAnimations,
          ),
        );
      }

      if (visibleReply) {
        const assistantMessage = createMessage('assistant', visibleReply);
        const assistantHistory = appendMessageToHistory(
          assistantMessage,
        );
        setHomeMessages(homeVisibleMessages(assistantHistory));
        await startReplyRollout(assistantMessage.id ?? assistantMessage.timestamp, visibleReply);
      }

      if (processedImage) {
        setAttachedImageFile(null);
        setAttachmentClearSignal((currentSignal) => currentSignal + 1);
      }
    } catch (error) {
      console.error('Home chat request failed', error);
      clearRolloutInterval();
      setRollingMessageId(null);
      setRevealedLength(0);
      const errorHistory = appendMessageToHistory(
        createMessage('assistant', 'something glitched. try again?'),
      );
      setHomeMessages(homeVisibleMessages(errorHistory));
    } finally {
      setIsSending(false);
    }
  }

  const resolvedMessages = isControlledChat ? messages : homeMessages;
  const resolvedLcdProps: LcdPropsShape = isControlledChat
    ? lcdProps ?? {}
    : {
        ...lcdProps,
        animationName: animationState.currentAnimation,
        animationPlaybackId: animationState.playbackId,
        animationLoop: !animationState.isPlayingOneShot,
        onAnimationComplete: handleAnimationComplete,
      };
  const resolvedChatBarProps: ChatBarPropsShape = isControlledChat
    ? chatBarProps ?? {}
    : {
        value: inputValue,
        onChange: setInputValue,
        onSubmit: sendHomeMessage,
        onAttachmentChange: setAttachedImageFile,
        attachmentClearSignal,
        disabled: isSending,
        isSending,
      };

  return (
    <main className="home-page">
      <section className="bubby-app theme-rainbow" aria-label={ariaLabel}>
        <header className="app-header" aria-label="app header">
          <button className="header-icon-button" type="button" disabled>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            >
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </svg>
            <span className="sr-only">menu</span>
          </button>
          <h1>bubby</h1>
          <button className="header-icon-button" type="button" disabled>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3" />
              <path d="M12 19v3" />
              <path d="m4.93 4.93 2.12 2.12" />
              <path d="m16.95 16.95 2.12 2.12" />
              <path d="M2 12h3" />
              <path d="M19 12h3" />
              <path d="m4.93 19.07 2.12-2.12" />
              <path d="m16.95 7.05 2.12-2.12" />
            </svg>
            <span className="sr-only">settings</span>
          </button>
        </header>

        <section className="bubby-case" aria-label="bubby case">
          <div className={`case-content${isControlledChat ? '' : ' case-content-with-vitals'}`}>
            <LCD {...resolvedLcdProps} />
            {isControlledChat ? null : <VitalBars refreshKey={vitalBarsRefreshKey} />}
            <ChatMessages
              messages={resolvedMessages}
              rollingMessageId={rollingMessageId}
              revealedLength={revealedLength}
            />
            <ChatBar {...resolvedChatBarProps} />
          </div>
        </section>
        {children}
      </section>
    </main>
  );
}

export default HomeScreen;
