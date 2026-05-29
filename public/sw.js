/**
 * NeuroWake Music — Service Worker v1
 *
 * Stratégie :
 *  - Navigation HTML : network-first (auth Supabase toujours frais)
 *  - Assets statiques (_next/static, images, manifest) : cache-first
 *  - /api/* + domaines externes : pass-through (jamais mis en cache)
 *
 * Les fichiers audio sont des object URLs locaux — jamais en transit réseau.
 */

const CACHE = 'neurowake-v1';

// Ressources pré-cachées à l'installation
const PRECACHE = [
  '/logo-neurowake.png',
  '/manifest.json',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // Pass-through absolu : API internes, auth, Supabase, ElevenLabs, tout domaine externe
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.hostname !== self.location.hostname
  ) {
    return;
  }

  // Navigation HTML (mode: 'navigate') → network-first pour auth toujours à jour
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((c) => c ?? new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Assets statiques Next.js (_next/static/**) → cache-first, très stable (hash dans le nom)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Autres assets (images, manifest, fonts) → cache-first avec mise à jour réseau
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached ?? networkFetch;
    })
  );
});
