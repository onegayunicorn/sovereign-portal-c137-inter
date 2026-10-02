# Deployment guide

Nine deployment targets. Cross-origin isolation (COOP `same-origin` + COEP `require-corp`)
and the CSP with `wasm-unsafe-eval` are mandatory everywhere the WebGPU runtimes are used —
they are already configured for every host below.

---

## 1. Cloudflare Pages (fastest)

```bash
npx wrangler login
npx wrangler pages deploy dist/website --project-name rick-portal-ui
```

Header and redirect rules come from `dist/website/_headers`.

---

## 2. GitHub Pages (automated)

`.github/workflows/deploy-html.yml` publishes `apps/web-portal` on every push to `main`.

```yaml
permissions: { contents: read, pages: write, id-token: write }
```

Manual equivalent:

```bash
git subtree push --prefix apps/web-portal origin gh-pages
```

> GitHub Pages cannot set COOP/COEP. The portal degrades to WebGL2 shaders automatically;
> only the offline WebGPU inference runtimes are unavailable there.

---

## 3. Vercel

```bash
cd apps/web-portal && npx vercel --prod
```

`vercel.json` supplies the isolation headers, `Accept-Ranges` + immutable caching for
`/models/*`, a `no-cache` rule for `sw.js`, and the SPA rewrite. `buildCommand` and
`installCommand` are `null` because nothing needs building.

For the React PWA instead:

```bash
npx vercel link
npx vercel env add DATABASE_URL production
npx vercel env add GITHUB_GIST_TOKEN production
pnpm dlx vercel --prod
```

---

## 4. Netlify

```bash
npx netlify deploy --prod --dir=dist/website
```

`netlify.toml` mirrors the same header set. `publish = "."`, `command = ""` — zero build.

---

## 5. Self-hosted nginx (Docker)

```bash
docker build -t sovereign-portal-c137 ./apps/web-portal
docker run -d -p 8080:80 --name rick_portal sovereign-portal-c137
# -> http://127.0.0.1:8080
```

The image is `nginx:1.27-alpine-slim`, runs as the unprivileged `nginx` user and health-checks
itself. `apps/web-portal/nginx.conf` adds:

- COOP/COEP/CORP and the full CSP
- gzip including `application/wasm`, `model/gltf-binary`
- `/models/` → `Accept-Ranges`, `no-transform`, `immutable`, buffering off
- `sw.js` → `no-store`
- reverse-proxy blocks for `/health`, `/orchestrate/`, `/audit/`, `/voice/` to the
  `soe-orchestrator` sidecar

### Full sovereign stack

```bash
echo "DB_PASSWORD=$(openssl rand -hex 16)" > .env
docker compose -f docker/docker-compose.yml up -d --build
docker compose -f docker/docker-compose.prod.yml up -d --build   # + ollama GPU + prometheus
docker compose ps
```

| Service | Port | Role |
|---|---|---|
| `portal-ui` | 8080 | hardened nginx serving the portal |
| `postgres-db` | 5432 | Prisma relational authority |
| `matrix-dendrite` | 8448 | decentralised twin-state federation |
| `llm-core` | 11434 | Ollama, Rick C-137 persona model |
| `soe-orchestrator` | 8000 | FastAPI gateway + 12 Merkle-chained engines |
| `prometheus` | 9090 | Merkle integrity, decoherence Γ, Schumann tracking |

---

## 6. Windows executable

```powershell
dist\windows\SovereignPortalC137.exe                       # browser opens automatically
dist\windows\SovereignPortalC137.exe --no-browser --port 8000
dist\windows\SovereignPortalC137.exe --audit               # ORC-001 report, then exit
```

The exe binds loopback only and serves both the portal and the gateway, so the browser and the
API share an origin — no CORS configuration is needed.

Installer:

```powershell
makensis windows\installer.nsi        # -> Builds\PortalC137_Setup_x64.exe
```

`installer.nsi` installs per-user to `%LOCALAPPDATA%\SovereignPortal`, creates Start Menu and
Desktop shortcuts, and registers a clean uninstaller.

---

## 7. Android

```powershell
adb install -r dist\android\SovereignPortalC137.apk
adb shell am start -n com.rickc137.portal/.MainActivity
```

The APK is debug-signed (CN=Android Debug). For distribution, re-sign with a release key:

```powershell
$tools = "<android-sdk>\build-tools\34.0.0"
& "$tools\zipalign.exe" -f -p 4 dist\android\SovereignPortalC137.apk release-aligned.apk
& "$tools\apksigner.bat" sign --ks release.jks --out SovereignPortalC137-release.apk release-aligned.apk
& "$tools\apksigner.bat" verify --print-certs SovereignPortalC137-release.apk
```

Distribution channels: direct APK, F-Droid, or Play Store (AAB via the Gradle path).

---

## 8. Desktop (Tauri / Electron)

```bash
pnpm --filter @portal/web-pwa build
cd apps/desktop-tauri && pnpm tauri build
#   Windows  src-tauri/target/release/bundle/nsis/*.exe
#            src-tauri/target/release/bundle/msi/*.msi
#   macOS    .../dmg/*.dmg          Linux  .../appimage/*.AppImage

cd apps/desktop-electron && pnpm electron-builder
#   -> dist-electron/*.exe (NSIS installer + portable)
```

Both shells mount the same HMAC-signed bridge
(`command:nonce:timestamp:payload`, UUIDv4 nonce, ±3000 ms window).

---

## 9. Air-gapped / offline

Nothing in the portal touches the network. Deploy by copying a single directory:

```powershell
xcopy /E /I dist\website D:\PortalC137
start D:\PortalC137\index.html          # works with no server at all
```

Or from a USB stick via the PortableApps package:

```powershell
python apps\portable-builder\paf_builder.py --source dist\website --output dist\portable --zip
# copy dist\portable\PortalC137Portable_1.0.0\ to the USB drive
```

`Data/settings` holds all state, so the package leaves nothing in `%APPDATA%` or the registry.

---

## 10. Cache & upgrade notes

| Asset | Policy | Consequence |
|---|---|---|
| `sw.js` | `no-store` | service-worker updates land immediately |
| hashed assets | `immutable`, 1 year | content-addressed, safe to pin |
| `/models/*` | `immutable` + `Accept-Ranges` | weights stream in byte ranges, resumable |
| `index.html` | revalidated | new releases appear on reload |
| gateway API | **never cached** | `sw.js` skips `/health`, `/orchestrate/`, `/audit/`, `/voice/`, `/telemetry/` |

To purge cached model weights after a model swap:

```js
navigator.serviceWorker.controller.postMessage({ type: "PURGE_MODELS" });
```
