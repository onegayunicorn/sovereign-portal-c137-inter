# Capacitor — iOS shell

This directory is the **generated** Capacitor iOS project. It is produced by:

```bash
npx cap add ios
npx cap sync ios
```

Regeneration requires macOS + Xcode; the config lives in `capacitor.config.ts`.

## Expected contents after generation

```
ios/
├── App/
│   ├── App.xcodeproj
│   ├── App/
│   │   ├── public/                 # ← copied from ../../apps/web-pwa/dist
│   │   ├── Info.plist
│   │   └── AppDelegate.swift
│   └── Podfile
└── capacitor-cordova-ios-plugins/
```

## Applied settings

| Setting | Value |
| --- | --- |
| `appId` | `com.rickc137.portal` |
| `appName` | `Portal C-137` |
| `iosScheme` | `capacitor` |
| `contentInset` | `always` |
| `preferredContentMode` | `mobile` |
| `limitsNavigationsToAppBoundDomains` | `true` |
| `backgroundColor` | `#020b05` |

## Required Info.plist usage strings

`npx cap sync` merges the plugin permission text configured under
`plugins.Camera.permissions` into `Info.plist`:

- `NSCameraUsageDescription`
- `NSPhotoLibraryAddUsageDescription`
- `NSMicrophoneUsageDescription`

## Build

```bash
npx cap sync ios
npx cap open ios     # Xcode
# ⌘R to run, Product ▸ Archive to distribute
```

## Notes

- Requires macOS with Xcode 15+ and CocoaPods.
- WebGPU in `WKWebView` needs iOS 17.4+; the portal falls back to WebGL2
  automatically on older versions.
