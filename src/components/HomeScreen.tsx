import {
  type CSSProperties,
  type FormEvent,
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
  canTriggerIdleSpin,
  createAnimationState,
  enqueueReactiveAnimations,
  finishCurrentAnimation,
  IDLE_SPIN_INTERVAL_MS,
  maybeTriggerIdleSpin,
  syncBaseAnimation,
  triggerTapReaction,
  type AnimationName,
  type AnimationState,
} from '../lib/animationState.ts';
import {
  getBubbyColorOption,
  getNextBubbyColorId,
} from '../lib/bubbyColors.ts';
import { buildChatContextFromStorage } from '../lib/chatContext.ts';
import { todayString } from '../lib/dates.ts';
import {
  DIALOGUE_CHARACTER_DELAY_MS,
  getDialogueRolloutDelay,
} from '../lib/dialogueRollout.ts';
import { processImageForUpload } from '../lib/imageProcessing.ts';
import {
  getActiveMusicOption,
  MUSIC_OPTIONS,
  setActiveMusicOption,
  type MusicOption,
  volumeForMusicOption,
} from '../lib/music.ts';
import { ONBOARDING_HOME_CLOSING_LINE } from '../lib/onboarding.ts';
import {
  getLatestAssistantMessage,
  submitReport,
} from '../lib/report.ts';
import {
  appendMessageToHistory,
  clearAll,
  getBubbyColorId,
  getBubbyState,
  getConversationHistory,
  getDailyLog,
  getUserProfile,
  setBubbyColorId,
  setBubbyState,
  type ChatMessage,
  type ConversationHistory,
} from '../lib/storage.ts';
import {
  getActiveTheme,
  setActiveTheme as saveActiveTheme,
  THEMES,
  type CaseTheme,
} from '../lib/themes.ts';
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
  bubbyFillColor?: string | null;
  musicNotesActive?: boolean;
}

interface ChatBarPropsShape {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onAttachmentChange?: (files: File[]) => void;
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
  rollingMessageId?: string | null;
  revealedLength?: number;
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

type ThemeStyle = CSSProperties & Record<`--${string}`, string>;

function themeBackgroundImage(theme: CaseTheme): string {
  return theme.backgroundImage === 'none'
    ? 'none'
    : `url(${JSON.stringify(theme.backgroundImage)})`;
}

function themeStyle(theme: CaseTheme): ThemeStyle {
  return {
    '--case-bezel': theme.bezelColor,
    '--case-bezel-light': theme.bezelLight,
    '--case-bezel-dark': theme.bezelDark,
    '--case-ink': theme.caseInk,
    '--case-bg-image': themeBackgroundImage(theme),
    ...theme.variables,
  };
}

function HomeScreen({
  messages,
  initialMessages,
  chatBarProps,
  lcdProps,
  children,
  ariaLabel = 'bubby home screen',
  rollingMessageId: controlledRollingMessageId = null,
  revealedLength: controlledRevealedLength = 0,
}: HomeScreenProps) {
  const isControlledChat = Boolean(chatBarProps);
  const [homeMessages, setHomeMessages] = useState<DisplayMessage[]>(() =>
    homeVisibleMessages(initialMessages),
  );
  const [inputValue, setInputValue] = useState('');
  const [attachedImageFiles, setAttachedImageFiles] = useState<File[]>([]);
  const [attachmentClearSignal, setAttachmentClearSignal] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [homeRollingMessageId, setHomeRollingMessageId] = useState<string | null>(null);
  const [homeRevealedLength, setHomeRevealedLength] = useState(0);
  const [animationState, setAnimationState] = useState<AnimationState>(buildInitialAnimationState);
  const [vitalBarsRefreshKey, setVitalBarsRefreshKey] = useState(0);
  const [activeTheme, setActiveThemeState] = useState<CaseTheme>(() => getActiveTheme());
  const [activeBubbyColorId, setActiveBubbyColorId] = useState(() =>
    getBubbyColorOption(getBubbyColorId()).id,
  );
  const [activeMusicOption, setActiveMusicOptionState] = useState<MusicOption>(() =>
    getActiveMusicOption(),
  );
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [isReportSubmitting, setIsReportSubmitting] = useState(false);
  const rolloutIntervalRef = useRef<number | null>(null);
  const idleSpinTimeoutRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicRequestIdRef = useRef(0);
  const themeButtonRef = useRef<HTMLButtonElement | null>(null);
  const themePickerRef = useRef<HTMLDivElement | null>(null);

  function clearRolloutInterval() {
    if (rolloutIntervalRef.current !== null) {
      window.clearInterval(rolloutIntervalRef.current);
      rolloutIntervalRef.current = null;
    }
  }

  function clearIdleSpinTimeout() {
    if (idleSpinTimeoutRef.current !== null) {
      window.clearTimeout(idleSpinTimeoutRef.current);
      idleSpinTimeoutRef.current = null;
    }
  }

  function stopMusicPlayback() {
    musicRequestIdRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsMusicPlaying(false);
  }

  async function startMusicPlayback(option: MusicOption) {
    if (!option.src) {
      stopMusicPlayback();
      return;
    }

    const requestId = musicRequestIdRef.current + 1;
    musicRequestIdRef.current = requestId;
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.pause();
    audio.src = option.src;
    audio.loop = true;
    audio.volume = volumeForMusicOption(option);
    audio.currentTime = 0;

    try {
      await audio.play();
      if (musicRequestIdRef.current === requestId) {
        setIsMusicPlaying(true);
      }
    } catch (error) {
      if (musicRequestIdRef.current === requestId) {
        setIsMusicPlaying(false);
      }
      console.warn('Bubby music playback was blocked', error);
    }
  }

  function musicOptionAriaLabel(option: MusicOption): string {
    return option.id === 'mute'
      ? 'mute music'
      : 'play classic bubby 8-bit music';
  }

  function startReplyRollout(messageId: string, reply: string): Promise<void> {
    clearRolloutInterval();
    setHomeRollingMessageId(messageId);
    setHomeRevealedLength(0);

    if (!reply) {
      setHomeRollingMessageId(null);
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
        setHomeRevealedLength(currentLength);

        if (currentLength >= reply.length) {
          clearRolloutInterval();
          setHomeRollingMessageId(null);
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

  const handleLcdTapReaction = useCallback(() => {
    setAnimationState((currentState) =>
      triggerTapReaction(syncBaseAnimation(currentState, readAnimationInputs())),
    );
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
      clearIdleSpinTimeout();
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isControlledChat || !canTriggerIdleSpin(animationState)) {
      return undefined;
    }

    idleSpinTimeoutRef.current = window.setTimeout(() => {
      idleSpinTimeoutRef.current = null;
      setAnimationState((currentState) =>
        maybeTriggerIdleSpin(
          syncBaseAnimation(currentState, readAnimationInputs()),
          IDLE_SPIN_INTERVAL_MS,
        ),
      );
    }, IDLE_SPIN_INTERVAL_MS);

    return () => {
      clearIdleSpinTimeout();
    };
  }, [
    animationState.baseAnimation,
    animationState.currentAnimation,
    animationState.isPlayingOneShot,
    animationState.queue.length,
    isControlledChat,
  ]);

  useEffect(() => {
    if (!isThemePickerOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        themeButtonRef.current?.contains(target) ||
        themePickerRef.current?.contains(target)
      ) {
        return;
      }

      setIsThemePickerOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isThemePickerOpen]);

  function applyTheme(themeId: string) {
    setActiveThemeState(saveActiveTheme(themeId));
    setIsThemePickerOpen(false);
  }

  function applyMusicOption(musicId: string) {
    const nextMusicOption = setActiveMusicOption(musicId);
    setActiveMusicOptionState(nextMusicOption);

    if (!nextMusicOption.src) {
      stopMusicPlayback();
      return;
    }

    void startMusicPlayback(nextMusicOption);
  }

  function cycleBubbyColor() {
    const nextColorId = getNextBubbyColorId(activeBubbyColorId);
    setBubbyColorId(nextColorId);
    setActiveBubbyColorId(nextColorId);
  }

  async function handleReportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReportStatus(null);
    setIsReportSubmitting(true);

    try {
      await submitReport({
        reason: reportReason,
        lastAssistantMessage: getLatestAssistantMessage(resolvedMessages),
        route: isControlledChat ? 'onboarding' : 'home',
      });
      setReportReason('');
      setReportStatus('reported. thank you.');
    } catch (error) {
      console.error('Bubby report failed', error);
      setReportStatus('report did not send. try again?');
    } finally {
      setIsReportSubmitting(false);
    }
  }

  function handleClearLocalData() {
    if (!window.confirm('clear all local bubby data? this resets onboarding.')) {
      return;
    }

    clearAll();
    window.location.reload();
  }

  async function sendHomeMessage() {
    const content = inputValue.trim();
    const imageFiles = attachedImageFiles.slice(0, 4);
    if ((!content && imageFiles.length === 0) || isSending) {
      return;
    }

    setInputValue('');
    setIsSending(true);

    try {
      const processedImages = await Promise.all(
        imageFiles.map((imageFile) => processImageForUpload(imageFile)),
      );
      const context = buildChatContextFromStorage();
      const userHistory = appendMessageToHistory(
        createMessage(
          'user',
          content,
          processedImages[0]
            ? {
                thumbnail: processedImages[0].thumbnail,
                thumbnails: processedImages.map((processedImage) => processedImage.thumbnail),
                fullImages: processedImages.map((processedImage) => processedImage.fullImage),
              }
            : {},
        ),
      );

      setHomeMessages(homeVisibleMessages(userHistory));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: content,
          image: null,
          images: processedImages.map((processedImage) => ({
            data: dataUrlToBase64(processedImage.fullImage),
            media_type: processedImage.mediaType,
          })),
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

      if (processedImages.length > 0) {
        setAttachedImageFiles([]);
        setAttachmentClearSignal((currentSignal) => currentSignal + 1);
      }
    } catch (error) {
      console.error('Home chat request failed', error);
      clearRolloutInterval();
      setHomeRollingMessageId(null);
      setHomeRevealedLength(0);
      const errorHistory = appendMessageToHistory(
        createMessage('assistant', 'something glitched. try again?'),
      );
      setHomeMessages(homeVisibleMessages(errorHistory));
    } finally {
      setIsSending(false);
    }
  }

  const resolvedMessages = isControlledChat ? messages : homeMessages;
  const resolvedRollingMessageId = isControlledChat
    ? controlledRollingMessageId
    : homeRollingMessageId;
  const resolvedRevealedLength = isControlledChat
    ? controlledRevealedLength
    : homeRevealedLength;
  const activeBubbyColor = getBubbyColorOption(activeBubbyColorId);
  const areMusicNotesActive = activeMusicOption.src !== null && isMusicPlaying;
  const bubbyColorButtonStyle = {
    '--bubby-color-swatch': activeBubbyColor.fillColor ?? 'transparent',
  } as CSSProperties & Record<'--bubby-color-swatch', string>;
  const resolvedLcdProps: LcdPropsShape = isControlledChat
    ? {
        ...lcdProps,
        bubbyFillColor: lcdProps?.bubbyFillColor ?? activeBubbyColor.fillColor,
        musicNotesActive: lcdProps?.musicNotesActive ?? areMusicNotesActive,
      }
    : {
        ...lcdProps,
        bubbyFillColor: lcdProps?.bubbyFillColor ?? activeBubbyColor.fillColor,
        musicNotesActive: lcdProps?.musicNotesActive ?? areMusicNotesActive,
        animationName: animationState.currentAnimation,
        animationPlaybackId: animationState.playbackId,
        animationLoop: !animationState.isPlayingOneShot,
        onAnimationComplete: handleAnimationComplete,
        onActivate: lcdProps?.onActivate ?? handleLcdTapReaction,
      };
  const resolvedChatBarProps: ChatBarPropsShape = isControlledChat
    ? chatBarProps ?? {}
    : {
        value: inputValue,
        onChange: setInputValue,
        onSubmit: sendHomeMessage,
        onAttachmentChange: setAttachedImageFiles,
        attachmentClearSignal,
        disabled: isSending,
        isSending,
      };

  return (
    <main className="home-page" style={themeStyle(activeTheme)}>
      <section
        className={`bubby-app theme-${activeTheme.id}`}
        aria-label={ariaLabel}
        style={themeStyle(activeTheme)}
      >
        <header className="app-header" aria-label="app header">
          <div className="header-menu">
            <button
              ref={themeButtonRef}
              className="header-icon-button"
              type="button"
              aria-expanded={isThemePickerOpen}
              aria-haspopup="menu"
              onClick={() => setIsThemePickerOpen((isOpen) => !isOpen)}
            >
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
              <span className="sr-only">case theme</span>
            </button>
            {isThemePickerOpen ? (
              <div
                ref={themePickerRef}
                className="theme-picker"
                role="menu"
                aria-label="case themes and music"
              >
                <div className="theme-picker-section">
                  <p className="theme-picker-label">theme</p>
                  <div className="theme-swatch-row">
                    {THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        className={`theme-swatch${theme.id === activeTheme.id ? ' theme-swatch-active' : ''}`}
                        type="button"
                        role="menuitemradio"
                        aria-checked={theme.id === activeTheme.id}
                        aria-label={`${theme.name} case theme`}
                        onClick={() => applyTheme(theme.id)}
                        style={{ backgroundColor: theme.bezelColor }}
                      />
                    ))}
                  </div>
                </div>
                <div className="theme-picker-section">
                  <p className="theme-picker-label">music</p>
                  <div className="music-option-row">
                    {MUSIC_OPTIONS.map((musicOption) => (
                      <button
                        key={musicOption.id}
                        className={`music-option-button${musicOption.id === activeMusicOption.id ? ' music-option-button-active' : ''}`}
                        type="button"
                        aria-pressed={musicOption.id === activeMusicOption.id}
                        aria-label={musicOptionAriaLabel(musicOption)}
                        onClick={() => applyMusicOption(musicOption.id)}
                      >
                        {musicOption.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="theme-picker-section">
                  <p className="theme-picker-label">info</p>
                  <button
                    className="info-menu-button"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsInfoPanelOpen(true);
                      setIsThemePickerOpen(false);
                    }}
                  >
                    privacy
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <h1>bubby</h1>
          <button
            className="header-icon-button bubby-color-button"
            type="button"
            aria-label={`bubby color: ${activeBubbyColor.name}. tap to change`}
            title={`Bubby color: ${activeBubbyColor.name}`}
            onClick={cycleBubbyColor}
            style={bubbyColorButtonStyle}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <path d="M12 3a9 9 0 0 0 0 18h1.6a1.7 1.7 0 0 0 1.24-2.86 1.7 1.7 0 0 1 1.24-2.86H18a6 6 0 0 0 0-12h-6Z" />
              <circle cx="7.7" cy="10.1" r=".7" fill="currentColor" stroke="none" />
              <circle cx="10.2" cy="7.4" r=".7" fill="currentColor" stroke="none" />
              <circle cx="13.5" cy="7.2" r=".7" fill="currentColor" stroke="none" />
            </svg>
            <span className="bubby-color-swatch" aria-hidden="true" />
            <span className="sr-only">change bubby color</span>
          </button>
        </header>

        <section className="bubby-case" aria-label="bubby case">
          <div className={`case-content${isControlledChat ? '' : ' case-content-with-vitals'}`}>
            {isControlledChat ? null : <VitalBars refreshKey={vitalBarsRefreshKey} />}
            <LCD {...resolvedLcdProps} />
            <ChatMessages
              messages={resolvedMessages}
              rollingMessageId={resolvedRollingMessageId}
              revealedLength={resolvedRevealedLength}
            />
            <ChatBar {...resolvedChatBarProps} />
          </div>
        </section>
        {isInfoPanelOpen ? (
          <div className="info-modal-backdrop" role="dialog" aria-modal="true" aria-label="privacy and report">
            <section className="info-modal-panel">
              <button
                className="info-modal-close"
                type="button"
                aria-label="close privacy panel"
                onClick={() => setIsInfoPanelOpen(false)}
              >
                x
              </button>
              <p className="info-modal-kicker">info</p>
              <h2>privacy + safety</h2>
              <a className="info-link" href="/privacy.html" target="_blank" rel="noreferrer">
                privacy policy
              </a>
              <div className="info-disclaimer">
                <p>Bubby is AI-generated and can be wrong.</p>
                <p>Bubby is not medical advice.</p>
                <p>Bubby is not a doctor, dietitian, therapist, or emergency service.</p>
                <p>
                  Users with medical conditions, eating disorders, pregnancy, diabetes, or
                  clinical nutrition needs should talk to a qualified professional.
                </p>
              </div>
              <form className="info-report-form" onSubmit={handleReportSubmit}>
                <label>
                  <span>what went wrong?</span>
                  <textarea
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                    rows={4}
                    maxLength={2000}
                  />
                </label>
                <button type="submit" disabled={isReportSubmitting}>
                  {isReportSubmitting ? 'sending' : 'report'}
                </button>
                {reportStatus ? <p className="info-report-status">{reportStatus}</p> : null}
              </form>
              <button
                className="info-clear-button"
                type="button"
                onClick={handleClearLocalData}
              >
                clear local data
              </button>
            </section>
          </div>
        ) : null}
        {children}
      </section>
    </main>
  );
}

export default HomeScreen;
