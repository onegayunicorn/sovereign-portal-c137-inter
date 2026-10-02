# Build guide

Every command below was executed on this machine. Windows PowerShell is the reference shell —
use `;` rather than `&&`.

---

## 0. Toolchain requirements

| Target | Required | Notes |
|---|---|---|
| Website | **nothing** | static copy; no build step at all |
| Python core / `.exe` | Python 3.10+, `numpy`, `fastapi`, `uvicorn`, `pydantic`, `pyinstaller` | `python -m pip install -r apps/soe-core/requirements.txt` |
| `.apk` | JDK 17+, Android SDK build-tools 34.0.0 + `platforms;android-34` | Gradle **not** required |
| PWA | Node 20+, `pnpm` 9+ | `pnpm install && pnpm build` |
| Tauri | Rust stable + Node | `pnpm tauri build` |
| Docker | Docker Engine / Desktop | `docker compose up -d --build` |

---

## 1. Website (`dist/website`)

```powershell
node tools\build-portal.mjs
```

Copies `apps/web-portal` → `dist/website`, asserts all 14 required PWA files exist, greps
`index.html` for the vortex shader / matrix layer / HUD / SOE bridge / service-worker
registration, and writes `dist/website.SHA256.txt`.

```
[portal] OK all 14 required files present
[portal] 15 files, 260076 bytes
```

Serve it:

```powershell
python -m http.server 8080 --directory dist\website    # -> http://127.0.0.1:8080
start dist\website\index.html                          # works from file:// too
```

---

## 2. Windows executable (`dist/windows/SovereignPortalC137.exe`)

```powershell
powershell -ExecutionPolicy Bypass -File windows\build-exe.ps1 -SkipInstall -Console
```

The script runs PyInstaller against `apps/soe-core/desktop_launcher.py`:

| Flag | Why |
|---|---|
| `--onefile` | single portable binary |
| `--add-data "<apps/web-portal>;web"` | the bundle is resolved as `sys._MEIPASS/web` — the first candidate in `resolve_web_root()` |
| `--paths apps/soe-core` + `--hidden-import gateway/soe_core/voice_omega/rick_persona` | the launcher imports sibling modules that PyInstaller cannot infer |
| `--collect-submodules uvicorn` | uvicorn loads its protocol/loop implementations dynamically |
| `--console` / `--windowed` | console shows the banner and portal URL; windowed is silent |

Output:

```
dist/windows/SovereignPortalC137.exe    24.44 MB
dist/windows/web/                       website staged for hot-patching
dist/windows/SHA256.txt
```

Run and verify:

```powershell
dist\windows\SovereignPortalC137.exe                 # opens the browser at the portal
dist\windows\SovereignPortalC137.exe --no-browser --port 8479
Invoke-WebRequest http://127.0.0.1:8479/health
dist\windows\SovereignPortalC137.exe --audit         # runs ORC-001 and exits
```

`resolve_web_root()` searches, in order: `sys._MEIPASS/web`, `<cwd>/web`,
`<cwd>/../../dist/website`, `<exe dir>/web`.

> **Windowed builds.** PyInstaller `--windowed` sets `sys.stdout`/`sys.stderr` to `None`,
> which breaks uvicorn's `StreamHandler`. `desktop_launcher.py` rebinds both to `os.devnull`
> before importing anything, so both modes work.

An NSIS installer script is provided at `windows/installer.nsi`
(`OutFile Builds\PortalC137_Setup_x64.exe`).

---

## 3. Android package (`dist/android/SovereignPortalC137.apk`)

```powershell
python tools\build_apk.py
```

`tools/build_apk.py` assembles a real, signed APK **without Gradle**, in the classic
five-stage pipeline:

| Stage | Tool | Result |
|---|---|---|
| 1 | `aapt2 compile --dir res -o resources.zip` | compiled `.flat` resource table |
| 2 | `aapt2 link … --auto-add-overlay -A assets` | `unsigned.apk` (manifest, `resources.arsc`, `res/`, `assets/`) |
| 3 | `javac -source 8 -target 8 -classpath android.jar` | 12 class files |
| 4 | `d8 --min-api 24` | `classes.dex` (14.5 KB) |
| 5 | `zipalign -p 4` → `apksigner sign` → `apksigner verify` | signed, aligned APK |

It stages a scratch tree in `%TEMP%` and applies three transformations:

1. **Manifest package** — Gradle normally injects the identifier from `namespace`; aapt2
   requires `package="com.rickc137.portal"`, so it is written in.
2. **Theme parent** — `Theme.AppCompat.NoActionBar` → `android:Theme.Material.NoActionBar`,
   and `colorPrimary`/`colorPrimaryDark`/`colorAccent` → their `android:` equivalents. This
   removes the only AndroidX dependency from the resource graph.
3. **API 24–25 launcher icon** — adds `mipmap-hdpi/ic_launcher.png` so the icon resolves
   below API 26 (where adaptive icons do not exist).

It compiles the framework-only shell in `apps/native-android/apk-fallback/java`, which
implements the same `SovereignBridge` JavascriptInterface contract as the Kotlin shell.

Result:

```
APK       : dist/android/SovereignPortalC137.apk
size      : 263,623 bytes (0.25 MB)
sha256    : 7c4f3e1b7d0caec92b75ff17308a0848b8eb87e2f39194042f00018126142d64
signature : Verifies
```

Install:

```powershell
adb install -r dist\android\SovereignPortalC137.apk
```

### Gradle path (canonical Kotlin app)

`apps/native-android` is a normal Gradle project (Kotlin + AndroidX, `MainActivity.kt`,
`security/HardenedBridge.kt`, `sovereign/B2dTargetAgent.kt`):

```powershell
cd apps\native-android
gradle wrapper --gradle-version 8.7     # one-off, gradlew is not committed
.\gradlew assembleDebug                 # -> app/build/outputs/apk/debug/app-debug.apk
.\gradlew assembleRelease
```

That path needs the Android Gradle Plugin and therefore network access to resolve AndroidX.
The Gradle-free script exists precisely so the APK can still be produced without it.

---

## 4. PortableApps (PAF)

```powershell
python apps\portable-builder\paf_builder.py --source dist\website --output dist\portable --zip
```

Produces the PAF 1.0 tree — `App/AppInfo/appinfo.ini`, isolated `Data/settings`,
`Other/help`, Windows `.bat` + POSIX `.sh` + Termux launchers and a `SHA256.txt` manifest.
A Tkinter 5-panel GUI builder is available at `apps/portable-builder/builder_ui.py`
(requires `tkinter`, absent from some minimal Python builds).

---

## 5. Python core

```powershell
python -m pip install -r apps\soe-core\requirements.txt
python -m pytest apps\soe-core\tests -q      # 62 passed
python apps\soe-core\run_audit.py            # ORC-001 -> JSON report
python apps\soe-core\desktop_launcher.py     # gateway + browser
```

---

## 6. React PWA

```powershell
pnpm install
pnpm --filter @portal/web-pwa build     # -> apps/web-pwa/dist
pnpm --filter @portal/web-pwa dev       # -> http://localhost:5173
```

`vite.config.ts` wires React 19, `vite-plugin-pwa`, and the COOP/COEP headers the WebGPU
runtimes need.

---

## 7. Docker

```powershell
docker compose -f docker\docker-compose.yml up -d --build       # portal + postgres + dendrite
docker compose -f docker\docker-compose.prod.yml up -d --build  # ollama + orchestrator + prometheus
```

---

## 8. Full sweep

```powershell
node tools\build-portal.mjs
powershell -File windows\build-exe.ps1 -SkipInstall -Console
python tools\build_apk.py
python apps\portable-builder\paf_builder.py --source dist\website --output dist\portable
node tools\make-dist.mjs
```

`make-dist.mjs` reports which artifacts exist, writes `dist/ARTIFACTS.md` and
`dist/SHA256SUMS.txt`, and exits non-zero if a **required** artifact (website, exe, apk) is
missing — a missing artifact is never silently skipped.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `desktop_launcher.py not found at C:\apps\...` | `$PSScriptRoot` is empty inside a `param()` default under PowerShell 5.1 | the script now resolves the root in the body; do not move it back into `param()` |
| `Unexpected token '}'` parsing a `.ps1` | em dashes / smart quotes in a UTF-8 file read as cp1252 | keep `windows\build-exe.ps1` ASCII-only |
| `No Android SDK found` | SDK not in `ANDROID_HOME` | set `ANDROID_HOME`, or place one at `<_toolchain>\android-sdk` |
| `<manifest> must have a 'package' attribute` | Gradle supplies it from `namespace` | handled automatically by `build_apk.py` |
| `resource X does not override an existing resource` | base table treated as an overlay | `--auto-add-overlay` (already passed) |
| `style attribute 'attr/colorPrimary' not found` | AppCompat attribute under a framework theme | remapped to `android:colorPrimary` |
| exe starts but the port never opens | windowed build with `sys.stdout is None` | already fixed by the null-stream guard in `desktop_launcher.py` |
