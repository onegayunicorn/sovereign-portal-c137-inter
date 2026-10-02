# SOVEREIGN PORTAL C-137 — BUILD MANIFEST (single source of truth)

Root: `sovereign-portal-c137/` (this directory).

All paths below are relative to this root. Every file listed MUST be created with real,
runnable/syntactically-valid content — no placeholders such as `TODO`, `...`, `<your-code-here>`.

## Blueprint sources (read these; do not invent APIs)
- `C:\Users\tpowe\Desktop\New folder\rick_c137_deployment_blueprint.md` — SOE 11-engine core (full Python source), gateway, tests, Docker, CI.
- `C:\Users\tpowe\Desktop\New folder\rick_c137_deployment_blueprint-1.md` — adds §8 VoiceΩ (phase vocoder, pitch shift, formants, podcast pipeline).
- `C:\Users\tpowe\Desktop\New folder\rick_c137_deployment_blueprint-3.md` — PART IV B2D Bridge v4.2, PART V unified master deployment.
- `C:\Users\tpowe\Desktop\New folder\complete-app-development-production-blueprint.md` — React/TS components, two-bone IK, semantic mapper, offline WebGPU LLM, hardened bridge, PWA, PAF builder, dual ORM, Docker/Vercel/native Android Kotlin.
- `C:\Users\tpowe\Desktop\New folder\complete-app-development-production-blueprint-2.md` — same + §13 Windows `.exe` engine (Tauri v2 Cargo/tauri.conf/main.rs, Electron main/preload/electron-builder.yml, NSIS `installer.nsi`, Windows CI workflow).
- `C:\Users\tpowe\Desktop\New folder\complete-html-portal-blueprint.md` — the complete single-file `index.html` portal.
- `C:\Users\tpowe\Desktop\New folder\FULLSTACK_MONOREPO_BLUEPRINT-1.md` — Turborepo/pnpm/Docker/Vercel/Gist monorepo conventions.
- `_blueprint_extract\monorepo_pwa_flow.txt` (in the session workspace) — reflowed text of the 98-page Monorepo/Offline-AI/PWA PDF: monorepo topology, `portal.frag`, `crt-overlay.frag`, `web-llm-engine.ts`, `whisper-stt.ts`, `sw.js`, `manifest.json`, `tauri.conf.json`, VideoSyncEngine, HardenedBridge Kotlin, PwaConverterService, PAF builder, FFmpeg authoring spec, deployment matrix.

## Target tree

```
sovereign-portal-c137/
├── BUILD_MANIFEST.md            (this file)
├── README.md                    (root)
├── package.json  pnpm-workspace.yaml  turbo.json  .npmrc
├── .env.example  .gitignore  .dockerignore  Makefile
├── .github/workflows/
│   ├── ci.yml  build-pwa.yml  build-tauri-desktop.yml
│   ├── build-capacitor-mobile.yml  release-artifacts.yml
│   ├── windows-exe-release.yml  deploy-html.yml  sovereign-ci.yml
├── apps/
│   ├── web-portal/              # zero-build single-file website + PWA (SHIPPED ARTIFACT)
│   │   ├── index.html  offline.html  manifest.webmanifest  sw.js  robots.txt
│   │   ├── icons/icon-192.png  icons/icon-512.png  icons/icon.svg  icons/maskable-512.png
│   │   ├── nginx.conf  Dockerfile  vercel.json  netlify.toml  _headers
│   │   └── README.md
│   ├── web-pwa/                 # React 19 + Vite + TanStack Router PWA (source app)
│   ├── desktop-tauri/           # Rust Tauri v2 wrapper (Win .exe / .msi / dmg / AppImage)
│   ├── desktop-electron/        # Electron wrapper (+ NSIS + portable)
│   ├── mobile-capacitor/        # Capacitor 6 wrapper -> iOS/Android
│   ├── native-android/          # Native Kotlin WebView shell (APK) + Gradle project
│   ├── portable-builder/        # PortableApps PAF Python builder (Tk UI + CLI)
│   └── soe-core/                # Python Sovereign Orchestrator Engine + VoiceΩ + gateway
├── packages/
│   ├── matrix-engine/           # GLSL shaders + CanvasManager + AudioReactor
│   ├── offline-ai/              # WebLLM / Whisper STT / Kokoro TTS / vector store / memory
│   ├── hud-overlay-system/      # Reticle, ScanlineFilter, TelemetryCard, WaveformBar, TerminalPrompt
│   ├── video-engine/            # VideoSyncEngine + timeline.vtt
│   ├── graphics-engine/         # PortalGunModel, VortexCanvas, PostProcessing
│   ├── native-bridge/           # hardened-bridge-client.ts (HMAC + nonce anti-replay)
│   ├── matrix-protocol/         # matrix-client.ts (Olm/Megolm), twin-sync.ts
│   ├── database/                # prisma/schema.prisma, drizzle/schema.ts, clients, sync-engine
│   ├── gist-sync/               # gist-client.ts, coordinate-pack.ts
│   ├── pwa-converter/           # PwaConverterService.ts
│   ├── ui-core/                 # design tokens + theme
│   ├── tsconfig/                # base.json / react.json / node.json
│   └── config/                  # eslint + tailwind + vite presets
├── docker/                      # Dockerfile, nginx.conf, docker-compose.yml, docker-compose.prod.yml, prometheus.yml
├── windows/                     # installer.nsi, build-exe.ps1
├── tools/                       # paf_builder.py, build_apk.py, download_models.py, make_icons.py
├── ai/                          # Modelfile.rick-c137, persona prompt
├── docs/                        # ARCHITECTURE.md, BUILD.md, DEPLOYMENT.md, EXE.md, APK.md, VERIFICATION.md
└── dist/                        # REAL BUILT OUTPUT (produced by the build step)
    ├── website/                 # servable copy of apps/web-portal
    ├── windows/                 # SovereignPortalC137.exe + SHA256.txt
    └── android/                 # SovereignPortalC137.apk + SHA256.txt
```

## Non-negotiable conventions
- Product name: **Sovereign Portal C-137**. Palette: `--portal-green #00ff88`, `--portal-yellow #d4ff00`, `--hud-cyan #00e5ff`, `--hud-alert #ff0055`, void `#020b05`.
- Default dimension `C-137`, resonance `1207 Hz`, stability `99.87%`.
- npm packages are scoped `@portal/<name>`; Python package dir is `soe-core` with importable modules `soe_core`, `gateway`, `voice_omega`, `rick_persona`.
- No external CDN at runtime for the shipped website (air-gap safe). React app may use npm deps.
- Every created file must be valid for its language (JSON parses, TS compiles conceptually, Python imports, GLSL is real GLSL).
