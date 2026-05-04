import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';

import { getRevealedDialogueText } from '../lib/dialogueRollout.ts';

export interface DisplayMessage {
  id?: string;
  role: 'user' | 'bubby' | 'assistant';
  text?: string;
  content?: string;
  timestamp?: string;
  thumbnail?: string;
  thumbnails?: string[];
  fullImages?: string[];
}

interface ChatMessagesProps {
  messages?: DisplayMessage[];
  rollingMessageId?: string | null;
  revealedLength?: number;
}

const placeholderMessages: DisplayMessage[] = [
  {
    id: 'bubby-placeholder',
    role: 'bubby',
    text: "i'm getting settled in here.",
  },
  {
    id: 'user-placeholder',
    role: 'user',
    text: 'looks good, bubby.',
  },
];

const RECENT_TOUCH_OPEN_WINDOW_MS = 700;
const TAP_MOVE_TOLERANCE_PX = 12;

interface RecentTouchOpen {
  key: string;
  timestamp: number;
}

interface ThumbnailTouchStart {
  key: string;
  x: number;
  y: number;
}

function messageRoleClass(role: DisplayMessage['role']): 'user' | 'bubby' {
  return role === 'user' ? 'user' : 'bubby';
}

function messageIdFor(message: DisplayMessage, fallbackKey: string): string {
  return message.id ?? message.timestamp ?? fallbackKey;
}

function imageSourcesFor(message: DisplayMessage): string[] {
  if (message.thumbnails && message.thumbnails.length > 0) {
    return message.thumbnails;
  }

  return message.thumbnail ? [message.thumbnail] : [];
}

function fullImageFor(message: DisplayMessage, thumbnail: string, index: number): string {
  return message.fullImages?.[index] ?? thumbnail;
}

interface ImageLightboxProps {
  imageSrc: string;
  onClose: () => void;
}

function ImageLightbox({ imageSrc, onClose }: ImageLightboxProps) {
  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="image preview"
      onClick={onClose}
    >
      <button className="image-lightbox-close" type="button" onClick={onClose}>
        <span aria-hidden="true">x</span>
        <span className="sr-only">close image preview</span>
      </button>
      <div className="image-lightbox-frame" onClick={(event) => event.stopPropagation()}>
        <img src={imageSrc} alt="" />
      </div>
    </div>
  );
}

function renderImageLightbox(imageSrc: string, onClose: () => void) {
  const lightbox = <ImageLightbox imageSrc={imageSrc} onClose={onClose} />;

  if (typeof document === 'undefined' || !document.body) {
    return lightbox;
  }

  return createPortal(lightbox, document.body);
}

function ChatMessages({
  messages,
  rollingMessageId = null,
  revealedLength = 0,
}: ChatMessagesProps) {
  const messagesRef = useRef<HTMLElement | null>(null);
  const lastTouchOpenRef = useRef<RecentTouchOpen | null>(null);
  const thumbnailTouchStartRef = useRef<ThumbnailTouchStart | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const visibleMessages = messages ?? placeholderMessages;

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      messagesElement.scrollTop = messagesElement.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [visibleMessages, revealedLength]);

  function openLightboxForImage(message: DisplayMessage, thumbnail: string, index: number) {
    setLightboxImage(fullImageFor(message, thumbnail, index));
  }

  function handleThumbnailClick(
    event: MouseEvent<HTMLButtonElement>,
    message: DisplayMessage,
    thumbnail: string,
    index: number,
    imageOpenKey: string,
  ) {
    const lastTouchOpen = lastTouchOpenRef.current;
    if (
      lastTouchOpen &&
      lastTouchOpen.key === imageOpenKey &&
      Date.now() - lastTouchOpen.timestamp < RECENT_TOUCH_OPEN_WINDOW_MS
    ) {
      event.preventDefault();
      return;
    }

    openLightboxForImage(message, thumbnail, index);
  }

  function handleThumbnailTouchStart(
    event: TouchEvent<HTMLButtonElement>,
    imageOpenKey: string,
  ) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (!touch) {
      thumbnailTouchStartRef.current = null;
      return;
    }

    thumbnailTouchStartRef.current = {
      key: imageOpenKey,
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  function handleThumbnailTouchEnd(
    event: TouchEvent<HTMLButtonElement>,
    message: DisplayMessage,
    thumbnail: string,
    index: number,
    imageOpenKey: string,
  ) {
    const touchStart = thumbnailTouchStartRef.current;
    const touch = event.changedTouches[0];
    thumbnailTouchStartRef.current = null;

    if (!touchStart || touchStart.key !== imageOpenKey || !touch) {
      return;
    }

    const movedX = Math.abs(touch.clientX - touchStart.x);
    const movedY = Math.abs(touch.clientY - touchStart.y);
    if (movedX > TAP_MOVE_TOLERANCE_PX || movedY > TAP_MOVE_TOLERANCE_PX) {
      return;
    }

    event.preventDefault();
    lastTouchOpenRef.current = { key: imageOpenKey, timestamp: Date.now() };
    openLightboxForImage(message, thumbnail, index);
  }

  return (
    <section className="messages-zone" aria-label="conversation history" ref={messagesRef}>
      {visibleMessages.map((message, index) => {
        const roleClass = messageRoleClass(message.role);
        const key = message.id ?? `${message.role}-${message.timestamp ?? index}-${index}`;
        const messageId = messageIdFor(message, key);
        const content = message.text ?? message.content ?? '';
        const displayedContent = messageId === rollingMessageId
          ? getRevealedDialogueText(content, revealedLength)
          : content;
        const imageSources = imageSourcesFor(message);

        return (
          <div
            className={`message-row message-row-${roleClass}`}
            key={key}
          >
            <div
              className={`message-bubble message-bubble-${roleClass}${imageSources.length > 0 ? ' message-bubble-has-image' : ''}`}
            >
              {imageSources.length > 0 ? (
                <div className="message-thumbnail-row">
                  {imageSources.map((thumbnail, imageIndex) => {
                    const imageOpenKey = `${messageId}-${imageIndex}`;

                    return (
                      <button
                        className="message-thumbnail-button"
                        key={`${thumbnail}-${imageIndex}`}
                        type="button"
                        aria-label="open image"
                        onClick={(event) => handleThumbnailClick(event, message, thumbnail, imageIndex, imageOpenKey)}
                        onTouchStart={(event) => handleThumbnailTouchStart(event, imageOpenKey)}
                        onTouchEnd={(event) => handleThumbnailTouchEnd(event, message, thumbnail, imageIndex, imageOpenKey)}
                        onTouchCancel={() => {
                          thumbnailTouchStartRef.current = null;
                        }}
                        onContextMenu={(event) => event.preventDefault()}
                      >
                        <img
                          className="message-thumbnail"
                          src={thumbnail}
                          alt=""
                          draggable={false}
                          loading="lazy"
                        />
                        <span className="sr-only">open image</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {displayedContent ? (
                <span>{displayedContent}</span>
              ) : null}
            </div>
          </div>
        );
      })}
      {lightboxImage ? renderImageLightbox(lightboxImage, () => setLightboxImage(null)) : null}
    </section>
  );
}

export default ChatMessages;
