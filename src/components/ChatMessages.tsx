import { useEffect, useRef, useState } from 'react';

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

function ChatMessages({
  messages,
  rollingMessageId = null,
  revealedLength = 0,
}: ChatMessagesProps) {
  const messagesRef = useRef<HTMLElement | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const visibleMessages = messages ?? placeholderMessages;

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [visibleMessages, revealedLength]);

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
                  {imageSources.map((thumbnail, imageIndex) => (
                    <button
                      className="message-thumbnail-button"
                      key={`${thumbnail}-${imageIndex}`}
                      type="button"
                      onClick={() => setLightboxImage(fullImageFor(message, thumbnail, imageIndex))}
                    >
                      <img
                        className="message-thumbnail"
                        src={thumbnail}
                        alt=""
                        loading="lazy"
                      />
                      <span className="sr-only">open image</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {displayedContent ? (
                <span>{displayedContent}</span>
              ) : null}
            </div>
          </div>
        );
      })}
      {lightboxImage ? (
        <ImageLightbox imageSrc={lightboxImage} onClose={() => setLightboxImage(null)} />
      ) : null}
    </section>
  );
}

export default ChatMessages;
