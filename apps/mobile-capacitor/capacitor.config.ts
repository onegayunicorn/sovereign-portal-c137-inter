import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 6 configuration — Sovereign Portal C-137 mobile shells (iOS + Android).
 *
 * The web bundle produced by `apps/web-pwa` (Vite) is copied into the native
 * projects by `npx cap sync`, so the same React 19 PWA runs natively with access to
 * the Haptics and Camera plugins.
 */
const config: CapacitorConfig = {
  appId: "com.rickc137.portal",
  appName: "Portal C-137",
  webDir: "../../apps/web-pwa/dist",
  bundledWebRuntime: false,

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: "#020b05"
  },

  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
    backgroundColor: "#020b05",
    preferredContentMode: "mobile"
  },

  server: {
    androidScheme: "https",
    iosScheme: "capacitor",
    hostname: "localhost",
    cleartext: false
  },

  plugins: {
    Haptics: {
      // Portal resonance feedback — mirrored on both platforms
      enabled: true
    },
    Camera: {
      permissions: {
        camera: "Sovereign Portal C-137 uses the camera for portal-AR capture.",
        photos: "Sovereign Portal C-137 saves portal snapshots to your library.",
        microphone: "Sovereign Portal C-137 uses the microphone for the VoiceΩ twin command hub."
      }
    },
    SplashScreen: {
      backgroundColor: "#020b05",
      showSpinner: false,
      launchAutoHide: true
    }
  }
};

export default config;
