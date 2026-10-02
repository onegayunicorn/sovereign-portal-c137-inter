# @portal/config

Shared build configuration for the **Sovereign Portal C-137** monorepo.
Zero runtime dependencies — every file is source-only and consumes peer tools
(`eslint`, `tailwindcss`, `vite`) that the *consumer* workspace already installs.

## Exports

| Specifier | File | Purpose |
| --- | --- | --- |
| `@portal/config` | `vite-preset.js` | Default export = Vite config factory |
| `@portal/config/vite-preset` | `vite-preset.js` | `createViteConfig`, COOP/COEP + model cache headers |
| `@portal/config/eslint-preset` | `eslint-preset.js` | ESLint 9 flat-config array |
| `@portal/config/tailwind-preset` | `tailwind-preset.js` | Tailwind preset + `themeBlock()` generator |

## Palette (non-negotiable)

| Token | Value | Usage |
| --- | --- | --- |
| `portal.green` | `#00ff88` | primary HUD text, vortex core, hot borders |
| `portal.yellow` | `#d4ff00` | high-voltage accents, waveform peaks, CV tracks |
| `hud.cyan` | `#00e5ff` | secondary headers, branch modals, telemetry captions |
| `hud.alert` | `#ff0055` | faults, flux-decay warnings, destructive actions |
| `void` | `#020b05` | application background |

Dimension `C-137` · resonance `1207 Hz` · stability `99.87%`.

## Vite

```ts
// apps/web-pwa/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createViteConfig } from '@portal/config/vite-preset';

export default defineConfig(
  createViteConfig({
    plugins: [react()],
    port: 5173,
    isolate: true, // Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy
  }),
);
```

The factory sets:

- `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`
  on both `server` and `preview` — required for WebGPU `SharedArrayBuffer` and
  the MLC/ONNX WASM threads.
- `optimizeDeps.exclude` for every `@portal/*` workspace package so their TS
  sources are compiled by Vite rather than pre-bundled.
- `assetsInclude` for `.glb`, `.gltf`, `.vrm`, `.frag`, `.vert`, `.wasm`.
- Manual chunk splitting (`react`, `three`, `r3f`) to keep the PWA shell small.

## ESLint

```js
// eslint.config.js
import portalPreset from '@portal/config/eslint-preset';

export default portalPreset;
```

The preset is resilient: TypeScript and React rule blocks are only appended when
`@typescript-eslint/*`, `eslint-plugin-react` and `eslint-plugin-react-hooks` are
resolvable, so a partial install never hard-fails the lint task.

`sovereignGuardRules` fails the build on `TODO` / `FIXME` / `placeholder` /
`your-code-here` comments — placeholders are not allowed to ship in this codebase.

## Tailwind

```ts
// tailwind.config.ts
import preset from '@portal/config/tailwind-preset';

export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
};
```

For Tailwind v4, generate the `@theme` block instead:

```js
import { themeBlock } from '@portal/config/tailwind-preset';
import { writeFileSync } from 'node:fs';
writeFileSync('src/theme.generated.css', themeBlock());
```
