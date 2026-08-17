import {
  MessageSquareText,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { MODE_CONFIGS, type Conversation } from "@cloudeai/shared";

interface SidebarProps {
  conversations: Conversation[];
  activeId?: string;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onSelect: (id: string) => void;
}

export function Sidebar({
  conversations,
  activeId,
  onCreate,
  onDelete,
  onOpenSettings,
  onSelect,
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Conversation history">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          C
        </span>
        <span>
          <strong>CloudEAI</strong>
          <small>Private intelligence</small>
        </span>
      </div>

      <button className="new-chat-button" type="button" onClick={onCreate}>
        <Plus size={20} aria-hidden="true" />
        New conversation
      </button>

      <nav className="conversation-nav" aria-label="Recent conversations">
        <span className="sidebar-label">Recent</span>
        {conversations.length === 0 ? (
          <p className="empty-history">Your encrypted conversations appear here.</p>
        ) : (
          <ul>
            {conversations.map((conversation) => (
              <li
                className={conversation.id === activeId ? "is-active" : ""}
                key={conversation.id}
              >
                <button
                  className="conversation-button"
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  aria-current={conversation.id === activeId ? "page" : undefined}
                >
                  <MessageSquareText size={17} aria-hidden="true" />
                  <span>
                    <strong>{conversation.title}</strong>
                    <small>
                      {MODE_CONFIGS[conversation.mode].label} ·{" "}
                      {conversation.modelRoute === "local" ? "Local" : "Cloud"}
                    </small>
                  </span>
                </button>
                <button
                  className="delete-chat-button"
                  type="button"
                  onClick={() => onDelete(conversation.id)}
                  aria-label={`Delete ${conversation.title}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="privacy-chip">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            <strong>Encrypted locally</strong>
            <small>Ads and tracking: none</small>
          </span>
        </div>
        <button className="settings-button" type="button" onClick={onOpenSettings}>
          <Settings2 size={20} aria-hidden="true" />
          Settings & privacy
        </button>
      </div>
    </aside>
  );
}
