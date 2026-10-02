# dist-placeholder

This directory is a placeholder target for Tauri's `build.frontendDist`.

The real frontend is produced by the web app (`apps/web-pwa` → `dist/`) and copied
here (or referenced directly) at build time. Keeping an `index.html` in this folder
lets `tauri build` succeed in air-gapped CI when the web bundle has not been built yet.

To use it, set in `src-tauri/tauri.conf.json`:

```json
"build": { "frontendDist": "../dist-placeholder" }
```

Nothing here is shipped to production; the real portal overwrites this content.
