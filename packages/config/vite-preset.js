/**
 * @portal/config — shared Vite configuration factory.
 * Sovereign Portal C-137 monorepo.
 *
 * Usage (`apps/web-pwa/vite.config.ts`):
 *   import { createViteConfig } from '@portal/config/vite-preset';
 *   import react from '@vitejs/plugin-react';
 *   export default createViteConfig({ plugins: [react()] });
 *
 * The factory is dependency-free (no direct imports of `vite` or
 * `vite-plugin-pwa`), so it can be consumed by any workspace without
 * duplicating plugin versions.
 */

/** Cross-origin isolation headers required by WebGPU + SharedArrayBuffer. */
export const COOP_COEP_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

/** Immutable caching for the quantized model + shader assets. */
export const MODEL_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
};

const DEFAULT_WORKSPACE_PACKAGES = [
  '@portal/matrix-engine',
  '@portal/offline-ai',
  '@portal/hud-overlay-system',
  '@portal/video-engine',
  '@portal/graphics-engine',
  '@portal/ui-core',
];

/**
 * Creates a production-grade Vite config for the Sovereign Portal.
 *
 * @param {object} [options]
 * @param {any[]} [options.plugins] Extra Vite plugins (e.g. react(), PWA).
 * @param {number} [options.port] Dev server port. Default 5173.
 * @param {string} [options.base] Public base path. Default '/'.
 * @param {string[]} [options.workspacePackages] Packages excluded from optimizeDeps.
 * @param {Record<string, string>} [options.aliases] Extra `resolve.alias` entries.
 * @param {boolean} [options.isolate] Inject COOP/COEP headers. Default true.
 * @param {Record<string, any>} [options.overrides] Deep-ish overrides merged last.
 * @returns {Record<string, any>} A Vite user config object.
 */
export function createViteConfig(options = {}) {
  const {
    plugins = [],
    port = 5173,
    base = '/',
    workspacePackages = DEFAULT_WORKSPACE_PACKAGES,
    aliases = {},
    isolate = true,
    overrides = {},
  } = options;

  return {
    base,
    plugins,
    resolve: {
      alias: {
        '@': '/src',
        ...aliases,
      },
    },
    server: {
      port,
      strictPort: false,
      host: true,
      headers: isolate ? COOP_COEP_HEADERS : {},
      fs: {
        // pnpm workspaces live one level above apps/*.
        allow: ['..', '../..', '../../..'],
      },
    },
    preview: {
      port: port + 1000,
      headers: isolate ? COOP_COEP_HEADERS : {},
    },
    optimizeDeps: {
      // Workspace TS sources are compiled by Vite directly, not pre-bundled.
      exclude: workspacePackages,
      esbuildOptions: {
        target: 'es2022',
      },
    },
    esbuild: {
      target: 'es2022',
      legalComments: 'none',
    },
    build: {
      target: 'es2022',
      outDir: 'dist',
      sourcemap: false,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 2048,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
            react: ['react', 'react-dom'],
          },
        },
      },
    },
    assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.vrm', '**/*.frag', '**/*.vert', '**/*.wasm'],
    worker: {
      format: 'es',
    },
    ...overrides,
  };
}

export default createViteConfig;
