import { useEffect, useRef } from "react";
import {
  Cloud,
  HardDrive,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MODE_CONFIGS,
  type Conversation,
  type ModelRoute,
} from "@cloudeai/shared";

interface ChatViewProps {
  conversation: Conversation;
  cloudRemaining: number | null;
  draft: string;
  isListening: boolean;
  isSending: boolean;
  voiceError: string | null;
  voiceSupported: boolean;
  onDraftChange: (value: string) => void;
  onRouteChange: (route: ModelRoute) => void;
  onSend: () => void;
  onSpeak: (text: string) => void;
  onStartListening: () => void;
  onStopListening: () => void;
}

export function ChatView({
  conversation,
  cloudRemaining,
  draft,
  isListening,
  isSending,
  voiceError,
  voiceSupported,
  onDraftChange,
  onRouteChange,
  onSend,
  onSpeak,
  onStartListening,
  onStopListening,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const config = MODE_CONFIGS[conversation.mode];

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [conversation.messages, isSending]);

  return (
    <section className="chat-panel" aria-label="Chat">
      <header className="chat-toolbar">
        <div className="route-switcher" aria-label="Model route">
          <button
            type="button"
            className={conversation.modelRoute === "local" ? "is-active" : ""}
            onClick={() => onRouteChange("local")}
            aria-pressed={conversation.modelRoute === "local"}
          >
            <HardDrive size={18} aria-hidden="true" />
            <span>
              <strong>Private</strong>
              <small>Gemma 4 · Offline</small>
            </span>
          </button>
          <button
            type="button"
            className={conversation.modelRoute === "cloud" ? "is-active" : ""}
            onClick={() => onRouteChange("cloud")}
            aria-pressed={conversation.modelRoute === "cloud"}
          >
            <Cloud size={18} aria-hidden="true" />
            <span>
              <strong>Cloud</strong>
              <small>Gemini 3.7 Flash</small>
            </span>
          </button>
        </div>
        <div className={`route-status route-${conversation.modelRoute}`}>
          <span aria-hidden="true" />
          {conversation.modelRoute === "local"
            ? "Stays on this Mac"
            : cloudRemaining === null
              ? "Google processing · TLS"
              : `${cloudRemaining} cloud requests left today`}
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
                          ? "Gemma 4 E4B"
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
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            rows={2}
            placeholder={config.placeholder}
            aria-label="Message CloudEAI"
          />
          <div className="composer-actions">
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
              {isListening ? "Listening…" : "Shift + Enter for a new line"}
            </span>
            <button
              type="button"
              className="send-button"
              onClick={onSend}
              disabled={!draft.trim() || isSending}
              aria-label="Send message"
            >
              <Send size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="privacy-caption">
          {conversation.modelRoute === "local"
            ? "Local mode works offline after the one-time model download."
            : "Cloud prompts are processed by CloudEAI’s proxy and Google, then discarded."}
        </p>
      </div>
    </section>
  );
}
