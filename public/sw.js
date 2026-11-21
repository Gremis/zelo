const CACHE_PREFIX = "sindicondo-pwa-offline-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_PAGE = "/offline.html";

async function refreshOfflinePage() {
  const response = await fetch(OFFLINE_PAGE, {
    cache: "reload",
    credentials: "omit",
  });
  if (
    !response.ok ||
    response.redirected ||
    !response.headers.get("Content-Type")?.startsWith("text/html")
  )
    throw new Error("Offline page unavailable.");
  const cache = await caches.open(CACHE_NAME);
  await cache.put(OFFLINE_PAGE, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await refreshOfflinePage();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/")
  )
    return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        event.waitUntil(refreshOfflinePage().catch(() => undefined));
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const offline = await cache.match(OFFLINE_PAGE);
        return new Response(
          offline?.body ??
            "Sem conexão. Conecte-se à internet e tente novamente.",
          {
            status: 503,
            headers: {
              "Content-Type": offline
                ? "text/html; charset=utf-8"
                : "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        );
      }
    })(),
  );
});
