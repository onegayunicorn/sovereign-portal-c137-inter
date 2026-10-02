# Architecture

## 1. Layered system topology

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ OPERATOR CLIENT                                                              │
│  Layer 0  Matrix digital-rain canvas                                         │
│  Layer 1  WebGL portal vortex shader (audio-reactive)                        │
│  Layer 2  CRT scanline + chromatic overlay                                   │
│  Layer 3  Holographic HUD: telemetry, orchestrator terminal, command capsule │
│  Bridge   /health · /orchestrate/action · /audit/verify · /voice/*           │
└───────────────┬──────────────────────────────────────────┬───────────────────┘
                │ same-origin fetch (or loopback :8000)    │ postMessage / JS bridge
                ▼                                          ▼
┌───────────────────────────────────────────┐   ┌──────────────────────────────┐
│ SOE FASTAPI GATEWAY  (apps/soe-core)      │   │ NATIVE SHELLS                │
│  · 12 Merkle-chained engines              │   │  Android  Kotlin/Java WebView│
│  · Coherence Guardian  (Γ ≥ 0.999)        │   │  Desktop  Tauri v2 (Rust)    │
│  · SHA-256 Merkle DAG state ledger        │   │  Desktop  Electron           │
│  · VoiceΩ DSP + podcast pipeline          │   │  Mobile   Capacitor 6        │
│  · Static mount of the portal at /        │   │  Portable PortableApps (PAF) │
└───────────────────────────────────────────┘   └──────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ PERSISTENCE & FEDERATION                                                     │
│  Prisma  → PostgreSQL (relational authority, migrations)                     │
│  Drizzle → SQLite / libSQL (local, edge, sqlite-wasm in browser)             │
│  Matrix  → Dendrite/Synapse rooms, Olm/Megolm E2EE, twin-state sync          │
│  Gist    → serverless sovereign state export (anonymous or token)            │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 2. The orchestrator: 11 + 1 engines

Each engine owns its own Merkle root and history; the global root hashes the ordered set of
per-engine roots.

| # | Engine | Domain | State |
|---|---|---|---|
| 1 | Alchemical | Phase transmutation | `materia_ratios`, `phase`, `stone_active` |
| 2 | 5D Geometry Mesh | Hyperdimensional geometry (M₅) | `vertex_matrix`, `simplex_volumes` |
| 3 | Bloch Sphere | Qubit rotation & projection | `qubit_coords`, `p_density` |
| 4 | Singularity | φ-driven super-exponential growth | `iteration_count`, `phi_growth`, `event_flag` |
| 5 | Reality v2 | Multi-threaded causal weaving | `active_threads`, `entropy_index` |
| 6 | Phoenix | Cyclic destruction & rebirth | `cycle_epoch`, `regenerated_energy` |
| 7 | Photonic | Helical phase fronts, OAM ℓ=3 | `channel_mask`, `oam_pulse_power` |
| 8 | Quantum Sim | Bell states, EPR correlations | `entangled_pairs`, `fidelity` |
| 9 | Entanglement | Cross-engine state sync | `sync_matrix`, `nonlocal_latency` |
| 10 | Agent Core | Multi-agent dispatch & consensus | `agent_registry`, `consensus_hash` |
| 11 | Geneweaver | Sequence optimisation, GC motifs | `sequence_catalog`, `gc_ratios` |
| 12 | **VoiceΩ** | Phase-vocoder TSM, pitch/formant, podcast | `vox_transitions` |

**Merkle chaining.** Every mutation commits a node:

```
node_hash = SHA256("{timestamp}:{action_id}:{payload_hash}:{parent_root}")
payload_hash = SHA256(json.dumps(payload, sort_keys=True))
```

`verify_merkle_chain()` re-walks every engine history and confirms each node's `parent_root`
equals its predecessor's `node_hash`.

**Coherence gate.** `Γ < 0.999` fires `GOV-001` (recalibrate); `Γ < 0.95`, a broken chain or
an unhandled exception fires `GOV-002` (freeze + dump); `GOV-003` reinitialises.

**Orchestration catalogue.**

| ID | Name | Flow |
|---|---|---|
| ORC-001 | Full sovereign system audit | All engines → ALC-001(RUBEDO) → GEO → BLO → SIN(100) → REA → 6 supporting → aggregate root → persist JSON |
| ORC-002 | Philosopher's stone reality weave | ALC-001(RUBEDO) → REA-001 high-coherence thread → REA-002 weave |
| ORC-003 | Quantum-hyperdimensional mapping | BLO-001 six base states → GEO-001 → GEO-002 tetrahedron |
| ORC-004 | Singularity transcendence | SIN-001(1000) → ALC-001(RUBEDO) → REA-001(D=12) → ENT-001 |
| ORC-005 | End-to-end Merkle audit | Collect roots → hash global root → verify every transition → flag breaks |

## 3. Portal rendering pipeline

`apps/web-portal/index.html` is a single file. Runtime order:

1. `resizeAll()` sizes the matrix and WebGL canvases to the HUD viewport (9:16, max 440×880).
2. `drawMeter()` runs every animation frame: `getByteFrequencyData` drives the 2D waveform
   bars **and** computes normalised energy → `resonanceLevel`.
3. `drawMatrix()` ticks every 55 ms, fading with `rgba(1,8,4,0.10)` and advancing one glyph
   per column.
4. `render()` feeds `u_time` and `u_resonance` into the fragment shader and draws a
   full-viewport triangle pair.
5. `probeSoe()` polls `/health` every 15 s; `btn-audit` dispatches ORC-001.

The shader performs polar warp (`angle + warp/(dist+0.15)`), dual-octave value noise, radial
rim `smoothstep(0.72,0.22,dist)` and an exponential core glow scaled by audio energy.

## 4. Platform matrix

| Target | Engine / packaging | Acceleration | Persistence | Packaging command |
|---|---|---|---|---|
| Web / mobile web | Vite PWA + service worker | WebGPU → WebGL2 fallback | CacheStorage, OPFS | `pnpm --filter @portal/web-pwa build` |
| Static website | single-file HTML5 | WebGL | localStorage | `node tools/build-portal.mjs` |
| Windows `.exe` | PyInstaller one-file + FastAPI | WebView2 WebGL | SQLite file | `windows/build-exe.ps1` |
| Desktop | Tauri v2 (Rust) | DirectX/Vulkan/Metal | SQLite + filesystem | `pnpm tauri build` |
| Desktop alt | Electron + NSIS | Chromium WebGPU | SQLite | `pnpm electron-builder` |
| Android `.apk` | Kotlin/Java WebView shell | WebView WebGL/WebGPU | Room / SharedPreferences | `python tools/build_apk.py` |
| iOS / Android | Capacitor 6 | WebView GPU | native plugins | `npx cap sync` |
| Portable | PortableApps PAF 1.0 | host browser | isolated `Data/` | `paf_builder.py --zip` |
| Sovereign node | Docker + nginx | headless GL/Vulkan | Postgres + Dendrite | `docker compose up -d` |

## 5. Offline AI

```
mic / touch / keyboard
        │
   WebAudio reactor ──► FFT ──► GLSL uniforms
        │
   ┌────┴───────────────────────────────┐
   │ Whisper-tiny (WebGPU/WASM)  STT    │
   │ Llama-3.2-1B-Instruct q4f16 (MLC)  │
   │ Kokoro / Piper WASM         TTS    │
   └────┬───────────────────────────────┘
        │
   sqlite-wasm + OPFS / IndexedDB vector store
```

`env.allowRemoteModels = false` and `env.localModelPath = "/models/"` force every asset to
resolve locally. The service worker keeps a separate `portal-models-cache` and synthesises
HTTP 206 responses so gigabyte weight files survive CacheStorage.

## 6. Security

| Control | Implementation |
|---|---|
| Cross-origin isolation | COOP `same-origin` + COEP `require-corp` (nginx/Vercel/Netlify) |
| CSP | `wasm-unsafe-eval` allowed; no third-party `connect-src` |
| Zero telemetry | no analytics, no external calls from the portal |
| Native bridge | HMAC-SHA256, UUIDv4 nonce, ±3000 ms window, allow-list, constant-time compare |
| WebView hardening | `allowFileAccess=false`, `allowContentAccess=false`, synthetic asset origin |
| Service worker | never caches the gateway API surface |
