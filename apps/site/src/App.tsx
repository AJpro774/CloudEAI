import {
  ArrowRight,
  BarChart3,
  Check,
  Cloud,
  Code2,
  Download,
  Eye,
  HardDrive,
  KeyRound,
  MessageCircle,
  Mic2,
  PenLine,
  ShieldCheck,
  Sparkles,
  Volume2,
} from "lucide-react";
import "./App.css";

const downloadUrl = import.meta.env.VITE_DOWNLOAD_URL as string | undefined;

const modes = [
  {
    name: "Code",
    label: "Engineer",
    description:
      "Native development guidance for Swift, Kotlin, Rust, C++, and secure Tauri apps.",
    icon: Code2,
    className: "blue",
  },
  {
    name: "Writing",
    label: "Editor",
    description:
      "Polished documentation and product writing that preserves your voice.",
    icon: PenLine,
    className: "violet",
  },
  {
    name: "General",
    label: "Guide",
    description:
      "Clear, grounded answers for planning, learning, and everyday decisions.",
    icon: MessageCircle,
    className: "green",
  },
  {
    name: "Data",
    label: "Analyst",
    description:
      "Reproducible SQL, statistics, and analysis with uncertainty made explicit.",
    icon: BarChart3,
    className: "amber",
  },
] as const;

function App() {
  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="site-header">
        <a className="site-brand" href="#" aria-label="CloudEAI home">
          <span aria-hidden="true">C</span>
          CloudEAI
        </a>
        <nav aria-label="Primary navigation">
          <a href="#modes">Modes</a>
          <a href="#privacy">Privacy</a>
          <a href="#accessibility">Accessibility</a>
        </nav>
        <a className="header-download" href="#download">
          Download
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </header>

      <main id="main">
        <section className="hero-section">
          <div className="hero-glow" aria-hidden="true" />
          <div className="hero-copy">
            <div className="hero-kicker">
              <ShieldCheck size={17} aria-hidden="true" />
              Local-first AI for your Mac
            </div>
            <h1>
              Private when you need it.
              <br />
              <span>Powerful when you want it.</span>
            </h1>
            <p>
              CloudEAI combines offline Gemma 4 with optional Gemini 3.7 Flash
              in one calm, accessible desktop experience built for serious work.
            </p>
            <div className="hero-actions">
              <a
                className="primary-cta"
                href={downloadUrl ?? "#download"}
              >
                <Download size={20} aria-hidden="true" />
                {downloadUrl ? "Download for Apple Silicon" : "View download details"}
              </a>
              <a className="secondary-cta" href="#privacy">
                See how privacy works
              </a>
            </div>
            <div className="trust-list" aria-label="Product commitments">
              <span>
                <Check size={16} aria-hidden="true" /> No ads
              </span>
              <span>
                <Check size={16} aria-hidden="true" /> No microtransactions
              </span>
              <span>
                <Check size={16} aria-hidden="true" /> No tracking
              </span>
            </div>
          </div>

          <div className="product-frame" aria-label="CloudEAI app preview">
            <div className="window-bar" aria-hidden="true">
              <span />
              <span />
              <span />
              <small>CloudEAI</small>
            </div>
            <div className="app-preview">
              <aside>
                <div className="preview-brand">
                  <strong>C</strong>
                  <span>CloudEAI</span>
                </div>
                <div className="preview-new">+ New conversation</div>
                <small>Recent</small>
                <div className="preview-history is-active">
                  <MessageCircle size={14} />
                  <span>
                    <strong>Accessible SwiftUI form</strong>
                    <small>Code · Local</small>
                  </span>
                </div>
                <div className="preview-history">
                  <MessageCircle size={14} />
                  <span>
                    <strong>Release notes</strong>
                    <small>Writing · Cloud</small>
                  </span>
                </div>
              </aside>
              <div className="preview-main">
                <small className="preview-label">Master prompt</small>
                <div className="preview-modes">
                  {modes.map(({ name, icon: Icon, className }, index) => (
                    <div
                      className={`${className}${index === 0 ? " is-active" : ""}`}
                      key={name}
                    >
                      <Icon size={16} />
                      {name}
                    </div>
                  ))}
                </div>
                <div className="preview-route">
                  <span>
                    <HardDrive size={15} /> Private · Gemma 4
                  </span>
                  <small>Stays on this Mac</small>
                </div>
                <div className="preview-answer">
                  <span className="answer-mark">
                    <Sparkles size={18} />
                  </span>
                  <div>
                    <small>CloudEAI · Gemma 4 E4B</small>
                    <strong>Use a labeled section with generous spacing.</strong>
                    <p>
                      For VoiceOver and larger text sizes, keep each control at
                      least 44 points tall and connect every label explicitly.
                    </p>
                    <div className="preview-code">
                      <i>Form</i> {"{"}
                      <br />
                      &nbsp;&nbsp;<i>Section</i>(<b>"Account"</b>) {"{"}
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;TextField(...)
                      <br />
                      &nbsp;&nbsp;{"}"}
                      <br />
                      {"}"}
                    </div>
                  </div>
                </div>
                <div className="preview-composer">
                  Ask about native programming…
                  <span>↑</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="model-strip" aria-label="Available AI models">
          <div>
            <HardDrive aria-hidden="true" />
            <span>
              <small>Offline and private</small>
              <strong>Google Gemma 4 E4B</strong>
            </span>
          </div>
          <i aria-hidden="true">or</i>
          <div>
            <Cloud aria-hidden="true" />
            <span>
              <small>Fast cloud intelligence</small>
              <strong>Gemini 3.7 Flash</strong>
            </span>
          </div>
        </section>

        <section className="content-section modes-section" id="modes">
          <div className="section-copy">
            <span className="section-kicker">Four expert configurations</span>
            <h2>One assistant. Four deliberate ways of thinking.</h2>
            <p>
              Each mode changes the master prompt, response style, and model
              settings—not just the color of a button.
            </p>
          </div>
          <div className="mode-showcase">
            {modes.map(({ name, label, description, icon: Icon, className }) => (
              <article className={`mode-feature ${className}`} key={name}>
                <span className="mode-feature-icon" aria-hidden="true">
                  <Icon />
                </span>
                <small>{label}</small>
                <h3>{name}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="privacy-section" id="privacy">
          <div className="privacy-visual" aria-hidden="true">
            <div className="privacy-ring ring-one" />
            <div className="privacy-ring ring-two" />
            <div className="privacy-core">
              <KeyRound size={35} />
              <strong>Your key</strong>
              <small>Your control</small>
            </div>
            <span className="privacy-node node-local">
              <HardDrive size={17} /> Local history
            </span>
            <span className="privacy-node node-sync">
              <Cloud size={17} /> Encrypted sync
            </span>
          </div>
          <div className="section-copy privacy-copy">
            <span className="section-kicker">Privacy without fine print</span>
            <h2>Your conversations belong to you.</h2>
            <p>
              Local history is encrypted with AES-256-GCM using a key protected
              by macOS Keychain. Optional sync uploads ciphertext only.
            </p>
            <ul>
              <li>
                <ShieldCheck aria-hidden="true" />
                <span>
                  <strong>Offline means offline</strong>
                  Gemma conversations never leave your Mac.
                </span>
              </li>
              <li>
                <KeyRound aria-hidden="true" />
                <span>
                  <strong>User-controlled recovery</strong>
                  CloudEAI cannot recover or read your encrypted history.
                </span>
              </li>
              <li>
                <Eye aria-hidden="true" />
                <span>
                  <strong>Honest cloud boundaries</strong>
                  Cloud prompts are sent over TLS for Google to process and are
                  not stored by CloudEAI.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="content-section accessibility-section" id="accessibility">
          <div className="section-copy">
            <span className="section-kicker">Comfortable by design</span>
            <h2>Built to be read, heard, and understood.</h2>
            <p>
              Accessibility is part of the core interface, with controls that
              remain clear for older adults and people with vision impairments.
            </p>
          </div>
          <div className="access-grid">
            <article>
              <span aria-hidden="true">Aa</span>
              <h3>Larger text</h3>
              <p>Large defaults, an extra-large option, and layouts that reflow.</p>
            </article>
            <article>
              <Eye aria-hidden="true" />
              <h3>High contrast</h3>
              <p>Strong focus indicators, borders, and readable color contrast.</p>
            </article>
            <article>
              <Mic2 aria-hidden="true" />
              <h3>Voice input</h3>
              <p>Speak naturally with visible listening and permission states.</p>
            </article>
            <article>
              <Volume2 aria-hidden="true" />
              <h3>Spoken answers</h3>
              <p>Listen to any response using familiar macOS system voices.</p>
            </article>
          </div>
        </section>

        <section className="limits-section">
          <div>
            <span className="section-kicker">A sustainable free experience</span>
            <h2>Cloud limits, not surprise charges.</h2>
            <p>
              Gemini usage is capped clearly each day. When the cloud allowance
              is reached, private Gemma remains available without limits.
            </p>
          </div>
          <div className="limit-card">
            <strong>25</strong>
            <span>cloud requests per day</span>
            <small>Configurable by the service owner</small>
          </div>
          <div className="limit-card local">
            <strong>∞</strong>
            <span>local conversations</span>
            <small>After the one-time model download</small>
          </div>
        </section>

        <section className="download-section" id="download">
          <div className="download-icon" aria-hidden="true">
            <Download size={30} />
          </div>
          <span className="section-kicker">CloudEAI for macOS</span>
          <h2>A calmer, more private way to work with AI.</h2>
          <p>
            MVP support is focused on Apple Silicon Macs running macOS 13 or
            later. The offline model requires approximately 7 GB of free space.
          </p>
          {downloadUrl ? (
            <a className="primary-cta" href={downloadUrl}>
              <Download size={20} aria-hidden="true" />
              Download CloudEAI
            </a>
          ) : (
            <span className="primary-cta is-disabled">
              <Download size={20} aria-hidden="true" />
              Download available after first release
            </span>
          )}
          <small>Ad-free. Tracking-free. No account required for local mode.</small>
        </section>
      </main>

      <footer>
        <a className="site-brand" href="#">
          <span aria-hidden="true">C</span>
          CloudEAI
        </a>
        <p>Private intelligence, thoughtfully designed.</p>
        <div>
          <a href="#privacy">Privacy</a>
          <a href="#accessibility">Accessibility</a>
          <span>No analytics</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
