# Capacitor — Android shell

This directory is the **generated** Capacitor Android project. It is produced by:

```bash
npx cap add android
npx cap sync android
```

Do not hand-edit generated files where a Capacitor config option exists; change
`capacitor.config.ts` and re-run `npx cap sync` instead.

## Expected contents after generation

```
android/
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── assets/public/          # ← copied from ../../apps/web-pwa/dist
├── build.gradle
├── gradle.properties
├── gradlew / gradlew.bat
└── settings.gradle
```

## Applied settings

| Setting | Value |
| --- | --- |
| `appId` | `com.rickc137.portal` |
| `appName` | `Portal C-137` |
| `androidScheme` | `https` |
| `allowMixedContent` | `false` |
| `captureInput` | `true` |
| `webContentsDebuggingEnabled` | `false` (release hardening) |
| `backgroundColor` | `#020b05` |

## Required permissions

`npx cap sync` injects the plugin permissions automatically:

- `android.permission.VIBRATE` (Haptics)
- `android.permission.CAMERA` + `android.permission.RECORD_AUDIO` (Camera)
- `android.permission.READ_MEDIA_IMAGES` / `WRITE_EXTERNAL_STORAGE` (Camera, API-gated)
- `android.permission.INTERNET`

## Build

```bash
cd android
./gradlew assembleDebug     # debug APK
./gradlew assembleRelease   # release APK (configure signing in app/build.gradle)
# output: app/build/outputs/apk/<variant>/app-<variant>.apk
```

## Notes

- `webDir` (`../../apps/web-pwa/dist`) must be built before `npx cap copy`/`sync`,
  otherwise the shell embeds an empty `assets/public/`.
- For a native Kotlin shell that does **not** depend on Capacitor, see
  `apps/native-android/`.
