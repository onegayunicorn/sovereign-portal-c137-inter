# `@portal/mobile-capacitor` — Sovereign Portal C-137 (Capacitor 6)

Wraps the React 19 PWA (`apps/web-pwa`) in native iOS and Android shells using
**Capacitor 6**, with the **Haptics** and **Camera** plugins bridged to the portal UI.

## Layout

```
apps/mobile-capacitor/
├── capacitor.config.ts   # appId com.rickc137.portal, appName "Portal C-137"
├── package.json          # @capacitor/core|cli|android|ios|haptics|camera
├── tsconfig.json
├── android/README.md     # generated Android project notes
├── ios/README.md         # generated iOS project notes
└── README.md
```

## Configuration

| Key | Value |
| --- | --- |
| `appId` | `com.rickc137.portal` |
| `appName` | `Portal C-137` |
| `webDir` | `../../apps/web-pwa/dist` |
| `plugins` | `Haptics`, `Camera`, `SplashScreen` |
| Android scheme | `https` (so `navigator.gpu` / secure-context APIs work) |
| iOS content mode | `mobile`, app-bound domains enforced |

## Build

```bash
pnpm install

# 1. Produce the web bundle the native shells embed
pnpm --filter @portal/web-pwa build

# 2. Create the native projects (first run only)
npx cap add android
npx cap add ios

# 3. Copy web assets + plugin code into the native projects
npx cap sync

# 4. Open in the platform IDE
npx cap open android      # Android Studio
npx cap open ios          # Xcode
```

## Plugin usage

```ts
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Camera, CameraResultType } from "@capacitor/camera";

// Portal resonance feedback
await Haptics.impact({ style: ImpactStyle.Medium });

// Portal-AR snapshot
const photo = await Camera.getPhoto({
  resultType: CameraResultType.Uri,
  quality: 92
});
```

The portal's `HardenedBridgeClient` degrades gracefully when no native bridge is
present, so the same bundle also runs as a plain PWA. See `android/README.md` and
`ios/README.md` for platform-specific notes.
