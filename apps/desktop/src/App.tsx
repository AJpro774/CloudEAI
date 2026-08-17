import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  buildSystemPrompt,
  DEFAULT_PREFERENCES,
  GEMINI_MODEL,
  LOCAL_MODEL,
  MODE_CONFIGS,
  type AppData,
  type ChatMessage,
  type Conversation,
  type MasterMode,
  type ModelMessage,
  type ModelRoute,
  type UserPreferences,
} from "@cloudeai/shared";
import { AlertCircle, Menu } from "lucide-react";
import { ChatView } from "./components/ChatView";
import { ModeSelector } from "./components/ModeSelector";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/Sidebar";
import { useVoice } from "./hooks/useVoice";
import {
  createSyncAccount,
  downloadLocalModel,
  exportRecoveryKey,
  getModelStatus,
  importRecoveryKey,
  isDesktopRuntime,
  loadAppData,
  localChat,
  pullEncryptedHistory,
  pushEncryptedHistory,
  readEncryptedEnvelope,
  replaceEncryptedEnvelope,
  saveAppData,
  startLocalModel,
  streamCloudChat,
  type ModelDownloadProgress,
  type ModelStatus,
} from "./lib/api";
import "./App.css";

const now = () => new Date().toISOString();

function createConversation(
  mode: MasterMode = "code",
  modelRoute: ModelRoute = "local",
): Conversation {
  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    mode,
    modelRoute,
    messages: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createInitialData(): AppData {
  const conversation = createConversation();
  return {
    version: 1,
    deviceId: crypto.randomUUID(),
    conversations: [conversation],
    preferences: DEFAULT_PREFERENCES,
    activeConversationId: conversation.id,
    updatedAt: now(),
  };
}

const initialModelStatus: ModelStatus = {
  modelDownloaded: false,
  downloadedBytes: 0,
  expectedBytes: LOCAL_MODEL.expectedBytes,
  runtimeReady: false,
  runtimeRunning: false,
  modelPath: "",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  const [data, setData] = useState<AppData>(createInitialData);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [modelStatus, setModelStatus] =
    useState<ModelStatus>(initialModelStatus);
  const [downloadProgress, setDownloadProgress] =
    useState<ModelDownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cloudRemaining, setCloudRemaining] = useState<number | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const voice = useVoice();

  const activeConversation = useMemo(
    () =>
      data.conversations.find(
        (conversation) => conversation.id === data.activeConversationId,
      ) ?? data.conversations[0],
    [data.activeConversationId, data.conversations],
  );

  const refreshModelStatus = useCallback(async () => {
    try {
      setModelStatus(await getModelStatus());
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadAppData()
      .then((saved) => {
        if (!cancelled && saved?.version === 1) setData(saved);
      })
      .catch((error) => {
        if (!cancelled) setNotice(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    void refreshModelStatus();
    return () => {
      cancelled = true;
    };
  }, [refreshModelStatus]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let unlisten: (() => void) | undefined;
    void listen<ModelDownloadProgress>(
      "model-download-progress",
      (event) => setDownloadProgress(event.payload),
    ).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!hydrated || !isDesktopRuntime()) return;
    const timeout = window.setTimeout(() => {
      void saveAppData(data).catch((error) => setNotice(errorMessage(error)));
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [data, hydrated]);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [settingsOpen]);

  const mutateData = useCallback((mutator: (current: AppData) => AppData) => {
    setData((current) => ({ ...mutator(current), updatedAt: now() }));
  }, []);

  const updateConversation = useCallback(
    (
      conversationId: string,
      update: (conversation: Conversation) => Conversation,
    ) => {
      mutateData((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...update(conversation), updatedAt: now() }
            : conversation,
        ),
      }));
    },
    [mutateData],
  );

  if (!activeConversation) return null;

  const selectMode = (mode: MasterMode) => {
    updateConversation(activeConversation.id, (conversation) => ({
      ...conversation,
      mode,
    }));
  };

  const selectRoute = (modelRoute: ModelRoute) => {
    updateConversation(activeConversation.id, (conversation) => ({
      ...conversation,
      modelRoute,
    }));
  };

  const createNewConversation = () => {
    const conversation = createConversation(
      activeConversation.mode,
      activeConversation.modelRoute,
    );
    mutateData((current) => ({
      ...current,
      conversations: [conversation, ...current.conversations],
      activeConversationId: conversation.id,
    }));
    setDraft("");
    setSidebarOpen(false);
  };

  const deleteConversation = (id: string) => {
    mutateData((current) => {
      const remaining = current.conversations.filter(
        (conversation) => conversation.id !== id,
      );
      const conversations = remaining.length ? remaining : [createConversation()];
      return {
        ...current,
        conversations,
        activeConversationId:
          current.activeConversationId === id
            ? conversations[0].id
            : current.activeConversationId,
      };
    });
  };

  const addAssistantText = (
    conversationId: string,
    messageId: string,
    content: string,
    route: ModelRoute,
    modelLabel?: string,
    append = false,
  ) => {
    updateConversation(conversationId, (conversation) => {
      const existing = conversation.messages.find(
        (message) => message.id === messageId,
      );
      if (existing) {
        return {
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: append ? message.content + content : content,
                  modelLabel: modelLabel ?? message.modelLabel,
                }
              : message,
          ),
        };
      }
      return {
        ...conversation,
        messages: [
          ...conversation.messages,
          {
            id: messageId,
            role: "assistant",
            content,
            createdAt: now(),
            modelRoute: route,
            mode: conversation.mode,
            modelLabel,
          },
        ],
      };
    });
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || isSending) return;

    const conversation = activeConversation;
    const conversationId = conversation.id;
    const assistantId = crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: now(),
      modelRoute: conversation.modelRoute,
      mode: conversation.mode,
    };
    const modelMessages: ModelMessage[] = [
      ...conversation.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: text },
    ];

    setDraft("");
    setNotice(null);
    setIsSending(true);
    updateConversation(conversationId, (current) => ({
      ...current,
      title:
        current.messages.length === 0
          ? text.slice(0, 48) + (text.length > 48 ? "…" : "")
          : current.title,
      messages: [...current.messages, userMessage],
    }));

    const systemPrompt = buildSystemPrompt(
      conversation.mode,
      data.preferences,
    );
    let completedText = "";

    try {
      if (conversation.modelRoute === "local") {
        if (!modelStatus.modelDownloaded) {
          setSettingsOpen(true);
          throw new Error(
            "Download Gemma 4 in Settings before using private offline mode.",
          );
        }
        if (!modelStatus.runtimeRunning) {
          setIsStarting(true);
          await startLocalModel();
          await refreshModelStatus();
          setIsStarting(false);
        }
        const response = await localChat(
          modelMessages,
          systemPrompt,
          MODE_CONFIGS[conversation.mode].temperature,
        );
        completedText = response.text;
        addAssistantText(
          conversationId,
          assistantId,
          response.text,
          "local",
          response.model,
        );
      } else {
        const response = await streamCloudChat(
          {
            deviceId: data.deviceId,
            messages: modelMessages,
            systemPrompt,
            temperature: MODE_CONFIGS[conversation.mode].temperature,
          },
          (chunk) => {
            completedText += chunk;
            addAssistantText(
              conversationId,
              assistantId,
              chunk,
              "cloud",
              GEMINI_MODEL,
              true,
            );
          },
        );
        if (Number.isFinite(response.remaining)) {
          setCloudRemaining(response.remaining ?? null);
        }
      }

      if (data.preferences.speakResponses && completedText) {
        voice.speak(completedText);
      }
    } catch (error) {
      const message = errorMessage(error);
      setNotice(message);
      if (!completedText) {
        addAssistantText(
          conversationId,
          assistantId,
          `I couldn’t complete that request. ${message}`,
          conversation.modelRoute,
        );
      }
    } finally {
      setIsSending(false);
      setIsStarting(false);
    }
  };

  const handleDownloadModel = async () => {
    setIsDownloading(true);
    setNotice(null);
    try {
      await downloadLocalModel();
      await refreshModelStatus();
      setSyncStatus("Gemma 4 was downloaded and verified.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleStartModel = async () => {
    setIsStarting(true);
    setNotice(null);
    try {
      await startLocalModel();
      await refreshModelStatus();
      setSyncStatus("Gemma 4 is ready for offline conversations.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setIsStarting(false);
    }
  };

  const showRecoveryCode = async () => {
    if (!data.sync) return;
    try {
      const key = await exportRecoveryKey();
      setRecoveryCode(
        `cloudeai-v1.${data.sync.accountId}.${data.sync.authToken}.${key}`,
      );
    } catch (error) {
      setSyncStatus(errorMessage(error));
    }
  };

  const enableSync = async () => {
    setSyncStatus("Creating a private sync identity…");
    try {
      const credentials = await createSyncAccount();
      const next: AppData = {
        ...data,
        sync: {
          ...credentials,
          serverRevision: 0,
          endpoint: "CloudEAI encrypted sync",
        },
        updatedAt: now(),
      };
      setData(next);
      await saveAppData(next);
      const key = await exportRecoveryKey();
      setRecoveryCode(
        `cloudeai-v1.${credentials.accountId}.${credentials.authToken}.${key}`,
      );
      setSyncStatus("Private sync is ready. Save the recovery code safely.");
    } catch (error) {
      setSyncStatus(errorMessage(error));
    }
  };

  const syncNow = async () => {
    if (!data.sync) return;
    setSyncStatus("Encrypting and syncing…");
    try {
      const current = { ...data, updatedAt: now() };
      await saveAppData(current);
      const envelope = await readEncryptedEnvelope();
      if (!envelope) throw new Error("There is no encrypted history to sync.");
      const serverRevision = await pushEncryptedHistory(
        data.sync.accountId,
        data.sync.authToken,
        data.sync.serverRevision,
        envelope,
      );
      mutateData((value) => ({
        ...value,
        sync: value.sync ? { ...value.sync, serverRevision } : undefined,
      }));
      setSyncStatus("Encrypted history is up to date.");
    } catch (error) {
      setSyncStatus(errorMessage(error));
    }
  };

  const restoreHistory = async (code: string) => {
    setSyncStatus("Restoring encrypted history…");
    try {
      const [prefix, accountId, authToken, encryptionKey, ...extra] =
        code.split(".");
      if (
        prefix !== "cloudeai-v1" ||
        !accountId ||
        !authToken ||
        !encryptionKey ||
        extra.length
      ) {
        throw new Error("That recovery code is not valid.");
      }
      const remote = await pullEncryptedHistory(accountId, authToken);
      if (!remote.envelope) {
        throw new Error("No encrypted history has been synced for this code.");
      }
      const previousKey = await exportRecoveryKey();
      await importRecoveryKey(encryptionKey);
      let restored: AppData;
      try {
        restored = await replaceEncryptedEnvelope(remote.envelope);
      } catch (error) {
        await importRecoveryKey(previousKey);
        throw error;
      }
      setData({
        ...restored,
        sync: {
          accountId,
          authToken,
          serverRevision: remote.serverRevision,
          endpoint: "CloudEAI encrypted sync",
        },
        updatedAt: now(),
      });
      setSyncStatus("Encrypted history was restored.");
      setRecoveryCode(null);
    } catch (error) {
      setSyncStatus(errorMessage(error));
    }
  }

  return (
    <div
      className={[
        "app-shell",
        `font-${data.preferences.fontScale}`,
        data.preferences.highContrast ? "high-contrast" : "",
        data.preferences.reduceMotion ? "reduce-motion" : "",
        sidebarOpen ? "sidebar-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Sidebar
        conversations={data.conversations}
        activeId={activeConversation.id}
        onCreate={createNewConversation}
        onDelete={deleteConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        onSelect={(id) => {
          mutateData((current) => ({ ...current, activeConversationId: id }));
          setSidebarOpen(false);
        }}
      />
      <main className="workspace">
        <div className="mobile-toolbar">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle conversation history"
            aria-expanded={sidebarOpen}
          >
            <Menu size={23} aria-hidden="true" />
          </button>
          <strong>CloudEAI</strong>
          <span>{MODE_CONFIGS[activeConversation.mode].label}</span>
        </div>
        <ModeSelector
          selected={activeConversation.mode}
          onSelect={selectMode}
        />
        {notice ? (
          <div className="notice" role="alert">
            <AlertCircle size={19} aria-hidden="true" />
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        ) : null}
        <ChatView
          conversation={activeConversation}
          cloudRemaining={cloudRemaining}
          draft={draft}
          isListening={voice.isListening}
          isSending={isSending}
          voiceError={voice.voiceError}
          voiceSupported={voice.supported}
          onDraftChange={setDraft}
          onRouteChange={selectRoute}
          onSend={() => void sendMessage()}
          onSpeak={voice.speak}
          onStartListening={() =>
            voice.startListening((transcript) => setDraft(transcript))
          }
          onStopListening={voice.stopListening}
        />
      </main>
      {settingsOpen ? (
        <SettingsPanel
          downloadProgress={downloadProgress}
          isDownloading={isDownloading}
          isStarting={isStarting}
          modelStatus={modelStatus}
          preferences={data.preferences}
          recoveryCode={recoveryCode}
          syncEnabled={Boolean(data.sync)}
          syncStatus={syncStatus}
          onClose={() => setSettingsOpen(false)}
          onCreateSync={() => void enableSync()}
          onDownloadModel={() => void handleDownloadModel()}
          onPreferencesChange={(preferences: UserPreferences) =>
            mutateData((current) => ({ ...current, preferences }))
          }
          onRestore={(code) => void restoreHistory(code)}
          onShowRecovery={() => void showRecoveryCode()}
          onStartModel={() => void handleStartModel()}
          onSyncNow={() => void syncNow()}
        />
      ) : null}
      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-scrim"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close conversation history"
        />
      ) : null}
    </div>
  );
}

export default App;
