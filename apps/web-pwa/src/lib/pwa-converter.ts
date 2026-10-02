/**
 * PwaConverterService
 * In-app `/convert` engine: takes any raw HTML document and returns a fully
 * installable, offline-hardened PWA (manifest + service worker + injected tags).
 */

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
  /** Suggested filename for a ZIP / single-file download. */
  suggestedFileName: string;
  warnings: string[];
}

const DEFAULT_OPTIONS: PwaConvertOptions = {
  appName: 'Sovereign App',
  shortName: 'SovApp',
  themeColor: '#00ff88',
  backgroundColor: '#010804',
  offlineFallback: true,
};

const PORTAL_CACHE_PREFIX = 'portal-sovereign-v1';

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sovereign-app'
  );
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escapes characters that would break an inline `<script>` block. */
function escapeScriptContent(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export class PwaConverterService {
  /**
   * Converts raw HTML into a standalone PWA bundle.
   * Never throws on malformed markup — it degrades to prefixing the PWA tags.
   */
  static convertRawHtml(rawHtml: string, options: Partial<PwaConvertOptions> = {}): PwaConvertResult {
    const opts: PwaConvertOptions = { ...DEFAULT_OPTIONS, ...options };
    const warnings: string[] = [];
    const slug = slugify(opts.appName);
    const safeThemeColor = /^#[0-9a-f]{3,8}$/i.test(opts.themeColor) ? opts.themeColor : DEFAULT_OPTIONS.themeColor;
    const safeBackground = /^#[0-9a-f]{3,8}$/i.test(opts.backgroundColor)
      ? opts.backgroundColor
      : DEFAULT_OPTIONS.backgroundColor;

    // 1. Generate a compliant Web App Manifest.
    const manifest = {
      name: opts.appName || DEFAULT_OPTIONS.appName,
      short_name: opts.shortName || DEFAULT_OPTIONS.shortName,
      description: `${opts.appName} — converted to an offline-first Sovereign PWA.`,
      start_url: '/',
      scope: '/',
      display: 'fullscreen',
      display_override: ['fullscreen', 'standalone', 'minimal-ui'],
      orientation: 'any',
      theme_color: safeThemeColor,
      background_color: safeBackground,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'masked' },
      ],
    };

    // 2. Generate the offline service worker.
    const serviceWorker = `
const CACHE_NAME = "${PORTAL_CACHE_PREFIX}-${slug}";
const OFFLINE_FALLBACK = ${opts.offlineFallback ? 'true' : 'false'};
const CORE_ASSETS = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && OFFLINE_FALLBACK) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/index.html")) || (await cache.match("/")) || Response.error();
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
`.trim();

    // 3. Inject the PWA tags + SW registration into the HTML.
    const pwaTags = `
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="${escapeHtmlAttribute(safeThemeColor)}">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <script>
    if ("serviceWorker" in navigator && !location.search.includes("sw=off")) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(console.error);
      });
    }
  </script>
`;
    const scriptTags = `<script>\n${escapeScriptContent(serviceWorker)}\n</script>`;

    let convertedHtml: string;
    if (/<\/head>/i.test(rawHtml)) {
      convertedHtml = rawHtml.replace(/<\/head>/i, `${pwaTags}</head>`);
    } else {
      warnings.push('No </head> tag found — PWA tags were prefixed to the document.');
      convertedHtml = `${pwaTags}${rawHtml}`;
    }

    if (/<\/body>/i.test(convertedHtml)) {
      convertedHtml = convertedHtml.replace(/<\/body>/i, `${scriptTags}\n</body>`);
    } else {
      warnings.push('No </body> tag found — the generated bundle is written inline.');
      convertedHtml = `${convertedHtml}\n${scriptTags}`;
    }

    if (/<script[^>]+src=["']https?:\/\//i.test(rawHtml)) {
      warnings.push(
        'Remote scripts detected. Strip them to stay air-gap safe — the portal runtime forbids CDN dependencies.',
      );
    }

    return {
      indexHtml: convertedHtml,
      manifest: `${JSON.stringify(manifest, null, 2)}\n`,
      serviceWorker: `${serviceWorker}\n`,
      suggestedFileName: `${slug}-pwa`,
      warnings,
    };
  }

  /**
   * Builds the three-file bundle exported by the `/convert` UI.
   * `format: 'zip-like'` returns newline-delimited sections with file markers,
   * which the UI writes into a single `.txt`-prefixed archive-free download.
   */
  static buildBundle(result: PwaConvertResult): Array<{ name: string; content: string; type: string }> {
    return [
      { name: 'index.html', content: result.indexHtml, type: 'text/html' },
      { name: 'manifest.webmanifest', content: result.manifest, type: 'application/manifest+json' },
      { name: 'sw.js', content: result.serviceWorker, type: 'text/javascript' },
    ];
  }

  /** Triggers a browser download for one generated file. */
  static downloadFile(name: string, content: string, type = 'text/plain'): void {
    if (typeof window === 'undefined') return;
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  /** Extracts `<title>` for prefilling the converter form. */
  static inferAppName(rawHtml: string): string {
    const match = /<title[^>]*>([^<]*)<\/title>/i.exec(rawHtml);
    return match?.[1]?.trim() || 'Sovereign App';
  }

  /** Validates a source URL before the UI offers to fetch it. */
  static isFetchableUrl(value: string): boolean {
    return isValidHttpUrl(value);
  }
}

export default PwaConverterService;
