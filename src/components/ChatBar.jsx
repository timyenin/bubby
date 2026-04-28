import { useEffect, useRef, useState } from 'react';

function ChatBar({
  value = '',
  onChange,
  onSubmit,
  onAttachmentChange,
  attachmentClearSignal,
  disabled = true,
  isSending = false,
  placeholder = 'Type a message...',
}) {
  const fileInputRef = useRef(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const canAttach = !disabled && !isSending && Boolean(onAttachmentChange);
  const hasAttachment = Boolean(attachmentPreview);
  const canSend = !disabled && !isSending && (value.trim().length > 0 || hasAttachment);

  useEffect(() => {
    if (attachmentClearSignal === undefined) {
      return;
    }

    setAttachmentPreview((currentPreview) => {
      if (currentPreview?.url) {
        URL.revokeObjectURL(currentPreview.url);
      }
      return null;
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [attachmentClearSignal]);

  useEffect(() => () => {
    if (attachmentPreview?.url) {
      URL.revokeObjectURL(attachmentPreview.url);
    }
  }, [attachmentPreview]);

  function handleSubmit(event) {
    event.preventDefault();

    if (canSend) {
      onSubmit?.();
    }
  }

  function clearAttachment() {
    setAttachmentPreview((currentPreview) => {
      if (currentPreview?.url) {
        URL.revokeObjectURL(currentPreview.url);
      }
      return null;
    });
    onAttachmentChange?.(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleAttachmentChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setAttachmentPreview((currentPreview) => {
      if (currentPreview?.url) {
        URL.revokeObjectURL(currentPreview.url);
      }

      return {
        url: URL.createObjectURL(file),
        name: file.name || 'selected image',
      };
    });
    onAttachmentChange?.(file);
  }

  return (
    <form
      className={`chat-bar${disabled ? '' : ' chat-bar-active'}`}
      aria-label="message composer"
      onSubmit={handleSubmit}
    >
      <button
        className="chat-icon-button add-button"
        type="button"
        disabled={!canAttach}
        tabIndex={disabled ? -1 : 0}
        onClick={() => fileInputRef.current?.click()}
      >
        <span aria-hidden="true">+</span>
        <span className="sr-only">add image</span>
      </button>
      <input
        ref={fileInputRef}
        className="chat-file-input"
        type="file"
        accept="image/*"
        capture="environment"
        disabled={!canAttach}
        tabIndex={-1}
        onChange={handleAttachmentChange}
      />

      <div className={`chat-input-shell${hasAttachment ? ' chat-input-shell-with-preview' : ''}`}>
        {attachmentPreview ? (
          <div className="chat-attachment-preview">
            <img src={attachmentPreview.url} alt="" />
            <button type="button" onClick={clearAttachment}>
              <span aria-hidden="true">x</span>
              <span className="sr-only">remove image</span>
            </button>
          </div>
        ) : null}
        <input
          className="chat-input"
          type="text"
          placeholder={placeholder}
          disabled={disabled}
          readOnly={disabled}
          tabIndex={disabled ? -1 : 0}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      </div>

      <button
        className={`chat-icon-button send-button${canSend ? ' send-button-active' : ''}`}
        type="submit"
        disabled={!canSend}
        tabIndex={disabled ? -1 : 0}
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
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
        <span className="sr-only">send message</span>
      </button>
    </form>
  );
}

export default ChatBar;
