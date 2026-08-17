import {
  BarChart3,
  Code2,
  MessageCircle,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import {
  MODE_CONFIGS,
  type MasterMode,
  type ModeConfig,
} from "@cloudeai/shared";

const icons: Record<MasterMode, LucideIcon> = {
  code: Code2,
  writing: PenLine,
  general: MessageCircle,
  data: BarChart3,
};

interface ModeSelectorProps {
  selected: MasterMode;
  onSelect: (mode: MasterMode) => void;
}

export function ModeSelector({ selected, onSelect }: ModeSelectorProps) {
  return (
    <section className="mode-section" aria-labelledby="mode-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Master prompt</span>
          <h2 id="mode-heading">Choose how CloudEAI thinks</h2>
        </div>
        <span className="selection-note">Applied to this conversation</span>
      </div>
      <div className="mode-grid">
        {(Object.values(MODE_CONFIGS) as ModeConfig[]).map((mode) => {
          const Icon = icons[mode.id];
          const active = selected === mode.id;
          return (
            <button
              className={`mode-card mode-${mode.accent}${active ? " is-active" : ""}`}
              type="button"
              key={mode.id}
              onClick={() => onSelect(mode.id)}
              aria-pressed={active}
            >
              <span className="mode-icon" aria-hidden="true">
                <Icon size={21} strokeWidth={2} />
              </span>
              <span>
                <strong>{mode.label}</strong>
                <small>{mode.description}</small>
              </span>
              <span className="mode-check" aria-hidden="true">
                {active ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
