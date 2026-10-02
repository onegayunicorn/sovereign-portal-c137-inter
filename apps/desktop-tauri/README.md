# `@portal/desktop-tauri` — Sovereign Portal C-137 (Tauri v2)

High-performance native desktop shell built on **Tauri v2 + Rust**. Uses the OS
WebView2 / WKWebView / WebKitGTK runtime with a hardened Rust IPC bridge instead of
bundling a whole browser, producing ~5–8 MB `.exe` binaries with native Direct3D /
Metal / Vulkan / WebGPU rendering.

## Layout

```
apps/desktop-tauri/
├── package.json                 # pnpm scripts (tauri dev / build)
├── dist-placeholder/README.md   # placeholder frontendDist target for CI/dev
└── src-tauri/
    ├── Cargo.toml               # §13.1.1 — release profile lto/strip/opt-level=z
    ├── build.rs                 # tauri_build::build()
    ├── tauri.conf.json          # §13.1.2 — nsis + portable, transparent frameless window
    ├── capabilities/default.json
    ├── icons/                   # 32/128/128@2x/256 PNGs + icon.ico + make_icons.py
    └── src/main.rs              # §13.1.3 Rust HMAC-SHA256 hardened bridge
```

## Hardened bridge

`src/main.rs` exposes the `sovereign_bridge` Tauri command. Every envelope is validated:

1. **Timestamp window** — rejects anything drifting more than `5000 ms`.
2. **Nonce anti-replay** — single-use nonces tracked in a `Mutex<HashSet<String>>`.
3. **HMAC-SHA256** — signature over `command:payload:timestamp:nonce` using `ring`.

Supported commands: `SYSTEM_INFO`, `FORCE_MINIMIZE`, `DEVICE_HAPTIC`,
`STORAGE_WRITE_SECURE`. A companion `minimize_window` command drives the frameless
window chrome.

## Build

```bash
pnpm install
pnpm --filter @portal/desktop-tauri tauri build
# or explicitly:
pnpm --filter @portal/desktop-tauri tauri build --target x86_64-pc-windows-msvc
```

Artifacts land in `src-tauri/target/<target-triple>/release/bundle/`:

- `nsis/*.exe` — interactive NSIS installer
- `portable/*.exe` — single-file portable executable
- `msi/`, `dmg/`, `appimage/` — other platforms

Regenerate icons at any time:

```bash
python src-tauri/icons/make_icons.py
```

## Notes

- `build.frontendDist` points at `../../web/dist`; the shipped portal can be staged
  into `dist-placeholder/` for a dependency-free smoke build by pointing
  `frontendDist` there.
- Requires the Rust stable toolchain (`rustup`) and the MSVC build tools on Windows.
