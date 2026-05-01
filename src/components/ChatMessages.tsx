import { useEffect, useRef } from 'react';

import { getRevealedDialogueText } from '../lib/dialogueRollout.ts';

export interface DisplayMessage {
  id?: string;
  role: 'user' | 'bubby' | 'assistant';
  text?: string;
  content?: string;
  timestamp?: string;
  thumbnail?: string;
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

function ChatMessages({
  messages,
  rollingMessageId = null,
  revealedLength = 0,
}: ChatMessagesProps) {
  const messagesRef = useRef<HTMLElement | null>(null);
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

        return (
          <div
            className={`message-row message-row-${roleClass}`}
            key={key}
          >
            <div
              className={`message-bubble message-bubble-${roleClass}${message.thumbnail ? ' message-bubble-has-image' : ''}`}
            >
              {message.thumbnail ? (
                <img
                  className="message-thumbnail"
                  src={message.thumbnail}
                  alt=""
                  loading="lazy"
                />
              ) : null}
              {displayedContent ? (
                <span>{displayedContent}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default ChatMessages;
