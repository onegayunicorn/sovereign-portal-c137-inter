# `@portal/desktop-electron` — Sovereign Portal C-137 (Electron)

Electron desktop shell for **Sovereign Portal C-137**, producing a Windows **NSIS
installer** and a **single-file portable `.exe`** via `electron-builder`, alongside
macOS `.dmg` and Linux `.AppImage` targets.

## Layout

```
apps/desktop-electron/
├── main.ts               # §13.2.1 — BrowserWindow + hardened HMAC IPC handler
├── preload.ts            # §13.2.2 — contextBridge → SovereignElectronBridge
├── electron-builder.yml  # §13.2.3 — nsis + portable targets
├── package.json          # electron + electron-builder scripts
├── tsconfig.json
├── build/icon.png        # app icon (512×512)
└── README.md
```

## Hardened IPC bridge

`main.ts` registers `ipcMain.handle("sovereign-bridge-ipc", …)` with three gates:

1. **Timestamp window** — rejects envelopes drifting more than `5000 ms`.
2. **Nonce anti-replay** — a `Set<string>` of consumed nonces.
3. **HMAC-SHA256** — `command:JSON(payload):timestamp:nonce` signed with the shared
   session secret (`SOVEREIGN_SUPER_SECRET_HMAC_KEY_2026`).

Commands: `APP_MINIMIZE`, `APP_CLOSE` (all others are acknowledged as
`PROCESSED_NATIVELY`). The renderer reaches the bridge only through the isolated
`preload.ts` context bridge — `nodeIntegration: false`, `contextIsolation: true`,
`sandbox: true`.

## Build

```bash
pnpm install
pnpm --filter @portal/desktop-electron run build:ts   # tsc → main.js / preload.js
pnpm --filter @portal/desktop-electron run dist       # electron-builder --win
```

Output in `dist-electron/`:

- `SovereignPortalC137 Setup 1.0.0.exe` (NSIS, `oneClick: false`)
- `SovereignPortalC137 1.0.0.exe` (portable)

## Notes

- `electron-builder.yml` references `build/icon.ico` and `build/splash.png`; generate
  an `.ico` (e.g. from `../desktop-tauri/src-tauri/icons/icon.ico`) and a splash image
  before Windows packaging.
- `main.js` / `preload.js` are emitted next to the sources (`outDir: "."`) so the
  packaged `files:` globs resolve as written in the blueprint.
