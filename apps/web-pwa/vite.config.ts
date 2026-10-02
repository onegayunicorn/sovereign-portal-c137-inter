import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createViteConfig } from '@portal/config/vite-preset';

/**
 * Sovereign Portal C-137 — web PWA build.
 *
 * `createViteConfig` supplies the cross-origin isolation headers (COOP/COEP)
 * required by WebGPU + SharedArrayBuffer WASM threads; this file adds the React
 * plugin, the PWA manifest/service-worker generator and the workspace aliases.
 */
export default defineConfig(
  createViteConfig({
    port: 5173,
    isolate: true,
    aliases: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    plugins: [
      react(),
      VitePWA({
        // The hardened range-request worker lives in `public/sw.js` and is
        // shipped verbatim. `injectManifest` would overwrite it, so the plugin
        // only owns the manifest + registration surface.
        strategies: 'generateSW',
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: false,
        filename: 'pwa-sw.js',
        includeAssets: [
          'icons/icon.svg',
          'shaders/portal.frag',
          'shaders/crt-overlay.frag',
          'manifest.json',
        ],
        workbox: {
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,svg,json,frag,vert,wasm}'],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          // Model weights are handled by `public/sw.js` range caching instead.
          globIgnores: ['**/models/**', '**/sw.js', '**/pwa-sw.js'],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
  }),
);
