# Sovereign Portal C-137

**Rick C-137 Sovereign AI Portal Interface // Twin Portal**

A complete, offline-first sovereign AI portal: procedural WebGL vortex engine, audio-reactive
holographic HUD, 11-engine Merkle-chained Python orchestrator, PWA, Windows executable,
Android APK, Tauri/Electron desktop shells and PortableApps packaging — generated from the
supplied production blueprints.

---

## Built artifacts

Everything below was **actually compiled and verified on this machine**, not just staged.

| Artifact | Path | Size | Verified |
|---|---|---|---|
| Static website (portal) | `dist/website/` | 15 files / 254 KB | Served and fetched over HTTP 200 |
| **Windows executable** | `dist/windows/SovereignPortalC137.exe` | 24.44 MB | Launched; `/health` 200, `/` 200, `/audit/verify` 200 |
| **Android package** | `dist/android/SovereignPortalC137.apk` | 257 KB | `apksigner verify` → **Verifies**; assets + `classes.dex` present |
| PortableApps (PAF) | `dist/portable/PortalC137Portable_1.0.0/` | 24 files | Built, launchers + SHA256 emitted |
| PWA source app | `apps/web-pwa/` | 22 files | Source complete; builds with `pnpm install && pnpm build` |

Checksums: [`dist/SHA256SUMS.txt`](dist/SHA256SUMS.txt) · Artifact report: [`dist/ARTIFACTS.md`](dist/ARTIFACTS.md)

---

## Quick start

```powershell
# 1. Open the website (no build step, no dependencies)
start dist\website\index.html

# or serve it
python -m http.server 8080 --directory dist\website

# 2. Run the Windows executable (starts the SOE gateway + opens the portal)
dist\windows\SovereignPortalC137.exe

# 3. Run the orchestrator from source
python apps\soe-core\run_audit.py
python -m pytest apps\soe-core\tests -q      # 62 tests

# 4. Rebuild every artifact
node tools\build-portal.mjs                   # website  -> dist/website
powershell -File windows\build-exe.ps1 -Console   # .exe  -> dist/windows
python tools\build_apk.py                     # .apk     -> dist/android
node tools\make-dist.mjs                      # audit + checksums
```

`make help` lists every target.

---

## What is in the portal

The shipped interface (`apps/web-portal/index.html`) is a **single self-contained file** —
no bundler, no npm install, no runtime CDN, so it runs identically from `file://`, a static
host, a Docker container, a USB stick or an air-gapped machine.

Three stacked render layers plus a live orchestrator link:

1. **Matrix digital rain** — procedural glyph cascade on its own canvas.
2. **WebGL portal vortex** — acoustic-driven GLSL fragment shader (`u_time`, `u_resolution`,
   `u_resonance`), toxic-green / high-voltage-yellow palette, audio energy fed straight from
   the analyser node into the swirl.
3. **HUD** — CRT scanlines, corner reticle brackets, live clock / battery / mesh telemetry,
   dimensional coordinates (`C-137`, `1207 Hz`, `99.87 %`), orchestrator terminal with
   typewriter output, WebAudio frequency visualiser and a glassmorphic command capsule with
   speech recognition.

**SOE gateway bridge.** The HUD probes `/health` then `http://127.0.0.1:8000/health` and
promotes the `SOE CORE` telemetry cell to `LINKED`. **SOE AUDIT** dispatches
`POST /orchestrate/action` with `action_id: "ORC-001"` and streams the returned Merkle root
into the terminal. With no gateway present the portal degrades cleanly to standalone offline
mode — every shader, sound and control keeps working.

**Native shell awareness.** Inside the Android WebView / Tauri / Electron shells the portal
detects the bridge, skips service-worker registration (assets already come from the package)
and routes haptic feedback to `SovereignBridge`.

---

## Repository layout

```
sovereign-portal-c137/
├── apps/
│   ├── web-portal/          shipped static website + PWA (zero build step)
│   ├── web-pwa/             React 19 + Vite + TanStack PWA source app
│   ├── soe-core/            Python: 11 Merkle-chained engines, VoiceΩ, FastAPI gateway,
│   │                        desktop launcher (frozen into the .exe), 62 tests
│   ├── desktop-tauri/       Tauri v2 Rust shell (Win .exe/.msi, dmg, AppImage)
│   ├── desktop-electron/    Electron shell (NSIS + portable)
│   ├── native-android/      Kotlin Gradle project + framework-only Java APK shell
│   ├── mobile-capacitor/    Capacitor 6 wrapper (iOS + Android)
│   └── portable-builder/    PortableApps (PAF 1.0) builder — Tk UI + headless CLI
├── packages/
│   ├── matrix-engine/       GLSL shaders, CanvasManager, AudioReactor
│   ├── offline-ai/          WebLLM (Llama-3.2-1B), Whisper STT, Kokoro TTS, vector store
│   ├── hud-overlay-system/  Reticle, ScanlineFilter, TelemetryCard, WaveformBar, TerminalPrompt
│   ├── video-engine/        Frame-accurate requestVideoFrameCallback timeline engine
│   ├── graphics-engine/     Portal gun GLB, vortex canvas, post-processing chain
│   ├── native-bridge/       HMAC-SHA256 + nonce anti-replay bridge client
│   ├── matrix-protocol/     Matrix federation (Olm/Megolm E2EE), twin sync
│   ├── database/            Dual ORM: Prisma (Postgres) + Drizzle (SQLite/libSQL)
│   ├── gist-sync/           GitHub Gist state export/import
│   ├── pwa-converter/       In-app raw-HTML → installable PWA converter
│   ├── ui-core/             Design tokens and theme
│   ├── config/              Shared eslint / tailwind / vite presets
│   └── tsconfig/            Shared TypeScript configurations
├── docker/                  Dockerfile, nginx.conf, compose (dev + prod), prometheus
├── windows/                 NSIS installer + PyInstaller build script
├── tools/                   build-portal, build_apk, make-dist, make_icons, download_models
├── ai/                      Ollama Modelfile + persona prompt
├── .github/workflows/       CI, sovereign audit, PWA / Tauri / Capacitor / Windows / release
└── dist/                    built artifacts (website, windows, android, portable)
```

---

## The Python core

`apps/soe-core` implements the Sovereign Orchestrator Engine: eleven Merkle-chained engines
(Alchemical, 5D Geometry Mesh, Bloch Sphere, Singularity, Reality v2, Phoenix, Photonic,
Quantum Sim, Entanglement, Agent Core, Geneweaver) plus **VoiceΩ** registered as the twelfth.

Every state transition commits a SHA-256 `MerkleNode` of
`(timestamp, action_id, payload_hash, parent_root)`, forming an immutable DAG that
`verify_merkle_chain()` walks end to end.

Orchestration catalogue: `ORC-001` full system audit · `ORC-002` philosopher's-stone reality
weave · `ORC-003` quantum-hyperdimensional mapping · `ORC-004` singularity transcendence ·
`ORC-005` end-to-end Merkle audit. Governance: `GOV-001` recalibration · `GOV-002` emergency
halt · `GOV-003` reinitialisation.

VoiceΩ provides the phase-vocoder time-scale modification, resampling pitch shift, formant
scaling and the document-to-podcast pipeline. The DSP core runs on **numpy + stdlib only** —
`librosa`, `openai`, `PyPDF2`, `python-docx` and `gtts` are imported lazily and only if the
corresponding feature is used.

Gateway routes: `GET /health`, `POST /telemetry/inject`, `POST /orchestrate/action`,
`GET /audit/verify`, `POST /voice/synthesize`, `POST /voice/podcast`, plus a static mount
that serves the portal at `/`.

---

## Security model

- **Zero telemetry.** No analytics, no outbound calls from the shipped portal.
- **Cross-origin isolation.** COOP `same-origin` + COEP `require-corp` everywhere
  (nginx, Vercel, Netlify), required for WebGPU `SharedArrayBuffer`.
- **CSP** with `wasm-unsafe-eval` but no external `connect-src` beyond the loopback gateway.
- **Zero-trust native bridge.** HMAC-SHA256 over `command:nonce:timestamp:payload`, UUIDv4
  single-use nonces, ±3000 ms replay window, explicit command allow-list, constant-time
  comparison.
- **Hardened WebView.** `allowFileAccess=false`, `allowContentAccess=false`, assets served
  from a synthetic `https://appassets.androidplatform.net/assets/` origin.

---

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System topology, engines, data flow, platform matrix |
| [docs/BUILD.md](docs/BUILD.md) | Every build path, toolchain requirements, troubleshooting |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel, Netlify, Cloudflare, Docker, GitHub Pages, air-gap |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | What was verified, how, and what remains unverified |

Third-party model weights (Llama-3.2-1B-Instruct q4f16, whisper-tiny) are **not** bundled —
run `python tools/download_models.py`. The portal and orchestrator run fine without them;
only offline in-browser inference needs them.

## Licence

MIT — see [`windows/LICENSE.txt`](windows/LICENSE.txt).
