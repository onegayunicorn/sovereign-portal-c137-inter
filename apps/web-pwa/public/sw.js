/* ==========================================================================
   Sovereign Portal C-137 — hardened service worker
   Range-request aware model cache + app-shell offline fallback.

   Local LLM and ONNX weight files range from 50 MB to 1.5 GB. The CacheStorage
   API cannot reliably hold gigabyte assets unless they are chunked with HTTP
   `Range` request support, so `/models/*` is handled by a dedicated cache that
   honours `Range` headers and slices cached blobs accordingly.
   ========================================================================== */

const CACHE_NAME = 'portal-sovereign-v1';
const MODEL_CACHE_NAME = 'portal-models-cache';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/shaders/portal.frag',
  '/shaders/crt-overlay.frag',
];

const MODEL_PREFIX = '/models/';
const MODEL_EXTENSIONS = ['.bin', '.wasm', '.onnx', '.gguf', '.json', '.model', '.safetensors', '.data', '.glb'];

/* ------------------------------------------------------------------ install */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS_TO_CACHE.map((asset) =>
          cache.add(asset).catch((error) => {
            console.warn('[SW] Skipped pre-cache for', asset, error);
          }),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

/* ----------------------------------------------------------------- activate */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== MODEL_CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.disable();
      }
      await self.clients.claim();
    })(),
  );
});

/* --------------------------------------------------------------- utilities */

function isModelRequest(url) {
  if (!url.pathname.startsWith(MODEL_PREFIX)) return false;
  if (url.pathname.endsWith('/')) return true;
  return MODEL_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

function isCacheFirstAsset(url) {
  return (
    url.pathname.startsWith('/shaders/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/assets/')
  );
}

/** Parses `bytes=start-end` into a concrete slice, or null when unsatisfiable. */
function parseRangeHeader(rangeHeader, totalSize) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  let start;
  let end;

  if (rawStart === '') {
    // Suffix range: `bytes=-N` -> last N bytes.
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, totalSize - suffixLength);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? totalSize - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= totalSize) return null;
  return { start, end: Math.min(end, totalSize - 1) };
}

/**
 * Reads a full response into a Blob once, then serves every subsequent range
 * request from the in-cache Blob. This is the only way to make multi-hundred-MB
 * quantization payloads survive a flaky connection.
 */
async function fetchAndCacheFull(request) {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const cached = await cache.match(request.url, { ignoreSearch: true });
  if (cached) return cached;

  const networkResponse = await fetch(request.url, { credentials: 'same-origin' });
  if (!networkResponse.ok) return networkResponse;

  // Clone before consuming — the original stream is returned to the caller.
  const clone = networkResponse.clone();
  try {
    await cache.put(request.url, clone);
    console.log('[SW] Cached model asset:', request.url);
  } catch (error) {
    console.warn('[SW] Model cache put failed (quota?):', request.url, error);
  }

  // Remember the true byte length so later range requests can be satisfied.
  const length = networkResponse.headers.get('Content-Length');
  if (length) await cache.put(`${request.url}#length`, new Response(length));

  return networkResponse;
}

async function handleModelRangeRequest(request) {
  const cache = await caches.open(MODEL_CACHE_NAME);

  // A ranged request whose resource is already fully cached: slice the blob.
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const cachedResponse = await cache.match(request.url, { ignoreSearch: true });
    if (cachedResponse) {
      const blob = await cachedResponse.clone().blob();
      const range = parseRangeHeader(rangeHeader, blob.size);
      if (range) {
        const slice = blob.slice(range.start, range.end + 1);
        return new Response(slice, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Type': cachedResponse.headers.get('Content-Type') || 'application/octet-stream',
            'Content-Range': `bytes ${range.start}-${range.end}/${blob.size}`,
            'Content-Length': String(slice.size),
            'Accept-Ranges': 'bytes',
          },
        });
      }
      return new Response(blob, {
        status: 200,
        headers: {
          'Content-Type': cachedResponse.headers.get('Content-Type') || 'application/octet-stream',
          'Accept-Ranges': 'bytes',
          'Content-Length': String(blob.size),
        },
      });
    }
  }

  // Not cached yet: pull the full object, then serve the requested range from it.
  try {
    const full = await fetchAndCacheFull(request);
    if (!rangeHeader) return full;

    const blob = await full.clone().blob();
    const range = parseRangeHeader(rangeHeader, blob.size);
    if (!range) {
      return new Response(blob, {
        status: 200,
        headers: {
          'Content-Type': full.headers.get('Content-Type') || 'application/octet-stream',
          'Accept-Ranges': 'bytes',
          'Content-Length': String(blob.size),
        },
      });
    }
    const slice = blob.slice(range.start, range.end + 1);
    return new Response(slice, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': full.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Range': `bytes ${range.start}-${range.end}/${blob.size}`,
        'Content-Length': String(slice.size),
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.warn('[SW] Model fetch failed, falling back to network:', error);
    return fetch(request);
  }
}

/* -------------------------------------------------------------------- fetch */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 1. Large model weights: CacheStorage range-request support.
  if (isModelRequest(url)) {
    event.respondWith(handleModelRangeRequest(request));
    return;
  }

  // 2. Navigations: network-first with offline app-shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
        }),
    );
    return;
  }

  // 3. Shaders / icons / hashed bundles: cache-first.
  if (isCacheFirstAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
            }
            return response;
          }),
      ),
    );
    return;
  }

  // 4. Everything else: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});

/* --------------------------------------------------------------- messaging */

self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CLEAR_MODEL_CACHE') {
    event.waitUntil(
      caches.delete(MODEL_CACHE_NAME).then(() => {
        event.source?.postMessage({ type: 'MODEL_CACHE_CLEARED' });
      }),
    );
  }
});
