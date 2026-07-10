// Play Academy Service Worker — Push Notifications
//
// This file is layered into the Workbox-generated service worker via
// `workbox.importScripts` (see vite.config.ts). Workbox owns install/activate,
// precaching of the app shell, skipWaiting and clientsClaim — so this file must
// NOT register its own install/activate handlers (that would fight Workbox).
// It contributes ONLY the Web Push behaviour.

// Push notification received
self.addEventListener('push', e => {
  if (!e.data) return
  const data = e.data.json()
  e.waitUntil(
    self.registration.showNotification(data.title || 'Play Academy', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'pa-notification',
      requireInteraction: data.urgent || false,
      data: { url: data.url || '/' }
    })
  )
})

// Notification click — open app
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      const url = e.notification.data?.url || '/'
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
