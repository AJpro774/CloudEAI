# CloudEAI MVP Plan

## Product goal

Build a private, ad-free Tauri desktop chatbot for macOS Apple Silicon with:

- Offline Google Gemma 4 E4B Q4 inference.
- Optional Gemini 3.7 Flash cloud inference.
- Real-time voice input and spoken responses.
- Encrypted personalized history and optional end-to-end encrypted sync.
- Four distinct master prompt modes: Code, Writing, General, and Data.
- A clean, minimalist interface designed to WCAG 2.2 AA standards.
- No advertising, subscriptions, or microtransactions.

## Confirmed architecture

### Desktop app

- Tauri 2, Rust, React, and TypeScript.
- `llama.cpp` sidecar pinned by version and SHA-256 checksum.
- Gemma model downloaded after installation and verified before use.
- Encrypted local history using AES-256-GCM.
- Encryption key stored in macOS Keychain.
- Voice capture through macOS/WebKit speech recognition and native speech synthesis.

### Cloud service

- Gemini model: `gemini-3.7-flash`, verified with the supplied AI Studio API key.
- API key remains server-side and is never bundled with the desktop app.
- Streaming responses through a Cloudflare Worker.
- D1-backed daily and per-minute usage limits.
- Cloud prompts are processed transiently and never stored by CloudEAI.

### Privacy boundary

- Offline conversations never leave the Mac.
- Stored and synced history is encrypted before leaving the device.
- Sync storage receives ciphertext only.
- Cloud-mode prompts must be decrypted on-device and sent over TLS for Google to process.
- Telemetry is disabled by default.

## Implementation phases

1. **Foundation**
   - Organize the npm workspace.
   - Configure the Tauri desktop app, shared contracts, Worker, and website.
   - Protect all environment and secret files from Git.

2. **Four master prompt modes**
   - Code: native development, debugging, architecture, testing, and security.
   - Writing: audience, tone, structure, editing, and documentation.
   - General: practical guidance with adjustable detail.
   - Data: SQL, analysis, reproducibility, uncertainty, and visualization guidance.

3. **Desktop chat experience**
   - Conversation history and new-chat controls.
   - Private/cloud model switch.
   - Streaming cloud responses and safe Markdown rendering.
   - Model download, integrity verification, startup, and status handling.

4. **Accessibility**
   - Large default text and controls.
   - Extra-large text option and high-contrast mode.
   - Full keyboard navigation and visible focus states.
   - VoiceOver labels, reduced motion, and plain-language status messages.

5. **Voice**
   - User-initiated microphone access.
   - Interim and final speech transcription.
   - Spoken assistant responses and per-message playback.
   - Audio is not retained by CloudEAI.

6. **Encrypted history and sync**
   - AES-256-GCM encrypted local history.
   - Key storage in macOS Keychain.
   - Optional anonymous sync identity.
   - User-controlled recovery code and conflict-safe revisions.

7. **Cloud limits**
   - Default limit: 25 cloud requests per day and 4 per minute.
   - Remaining quota shown in the interface.
   - Offline Gemma remains available after the cloud limit is reached.

8. **Website and distribution**
   - Accessible product and privacy pages.
   - macOS system requirements and download instructions.
   - GitHub release workflow for arm64 `.app` and `.dmg` artifacts.
   - Apple Developer ID signing and notarization when credentials are supplied.

9. **Verification**
   - TypeScript typechecks and Worker tests.
   - Rust compile checks and encryption tests.
   - Accessibility checks and keyboard-flow testing.
   - Desktop and website production builds.
   - End-to-end validation of local chat, cloud chat, voice, history, and sync.

## MVP completion criteria

- The app launches on an Apple Silicon Mac.
- Gemma 4 can be downloaded once and used without internet access.
- Gemini 3.7 Flash responds through the protected cloud proxy.
- All four prompt modes visibly change assistant behavior.
- Voice input and spoken responses work with clear permission handling.
- Conversation history survives restarts in encrypted form.
- Optional sync can restore history using a recovery code.
- Cloud usage limits are enforced without disabling local mode.
- The interface is usable with keyboard navigation, VoiceOver, high contrast, and enlarged text.
