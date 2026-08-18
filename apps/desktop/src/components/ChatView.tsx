import { useEffect, useRef } from "react";
import {
  HardDrive,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  LOCAL_DEFAULT_MODEL,
  LOCAL_MODELS,
  MODE_CONFIGS,
  resolveLocalModel,
  type Conversation,
  type ModelRoute,
} from "@cloudeai/shared";

interface ChatAttachment {
  id: string;
  name: string;
  kind?: "text" | "image" | "pdf" | "binary";
}

interface ChatViewProps {
  conversation: Conversation;
  cloudRemaining: number | null;
  draft: string;
  attachments: ChatAttachment[];
  isListening: boolean;
  isSending: boolean;
  voiceError: string | null;
  voiceSupported: boolean;
  onDraftChange: (value: string) => void;
  onAttach: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  onRouteChange: (route: ModelRoute) => void;
  onLocalModelChange: (modelId: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onSpeak: (text: string) => void;
  onStartListening: () => void;
  onStopListening: () => void;
}

export function ChatView({
  conversation,
  cloudRemaining,
  draft,
  attachments,
  isListening,
  isSending,
  voiceError,
  voiceSupported,
  onDraftChange,
  onAttach,
  onRemoveAttachment,
  onRouteChange,
  onLocalModelChange,
  onSend,
  onCancel,
  onSpeak,
  onStartListening,
  onStopListening,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const config = MODE_CONFIGS[conversation.mode] ?? MODE_CONFIGS.code;
  const localModel = resolveLocalModel(conversation.localModelId);
  const isLocal = conversation.modelRoute === "local";

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [conversation.messages, isSending]);

  return (
    <section className="chat-panel" aria-label="Chat">
      <header className="chat-toolbar">
        <div className="route-switcher" aria-label="Model">
          <button
            type="button"
            className={!isLocal ? "is-active" : ""}
            onClick={() => onRouteChange("cloud")}
            aria-pressed={!isLocal}
          >
            <Sparkles size={18} aria-hidden="true" />
            <span>
              <strong>Gemini</strong>
              <small>3.7 Flash</small>
            </span>
          </button>
          <button
            type="button"
            className={isLocal ? "is-active" : ""}
            onClick={() => onRouteChange("local")}
            aria-pressed={isLocal}
          >
            <HardDrive size={18} aria-hidden="true" />
            <span>
              <strong>Liquid</strong>
              <small>{isLocal ? localModel.label : LOCAL_DEFAULT_MODEL.label}</small>
            </span>
          </button>
          {isLocal ? (
            <label className="model-select">
              <span className="sr-only">Liquid model</span>
              <select
                value={localModel.id}
                onChange={(event) => onLocalModelChange(event.currentTarget.value)}
                aria-label="Liquid model"
              >
                {LOCAL_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className={`route-status route-${conversation.modelRoute}`}>
          <span aria-hidden="true" />
          {isLocal
            ? "Stays on this Mac"
            : cloudRemaining === null
              ? "Gemini · TLS"
              : `${cloudRemaining} Gemini requests left today`}
        </div>
      </header>

      <div className="messages" ref={scrollRef}>
        {conversation.messages.length === 0 ? (
          <div className="empty-chat">
            <span className={`empty-icon mode-${config.accent}`} aria-hidden="true">
              <Sparkles size={27} />
            </span>
            <span className="eyebrow">{config.eyebrow} mode</span>
            <h2>What would you like to accomplish?</h2>
            <p>{config.description}</p>
            <div className="starter-grid">
              {config.starterPrompts.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => onDraftChange(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="message-list" aria-live="polite">
            {conversation.messages.map((message) => (
              <article
                className={`message message-${message.role}`}
                key={message.id}
              >
                <div className="message-meta">
                  <strong>{message.role === "user" ? "You" : "CloudEAI"}</strong>
                  <span>
                    {message.role === "assistant"
                      ? message.modelLabel ??
                        (message.modelRoute === "local"
                          ? resolveLocalModel(conversation.localModelId).label
                          : "Gemini 3.7 Flash")
                      : config.label}
                  </span>
                  {message.role === "assistant" ? (
                    <button
                      type="button"
                      className="speak-message"
                      onClick={() => onSpeak(message.content)}
                      aria-label="Read this response aloud"
                    >
                      <Volume2 size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <div className="message-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ children, ...props }) => (
                        <a {...props} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </article>
            ))}
            {isSending ? (
              <div className="thinking" role="status">
                <span />
                <span />
                <span />
                CloudEAI is working
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        {voiceError ? <p className="voice-error">{voiceError}</p> : null}
        <div className={`composer${isListening ? " is-listening" : ""}`}>
          {attachments.length > 0 ? (
            <ul className="attachment-list" aria-label="Attached files">
              {attachments.map((file) => (
                <li key={file.id}>
                  <span>
                    {file.kind === "image"
                      ? "Image · "
                      : file.kind === "pdf"
                        ? "PDF · "
                        : ""}
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(file.id)}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!isSending && (draft.trim() || attachments.length > 0))
                  onSend();
              }
            }}
            rows={2}
            placeholder={config.placeholder}
            aria-label="Message CloudEAI"
          />
          <div className="composer-actions">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/*,.pdf,.txt,.md,.json,.csv,.xml,.html,.css,.rs,.ts,.tsx,.js,.jsx,.py,.swift,.kt,.java,.go,.c,.h,.cpp,.hpp,.toml,.yml,.yaml,.sql,.sh,.rb,.php,.log"
              onChange={(event) => {
                onAttach(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              className="voice-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              aria-label="Attach files"
              title="Attach images, PDFs, or text/code files"
            >
              <Paperclip size={21} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="voice-button"
              onClick={isListening ? onStopListening : onStartListening}
              disabled={!voiceSupported}
              aria-pressed={isListening}
              aria-label={isListening ? "Stop voice input" : "Start voice input"}
              title={
                voiceSupported
                  ? "Voice input"
                  : "Voice input is unavailable in this environment"
              }
            >
              {isListening ? (
                <MicOff size={21} aria-hidden="true" />
              ) : (
                <Mic size={21} aria-hidden="true" />
              )}
            </button>
            <span className="composer-hint">
              {isSending
                ? "Working…"
                : isListening
                  ? "Listening…"
                  : "Attach images, PDFs, or code. Shift + Enter for a new line"}
            </span>
            {isSending ? (
              <button
                type="button"
                className="send-button is-stop"
                onClick={onCancel}
                aria-label="Stop current request"
              >
                <Square size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="send-button"
                onClick={onSend}
                disabled={!draft.trim() && attachments.length === 0}
                aria-label="Send message"
              >
                <Send size={20} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <p className="privacy-caption">
          {isLocal
            ? `${localModel.label} stays on this Mac after a one-time download.`
            : "Gemini prompts go through CloudEAI’s proxy, then are discarded. History stays encrypted on this Mac."}
        </p>
      </div>
    </section>
  );
}
