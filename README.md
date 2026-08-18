# CloudEAI

CloudEAI is an accessible, local-first desktop chatbot for Apple Silicon Macs. It combines offline LiquidAI GGUF models with several Gemini cloud models, encrypted history, voice interaction, and four purpose-built master prompt modes.

## Product commitments

- No ads, analytics, microtransactions, or paid upgrade prompts.
- Local Liquid conversations stay on the Mac.
- History is encrypted with AES-256-GCM and a key protected by macOS Keychain.
- Optional sync uploads ciphertext only.
- Cloud prompts are processed transiently by the CloudEAI proxy and Google.
- Local mode remains available after the daily cloud limit is reached.

## Workspace

```text
apps/
  desktop/       Tauri 2 + React desktop application
  site/          Accessible download and product website
  sync-worker/   Gemini streaming proxy, quotas, and encrypted sync
packages/
  shared/        Prompt modes, shared types, and model configuration
```

## Requirements

- macOS 13 or newer on Apple Silicon
- Node.js 22 or newer
- Current Rust stable toolchain
- Approximately 3 GB free for the offline model

## Configure Gemini

Create `.env.local` in the repository root:

```env
GEMINI_API_KEY=your_ai_studio_key
GEMINI_MODEL=gemini-3.7-flash
VITE_CLOUD_API_URL=http://localhost:8787
```

The environment file and generated Worker `.dev.vars` file are ignored by Git. The API key is used by the Worker and is never compiled into the desktop frontend.

## Develop locally

Install dependencies:

```bash
npm install
```

Prepare the local D1 database and start the API:

```bash
npm exec -w @cloudeai/sync-worker -- wrangler d1 migrations apply cloudeai-sync --local
npm run dev:sync
```

In another terminal, run the desktop application:

```bash
npm run dev:desktop
```

Run the website separately:

```bash
npm run dev:site
```

The desktop build downloads and verifies a pinned `llama.cpp` Apple Silicon runtime. LiquidAI GGUF models are downloaded from Hugging Face only when the user chooses **Download verified model** inside Settings.

## Verify

```bash
npm run check
npm test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run build
```

Build an unsigned development DMG:

```bash
npm run prepare:sidecar -w @cloudeai/desktop
npm exec -w @cloudeai/desktop -- tauri build --debug
```

## Deploy the API

Authenticate Wrangler, create or provision the D1 database, apply migrations, and store the Gemini key as a Worker secret:

```bash
cd apps/sync-worker
npx wrangler login
npx wrangler d1 migrations apply cloudeai-sync --remote
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

Update `VITE_CLOUD_API_URL` for release builds and add the production website origin to `ALLOWED_ORIGINS`.

## Public testing

- Source: https://github.com/AJpro774/CloudEAI
- Website: https://cloudeaichat.vercel.app
- macOS download: https://github.com/AJpro774/CloudEAI/releases/tag/v1.0.0

This is CloudEAI v1, an unsigned build. macOS Gatekeeper will warn. Right-click CloudEAI.app and choose **Open**. Cloud chat needs the Worker deployed; local Liquid models download from Settings.

## Distribution

The GitHub release workflow builds an arm64 DMG. Public distribution without macOS security warnings requires:

- Apple Developer ID Application certificate
- Apple notarization credentials
- Repository secrets referenced by the release workflow

The website accepts `VITE_DOWNLOAD_URL` so its download button can point to the latest GitHub release.

## Privacy limitations

“End-to-end encrypted” applies to stored and synced history. A cloud model cannot process encrypted prompt text: cloud-mode prompts are decrypted on the device, sent over TLS through the proxy, and processed by Google. The proxy does not persist prompt or response content.

See [PLAN.md](PLAN.md) for scope and completion criteria.
