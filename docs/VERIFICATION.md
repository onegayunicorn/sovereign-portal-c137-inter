# Verification report

Everything in the **verified** section was executed on the build machine and its output
observed. The **not verified** section lists exactly what was not exercised, so nothing here
is overstated.

Build host: Windows, Node v22, Python 3.12, JDK 17.0.20.1, Android SDK build-tools 34.0.0.

---

## 1. Verified

### 1.1 Python orchestrator — `62 passed`

```
$ python -m pytest apps/soe-core/tests -q
..............................................................           [100%]
62 passed, 1 warning in 1.67s
```

The single warning is a Starlette deprecation notice about `httpx` in `TestClient` — no
test failure.

### 1.2 ORC-001 full system audit

```
$ python apps/soe-core/run_audit.py

[SOE] status=SOVEREIGN_SYSTEM_COHERENT global_merkle_root=b23d170b86786fa5bb7892a3e00077e7583dd25e64206475bd7281360e9cf4ce
[SOE] Report written to apps/soe-core/sovereign_audit_results.json
```

`status` is the expected `SOVEREIGN_SYSTEM_COHERENT` and the root is a 64-character SHA-256
digest. The root differs between runs because every `MerkleNode` includes a nanosecond
timestamp — that is by design, not non-determinism in the state payloads.

### 1.3 Website build

```
$ node tools/build-portal.mjs
[portal] OK all 14 required files present
[portal] OK index.html contains portal vortex shader
[portal] OK index.html contains matrix rain layer
[portal] OK index.html contains orchestrator HUD
[portal] OK index.html contains SOE gateway bridge
[portal] OK index.html contains PWA service worker registration
[portal] 15 files, 258836 bytes
```

Served over HTTP and fetched:

```
GET /  -> 200, 32,424 bytes, contains "Rick C-137 Portal"
```

### 1.4 Windows executable

| Check | Result |
|---|---|
| Built | `dist/windows/SovereignPortalC137.exe` — 25,631,837 bytes (24.44 MB) |
| SHA-256 | `D18A990ED1A22997F23811DE1637437ABD63C670FB969A0A71661B2C10895E1B` |
| Process launches | yes (`--no-browser --port 8479`) |
| `GET /health` | **200** — `{"status":"ok","version":"1.0.0","coherence":1.0,"coherence_stage":"LIVING","engine_count":12,"voice_omega":true,...}` |
| `GET /` | **200**, 32,424 bytes, contains `Rick C-137 Portal` |
| `GET /audit/verify` | **200** — `{"status":"CHAIN_VERIFIED","coherence":0.99998,"engine_count":12,"broken":[]}` |
| Loopback bind | yes, `127.0.0.1` only |

The unfrozen launcher was verified independently before freezing, which isolated the one
failure encountered: a `--windowed` PyInstaller build leaves `sys.stdout`/`sys.stderr` as
`None`, breaking uvicorn's `StreamHandler`. `desktop_launcher.py` now rebinds both to
`os.devnull` at import time, and the shipped binary is built with `-Console` so the banner and
portal URL are visible.

### 1.5 Android package

```
$ python tools/build_apk.py
[apk] aapt2 link  : unsigned.apk = 241,018 bytes
[apk] javac: produced 12 class file(s)
[apk] d8: classes.dex = 14,536 bytes
[apk] APK         : dist/android/SovereignPortalC137.apk
[apk] size        : 263,623 bytes (0.25 MB)
[apk] sha256      : 7c4f3e1b7d0caec92b75ff17308a0848b8eb87e2f39194042f00018126142d64
[apk] signature   : Verifies
```

`apksigner verify --print-certs`:

```
Signer #1 certificate DN: CN=Android Debug, O=Sovereign Portal C-137, C=US
Signer #1 certificate SHA-256 digest: b2d4bd069a17c73c4c02a441dc8ccc3ba467a05fd4d2918c6154c98f1cef75cb
```

Archive contents (21 entries) — the portal really is inside the APK:

| Entry | Bytes |
|---|---|
| `AndroidManifest.xml` | 3,372 |
| `resources.arsc` | 3,344 |
| `classes.dex` | 14,536 |
| `assets/index.html` | 32,457 |
| `assets/sw.js` | 5,457 |
| `assets/manifest.webmanifest` | 1,395 |
| `assets/offline.html` | 2,621 |
| `assets/icons/{icon-192,icon-512,maskable-512,icon.svg}` | 19,741 / 99,051 / 84,280 / 1,683 |
| `res/mipmap-hdpi-v4/ic_launcher.png` | 14,897 |
| `res/mipmap-anydpi-v26/ic_launcher.xml` | 448 |
| `META-INF/ANDROIDD.{RSA,SF}`, `META-INF/MANIFEST.MF` | signature block |

Content assertions against the packaged `assets/index.html`:
`Rick C-137 Portal` ✓ · `u_resonance` (vortex shader) ✓ · `matrix-canvas` ✓ · `/health` (SOE bridge) ✓

### 1.6 PortableApps package

`paf_builder.py` produced the PAF 1.0 tree: `App/AppInfo/appinfo.ini`, isolated
`Data/settings` + `Data/logs`, `Other/help`, `PortalC137Portable.bat`, `PortalC137Portable.sh`,
`launch-termux.sh` and a 24-entry `SHA256.txt` manifest.

### 1.7 Static analysis across the generated source

| Check | Result |
|---|---|
| JSON documents parse | 17 / 17 |
| TypeScript / TSX syntax (real `tsc` 5.7.3 parser) | 38 / 38, zero syntax diagnostics |
| Python `ast.parse` | all files |
| YAML `safe_load` (workflows, electron-builder, compose) | 11 / 11 |
| `tsc` semantic pass over all packages + PWA app | only `TS2307 Cannot find module` for deliberately-uninstalled deps (`@mlc-ai/web-llm`, `@xenova/transformers`, `sql.js`, `@vitejs/plugin-react`) |

---

## 2. Not verified

Stated plainly so nothing is assumed:

| Item | Why | What is needed |
|---|---|---|
| **React PWA bundle** (`dist/pwa`) | no `node_modules` in the repo; `pnpm install` was not run | `pnpm install && pnpm --filter @portal/web-pwa build` |
| **Tauri / Electron binaries** | no Rust toolchain; Electron not installed | `rustup` + `pnpm tauri build` |
| **Kotlin Gradle APK** | no Gradle distribution or AGP | `gradle wrapper --gradle-version 8.7 && ./gradlew assembleRelease` |
| **Kotlin sources compiled** | `kotlinc` was fetched but the Gradle path was not exercised | as above |
| **GLSL shader compilation at runtime** | no browser/GPU driver invoked; the shader was reviewed and shipped, not executed | open the portal and check the console |
| **Offline AI inference** | quantized weights (Llama-3.2-1B, whisper-tiny) are not bundled | `python tools/download_models.py` |
| **APK on a device** | no `adb` device or emulator attached | `adb install -r dist/android/SovereignPortalC137.apk` |
| **Docker images** | Docker not exercised on the build host | `docker compose -f docker/docker-compose.yml up -d --build` |
| **Matrix / Prisma / Drizzle live paths** | no homeserver, Postgres or Turso instance | provide `DATABASE_URL` / `MATRIX_HOMESERVER_URL` |

---

## 3. Known issues

1. **`/health` reports `"frozen": false` inside the packaged exe.** The handler serialises
   `soa.frozen` (an orchestrator attribute that is never set to `True`) rather than
   `getattr(sys, "frozen", False)`. Cosmetic — the exe is genuinely frozen and serves its
   bundled assets from `sys._MEIPASS/web`. One-line fix in `apps/soe-core/gateway.py`.
2. **`apps/web-pwa/src/index.css` was missing** from the first generation pass and was written
   during review. It imports `@portal/ui-core` tokens and `@portal/hud-overlay-system` styles
   and carries the portal layout rules; without it the PWA would render unstyled.
3. **Bridge canonicalisation differs between shells.** The Rust and Kotlin `MainActivity`
   implementations sign `command:payload:timestamp:nonce`, while
   `HardenedBridge.kt`, the Java APK shell and `packages/native-bridge` sign
   `command:nonce:timestamp:payload`. The blueprint specifies both orders in different places.
   The shipped portal talks to the **second** order; align the Rust/Kotlin shells before
   connecting them to the hardened path.
4. **PAF `AppInfo/` placement.** `builder_ui.py` writes `App/AppInfo/`, matching blueprint
   §9.1; upstream PortableApps puts `AppInfo/` at the bundle root. Both are documented in the
   builder README.
5. **`builder_ui.py` needs `tkinter`**, absent from some minimal Python distributions. The
   headless `paf_builder.py` has no such dependency.
