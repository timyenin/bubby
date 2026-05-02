import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

const MAX_ATTACHMENTS = 4;

interface AttachmentPreview {
  url: string;
  name: string;
  file: File;
}

interface ChatBarProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onAttachmentChange?: (files: File[]) => void;
  attachmentClearSignal?: number;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
}

function ChatBar({
  value = '',
  onChange,
  onSubmit,
  onAttachmentChange,
  attachmentClearSignal,
  disabled = true,
  isSending = false,
  placeholder = 'Type a message...',
}: ChatBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentPreviews, setAttachmentPreviews] = useState<AttachmentPreview[]>([]);
  const canAttach = !disabled && !isSending && Boolean(onAttachmentChange);
  const hasAttachment = attachmentPreviews.length > 0;
  const canSend = !disabled && !isSending && (value.trim().length > 0 || hasAttachment);

  function revokePreviews(previews: AttachmentPreview[]) {
    previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }

  useEffect(() => {
    if (attachmentClearSignal === undefined) {
      return;
    }

    setAttachmentPreviews((currentPreviews) => {
      revokePreviews(currentPreviews);
      return [];
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [attachmentClearSignal]);

  useEffect(
    () => () => {
      revokePreviews(attachmentPreviews);
    },
    [attachmentPreviews],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (canSend) {
      onSubmit?.();
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();

    if (canSend) {
      onSubmit?.();
    }
  }

  function updateAttachmentPreviews(files: File[]) {
    setAttachmentPreviews((currentPreviews) => {
      revokePreviews(currentPreviews);

      return files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        name: file.name || 'selected image',
      }));
    });
    onAttachmentChange?.(files);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function removeAttachment(indexToRemove: number) {
    const nextFiles = attachmentPreviews
      .filter((_, index) => index !== indexToRemove)
      .map((preview) => preview.file);
    updateAttachmentPreviews(nextFiles);
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_ATTACHMENTS);
    if (files.length === 0) {
      return;
    }

    updateAttachmentPreviews(files);
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
        multiple
        disabled={!canAttach}
        tabIndex={-1}
        onChange={handleAttachmentChange}
      />

      <div className={`chat-input-shell${hasAttachment ? ' chat-input-shell-with-preview' : ''}`}>
        {hasAttachment ? (
          <div className="chat-attachment-preview-row">
            {attachmentPreviews.map((preview, index) => (
              <div className="chat-attachment-preview" key={`${preview.name}-${preview.url}`}>
                <img src={preview.url} alt="" />
                <button type="button" onClick={() => removeAttachment(index)}>
                  <span aria-hidden="true">x</span>
                  <span className="sr-only">remove image</span>
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          className="chat-input"
          rows={1}
          wrap="off"
          placeholder={placeholder}
          disabled={disabled}
          readOnly={disabled}
          tabIndex={disabled ? -1 : 0}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={handleInputKeyDown}
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
