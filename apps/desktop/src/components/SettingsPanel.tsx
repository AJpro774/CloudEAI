import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  HardDrive,
  KeyRound,
  Play,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { LOCAL_MODELS, type UserPreferences } from "@cloudeai/shared";
import type {
  ModelDownloadProgress,
  ModelStatus,
} from "../lib/api";

interface SettingsPanelProps {
  downloadProgress: ModelDownloadProgress | null;
  downloadingId: string | null;
  isStarting: boolean;
  modelStatuses: Record<string, ModelStatus>;
  preferences: UserPreferences;
  recoveryCode: string | null;
  syncEnabled: boolean;
  syncStatus: string | null;
  onClose: () => void;
  onCreateSync: () => void;
  onDownloadModel: (modelId: string) => void;
  onPreferencesChange: (preferences: UserPreferences) => void;
  onRestore: (recoveryCode: string) => void;
  onShowRecovery: () => void;
  onStartModel: (modelId: string) => void;
  onSyncNow: () => void;
}

function formatBytes(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "unit",
    unit: "gigabyte",
    maximumFractionDigits: 1,
  }).format(value / 1_000_000_000);
}

export function SettingsPanel({
  downloadProgress,
  downloadingId,
  isStarting,
  modelStatuses,
  preferences,
  recoveryCode,
  syncEnabled,
  syncStatus,
  onClose,
  onCreateSync,
  onDownloadModel,
  onPreferencesChange,
  onRestore,
  onShowRecovery,
  onStartModel,
  onSyncNow,
}: SettingsPanelProps) {
  const [restoreCode, setRestoreCode] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const update = <Key extends keyof UserPreferences,>(
    key: Key,
    value: UserPreferences[Key],
  ) => onPreferencesChange({ ...preferences, [key]: value });

  useEffect(() => {
    closeButtonRef.current?.focus();
    const panel = panelRef.current;
    if (!panel) return;

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", trapFocus);
    return () => panel.removeEventListener("keydown", trapFocus);
  }, []);

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        ref={panelRef}
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-heading"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">CloudEAI preferences</span>
            <h2 id="settings-heading">Settings & privacy</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>

        <div className="settings-scroll">
          <section className="settings-section" aria-labelledby="personal-heading">
            <div className="settings-title">
              <h3 id="personal-heading">Personalized answers</h3>
              <p>These preferences stay inside your encrypted history.</p>
            </div>
            <label>
              <span>Preferred name</span>
              <input
                value={preferences.displayName}
                onChange={(event) => update("displayName", event.currentTarget.value)}
                placeholder="Optional"
              />
            </label>
            <div className="settings-row">
              <label>
                <span>Experience level</span>
                <select
                  value={preferences.expertise}
                  onChange={(event) =>
                    update(
                      "expertise",
                      event.currentTarget.value as UserPreferences["expertise"],
                    )
                  }
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
              <label>
                <span>Answer length</span>
                <select
                  value={preferences.answerLength}
                  onChange={(event) =>
                    update(
                      "answerLength",
                      event.currentTarget.value as UserPreferences["answerLength"],
                    )
                  }
                >
                  <option value="concise">Concise</option>
                  <option value="balanced">Balanced</option>
                  <option value="detailed">Detailed</option>
                </select>
              </label>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="access-heading">
            <div className="settings-title">
              <h3 id="access-heading">Accessibility</h3>
              <p>Designed for comfortable reading, listening, and keyboard use.</p>
            </div>
            <div className="segmented-setting">
              <span>Text size</span>
              <div>
                {(["standard", "large", "extra-large"] as const).map((size) => (
                  <button
                    type="button"
                    className={preferences.fontScale === size ? "is-active" : ""}
                    onClick={() => update("fontScale", size)}
                    aria-pressed={preferences.fontScale === size}
                    key={size}
                  >
                    {size === "extra-large"
                      ? "Extra large"
                      : size[0].toUpperCase() + size.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <label className="toggle-row">
              <span>
                <strong>High contrast</strong>
                <small>Stronger borders and text separation</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.highContrast}
                onChange={(event) => update("highContrast", event.currentTarget.checked)}
              />
            </label>
            <label className="toggle-row">
              <span>
                <strong>Reduce motion</strong>
                <small>Minimize transitions and animated scrolling</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.reduceMotion}
                onChange={(event) => update("reduceMotion", event.currentTarget.checked)}
              />
            </label>
            <label className="toggle-row">
              <span>
                <strong>Read new responses aloud</strong>
                <small>Uses the selected macOS system voice</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.speakResponses}
                onChange={(event) =>
                  update("speakResponses", event.currentTarget.checked)
                }
              />
            </label>
          </section>

          <section className="settings-section" aria-labelledby="model-heading">
            <div className="settings-title">
              <h3 id="model-heading">Gemini + Liquid</h3>
              <p>
                Gemini is the free cloud model. Liquid LFM models download once
                and run privately on this Mac.
              </p>
            </div>
            {LOCAL_MODELS.map((model) => {
              const status = modelStatuses[model.id];
              const downloaded = status?.modelDownloaded ?? false;
              const running = status?.runtimeRunning ?? false;
              const extra =
                "mmprojBytes" in model && typeof model.mmprojBytes === "number"
                  ? model.mmprojBytes
                  : 0;
              const expected = model.expectedBytes + extra;
              return (
                <div className="local-model-block" key={model.id}>
                <div className="model-card">
                  <div className="model-card-icon" aria-hidden="true">
                    <HardDrive size={24} />
                  </div>
                  <div>
                    <strong>{model.label}</strong>
                    <span>
                      {downloaded
                        ? `${formatBytes(status?.downloadedBytes ?? expected)} installed`
                        : `${formatBytes(expected)} download`}
                      {model.vision ? " · vision" : model.role === "extract" ? " · extract" : " · chat"}
                    </span>
                  </div>
                  {downloaded ? (
                    <CheckCircle2
                      className="success-icon"
                      size={22}
                      aria-label="Installed"
                    />
                  ) : null}
                </div>
                  <button
                    className="primary-setting-button"
                    type="button"
                    onClick={() =>
                      downloaded ? onStartModel(model.id) : onDownloadModel(model.id)
                    }
                    disabled={Boolean(downloadingId) || isStarting}
                  >
                    {downloaded ? (
                      <Play size={19} aria-hidden="true" />
                    ) : (
                      <Download size={19} aria-hidden="true" />
                    )}
                    {downloadingId === model.id
                      ? "Downloading…"
                      : isStarting && running
                        ? "Starting…"
                        : running
                          ? "Ready"
                          : downloaded
                            ? "Start"
                            : "Download"}
                  </button>
                </div>
              );
            })}
            {downloadingId && downloadProgress ? (
              <div className="download-progress" aria-live="polite">
                <div>
                  <span>Downloading securely</span>
                  <strong>{Math.round(downloadProgress.percent)}%</strong>
                </div>
                <progress max={100} value={downloadProgress.percent} />
                <small>
                  {formatBytes(downloadProgress.downloadedBytes)} of{" "}
                  {formatBytes(downloadProgress.totalBytes)}
                </small>
              </div>
            ) : null}
          </section>

          <section className="settings-section" aria-labelledby="sync-heading">
            <div className="settings-title">
              <h3 id="sync-heading">Optional encrypted sync</h3>
              <p>
                The server receives ciphertext only. Your recovery code is the only
                way to decrypt history on another Mac.
              </p>
            </div>
            <div className="privacy-callout">
              <ShieldCheck size={22} aria-hidden="true" />
              <span>
                <strong>End-to-end encrypted storage</strong>
                <small>CloudEAI cannot read synced conversations.</small>
              </span>
            </div>
            {!syncEnabled ? (
              <button
                className="secondary-setting-button"
                type="button"
                onClick={onCreateSync}
              >
                <KeyRound size={19} aria-hidden="true" />
                Create private sync identity
              </button>
            ) : (
              <div className="sync-actions">
                <button
                  className="secondary-setting-button"
                  type="button"
                  onClick={onSyncNow}
                >
                  <RefreshCw size={18} aria-hidden="true" />
                  Sync encrypted history now
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={onShowRecovery}
                >
                  Show recovery code
                </button>
              </div>
            )}
            {recoveryCode ? (
              <div className="recovery-code">
                <code>{recoveryCode}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(recoveryCode)}
                  aria-label="Copy recovery code"
                >
                  <Copy size={17} aria-hidden="true" />
                </button>
              </div>
            ) : null}
            {syncStatus ? <p className="sync-status">{syncStatus}</p> : null}
            <details className="restore-details">
              <summary>Restore on this Mac</summary>
              <label>
                <span>Recovery code</span>
                <textarea
                  value={restoreCode}
                  onChange={(event) => setRestoreCode(event.currentTarget.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder="cloudeai-v1.…"
                />
              </label>
              <button
                className="secondary-setting-button"
                type="button"
                disabled={!restoreCode.trim()}
                onClick={() => onRestore(restoreCode.trim())}
              >
                Restore encrypted history
              </button>
            </details>
          </section>

          <section className="settings-section compact" aria-labelledby="limits-heading">
            <div className="settings-title">
              <h3 id="limits-heading">Cloud limits</h3>
              <p>
                Gemini is capped at {preferences.cloudDailyLimit} requests per day
                and 4 requests per minute. Local Liquid models have no usage cap.
              </p>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
