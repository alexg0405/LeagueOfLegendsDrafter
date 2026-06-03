self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
      self.registration.unregister(),
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.navigate(client.url)
        }
      })
    ])
  )
})
