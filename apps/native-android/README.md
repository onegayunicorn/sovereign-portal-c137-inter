# `native-android` — Sovereign Portal C-137 (native Kotlin APK)

A complete native Android Gradle project that wraps the Sovereign Portal C-137 web
bundle in a hardened `WebView` shell and builds an installable APK. No React Native,
no Capacitor — just Kotlin + AndroidX.

## Layout

```
apps/native-android/
├── settings.gradle.kts            # rootProject "SovereignPortalC137", includes :app
├── build.gradle.kts               # AGP 8.5.2 + Kotlin 1.9.24 (apply false)
├── gradle.properties              # AndroidX, jvmargs, sovereign build metadata
├── README.md
└── app/
    ├── build.gradle.kts           # applicationId com.rickc137.portal, minSdk 24, target/compileSdk 34
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml    # INTERNET, VIBRATE, RECORD_AUDIO; launcher activity
        ├── assets/index.html      # PLACEHOLDER — overwritten by the real portal
        ├── java/com/rickc137/portal/
        │   ├── MainActivity.kt             # WebView + WebViewAssetLoader + JavascriptInterface
        │   ├── security/HardenedBridge.kt  # zero-trust HMAC + nonce + allowlist bridge
        │   └── sovereign/B2dTargetAgent.kt # AOA/OMAPI B2D-Bridge v4.2 target agent
        └── res/
            ├── layout/activity_main.xml
            ├── drawable/ic_launcher_foreground.xml
            ├── mipmap-anydpi-v26/ic_launcher.xml
            ├── values/{strings,themes,colors,ic_launcher_background}.xml
            └── xml/{backup_rules,data_extraction_rules}.xml
```

## Build

> **`gradlew` / `gradlew.bat` are intentionally NOT committed.** Generate the wrapper
> once with a local Gradle 8.x install:
>
> ```bash
> gradle wrapper --gradle-version 8.7
> ```
>
> After that the standard wrapper commands work.

```bash
# Debug APK (debug-signed, installable immediately)
./gradlew assembleDebug
#  → app/build/outputs/apk/debug/app-debug.apk

# Release APK (unsigned — no signing config by design)
./gradlew assembleRelease
#  → app/build/outputs/apk/release/app-release-unsigned.apk

# Install directly to a connected device
./gradlew installDebug
# or:
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Sign the release APK afterwards with `apksigner` + `zipalign`.

### Requirements

| Tool | Version |
| --- | --- |
| JDK | 17 |
| Gradle | 8.7 (via wrapper) |
| Android Gradle Plugin | 8.5.2 |
| Kotlin | 1.9.24 |
| compileSdk / targetSdk | 34 |
| minSdk | 24 (Android 7.0) |
| Android SDK Build-Tools | 34.0.0 |

Dependencies: `androidx.appcompat:1.7.0`, `androidx.webkit:1.11.0`,
`androidx.core:core-ktx:1.13.1`. Release build has **minification off** and **no
signing config**, exactly as specified.

## Native bridge surfaces

| JS global | Kotlin class | Window | Commands |
| --- | --- | --- | --- |
| `SovereignAndroidBridge` | `MainActivity.SovereignAndroidBridge` | ±5000 ms | `DEVICE_HAPTIC`, `STORAGE_WRITE_SECURE`, `SYSTEM_INFO` |
| `SovereignBridge` | `security.HardenedBridge` | ±3000 ms | `TRIGGER_HAPTIC`, `READ_BATTERY_TELEMETRY`, `READ_HARDWARE_SENSORS`, `SYNC_LOCAL_STATE` |

Both enforce HMAC-SHA256 signatures, one-shot nonce anti-replay, and a strict
allowlist. Signature canonicalisation matches each blueprint source:
`command:payload:timestamp:nonce` (MainActivity) and
`command:nonce:timestamp:payload` (`HardenedBridge`).

## Asset serving

The portal is served from `assets/` through `androidx.webkit.WebViewAssetLoader` on the
synthetic origin `https://appassets.androidplatform.net/assets/index.html`. This gives a
real HTTPS origin (no `file://` CORS issues) while remaining fully offline/air-gapped.

`app/src/main/assets/index.html` is a **placeholder** that is overwritten by the real
portal during the build.

## Notes

- `B2dTargetAgent.kt` implements the B2D-Bridge v4.2 target daemon: AOA bulk framing,
  OMAPI/eUICC ISD-R APDU access (API 28+), and `/dev/uinput` HID injection. HID injection
  and OMAPI require a privileged target / secure element and fail closed otherwise.
- Not compiled here: no JDK 17 + Android SDK were available in this environment, so the
  APK was not produced — the Gradle/Kotlin sources are complete and ready to build.
