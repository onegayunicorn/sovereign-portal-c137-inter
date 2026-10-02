/* ============================================================================
 * Sovereign Portal C-137 — Service Worker
 * Offline-first app shell with CacheStorage range-friendly handling for the
 * large quantized model weights under /models/ (50MB - 1.5GB).
 * ========================================================================== */

const CACHE_NAME = "portal-sovereign-v1";
const MODEL_CACHE = "portal-models-cache";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png"
];

/* ---------------------------------------------------------------- install -- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // Individual adds so a single 404 cannot abort the whole install.
        Promise.all(
          ASSETS_TO_CACHE.map((url) =>
            cache.add(new Request(url, { cache: "reload" })).catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

/* --------------------------------------------------------------- activate -- */
self.addEventListener("activate", (event) => {
  const keep = [CACHE_NAME, MODEL_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* ------------------------------------------------------------------ fetch -- */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept the live SOE gateway health/audit/synthesize endpoints.
  if (
    url.pathname === "/health" ||
    url.pathname.startsWith("/orchestrate/") ||
    url.pathname.startsWith("/audit/") ||
    url.pathname.startsWith("/voice/") ||
    url.pathname.startsWith("/telemetry/")
  ) {
    return;
  }

  // Only same-origin resources are cached.
  if (url.origin !== self.location.origin) return;

  /* -- Large model weights: cache-first, tolerate Range requests ------------ */
  if (url.pathname.startsWith("/models/") || url.pathname.includes("/models/")) {
    event.respondWith(
      caches.open(MODEL_CACHE).then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) {
          // Honour partial-content requests from cache when rangeable.
          const range = request.headers.get("range");
          if (range && cached.status === 200) {
            const buffer = await cached.clone().arrayBuffer();
            const match = /bytes=(\d+)-(\d*)/.exec(range);
            if (match) {
              const start = parseInt(match[1], 10);
              const end = match[2] ? parseInt(match[2], 10) : buffer.byteLength - 1;
              return new Response(buffer.slice(start, end + 1), {
                status: 206,
                statusText: "Partial Content",
                headers: {
                  "Content-Range": `bytes ${start}-${end}/${buffer.byteLength}`,
                  "Content-Length": String(end - start + 1),
                  "Accept-Ranges": "bytes",
                  "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream"
                }
              });
            }
          }
          return cached;
        }

        const networkResponse = await fetch(request);
        if (networkResponse.status === 200) {
          cache.put(request, networkResponse.clone()).catch(() => null);
        }
        return networkResponse;
      })
    );
    return;
  }

  /* -- Navigations: network-first with offline fallback -------------------- */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)).catch(() => null);
          return response;
        })
        .catch(() =>
          caches
            .match("./index.html")
            .then((cached) => cached || caches.match("./offline.html"))
            .then((cached) => cached || new Response("Offline", { status: 503 }))
        )
    );
    return;
  }

  /* -- Everything else: cache-first with network fill ---------------------- */
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
          return response;
        })
        .catch(() => cached || new Response("", { status: 504 }));
    })
  );
});

/* --------------------------------------------------------------- messages -- */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "PURGE_MODELS") {
    event.waitUntil(caches.delete(MODEL_CACHE));
  }
  if (data.type === "VERSION" && event.source) {
    event.source.postMessage({ type: "VERSION", cache: CACHE_NAME });
  }
});
