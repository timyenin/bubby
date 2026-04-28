import { useEffect, useRef } from 'react';

const placeholderMessages = [
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

function messageRoleClass(role) {
  return role === 'user' ? 'user' : 'bubby';
}

function ChatMessages({ messages }) {
  const messagesRef = useRef(null);
  const visibleMessages = messages ?? placeholderMessages;

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [visibleMessages]);

  return (
    <section className="messages-zone" aria-label="conversation history" ref={messagesRef}>
      {visibleMessages.map((message, index) => {
        const roleClass = messageRoleClass(message.role);
        const key = message.id ?? `${message.role}-${message.timestamp ?? index}-${index}`;

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
              {message.text ?? message.content ? (
                <span>{message.text ?? message.content}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default ChatMessages;
