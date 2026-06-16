/// <reference lib="webworker" />
// Service worker: precache (Workbox injectManifest) + runtime cache API + Web Push.

import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope

// Required for autoUpdate with injectManifest: without these the freshly
// installed worker sits in "waiting" forever and users keep getting the OLD
// precached app on every reload (only clearing site data escaped it).
self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA fallback (except auth routes, which Supabase handles with redirects)
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/auth\//],
  }),
)

// Per-user endpoints scoped by RLS (not by a user_id in the URL) share one
// cache key across accounts, so a cached response could surface the previous
// user's data after a switch. Never cache them — always go to the network.
registerRoute(({ url }) => url.pathname.startsWith('/rest/v1/notifications'), new NetworkOnly())

// Other Supabase API reads: network-first → offline read of latest data
registerRoute(
  ({ url }) => url.pathname.startsWith('/rest/v1/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 5,
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 })],
  }),
)

// ── Web Push ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Ensayadero', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      // Status-bar badge: monochrome + transparent (Android paints the alpha
      // white). A full-color icon here shows as a white square.
      badge: '/icons/badge-96.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c)
      if (existing) {
        existing.navigate(url)
        return existing.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
