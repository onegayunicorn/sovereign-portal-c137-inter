// =============================================================================
// PwaConverterService — in-app /convert engine (raw HTML -> installable PWA)
// -----------------------------------------------------------------------------
// Implements the blueprint §4.1 pipeline exactly:
//   1. Generate a compliant Web App Manifest
//   2. Generate an offline-first Service Worker (install + cache-first fetch)
//   3. Inject <link rel="manifest">, theme-color meta, and SW registration into
//      the raw HTML (before </head> when present, otherwise prepended).
// =============================================================================

export interface PwaConvertOptions {
  appName: string;
  shortName: string;
  themeColor: string;
  backgroundColor: string;
  offlineFallback: boolean;
}

export interface PwaConvertResult {
  indexHtml: string;
  manifest: string;
  serviceWorker: string;
}

export const DEFAULT_PWA_OPTIONS: PwaConvertOptions = {
  appName: "Sovereign App",
  shortName: "SovApp",
  themeColor: "#00ff88",
  backgroundColor: "#010804",
  offlineFallback: true,
};

export class PwaConverterService {
  static convertRawHtml(rawHtml: string, options: PwaConvertOptions): PwaConvertResult {
    const opts: PwaConvertOptions = { ...DEFAULT_PWA_OPTIONS, ...options };

    // 1. Generate compliant Web App Manifest
    const manifest = {
      name: opts.appName || "Sovereign App",
      short_name: opts.shortName || "SovApp",
      start_url: "/",
      display: "fullscreen",
      theme_color: opts.themeColor || "#00ff88",
      background_color: opts.backgroundColor || "#010804",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    };

    // 2. Generate offline Service Worker
    const serviceWorker = `
const CACHE_NAME = "${opts.appName.toLowerCase().replace(/\s+/g, "-")}-v1";
const OFFLINE_FALLBACK = ${opts.offlineFallback};

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(["/", "/index.html"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
`.trim();

    // 3. Inject PWA tags & SW registration into HTML
    const pwaTags = `
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="${opts.themeColor}">
  <script>
    if ('serviceWorker' in navigator && !location.search.includes('sw=off')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
      });
    }
  </script>
`;

    const convertedHtml = rawHtml.includes("</head>")
      ? rawHtml.replace("</head>", `${pwaTags}</head>`)
      : `${pwaTags}${rawHtml}`;

    return {
      indexHtml: convertedHtml,
      manifest: JSON.stringify(manifest, null, 2),
      serviceWorker: serviceWorker.trim(),
    };
  }

  /** Convenience helper for a fully-formed, downloadable PWA bundle. */
  static convertRawHtmlBundle(rawHtml: string, options?: Partial<PwaConvertOptions>) {
    const merged: PwaConvertOptions = { ...DEFAULT_PWA_OPTIONS, ...(options ?? {}) } as PwaConvertOptions;
    const result = PwaConverterService.convertRawHtml(rawHtml, merged);
    return {
      files: {
        "index.html": result.indexHtml,
        "manifest.webmanifest": result.manifest,
        "sw.js": result.serviceWorker,
      },
      ...result,
    };
  }
}

export default PwaConverterService;
