// shou service worker — web push for saved searches (phase 3). It does nothing
// else: no caching, no fetch handler, so the app always loads from the network.
// The backend (api/cron/saved-search-push.js) sends { title, body, url, tag, image }.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  const title = String(d.title || 'shou').slice(0, 120);
  e.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 300),
    icon: '/apple-touch-icon.png',
    image: typeof d.image === 'string' && d.image.startsWith('https://') ? d.image : undefined,
    tag: d.tag || 'shou',
    renotify: false,
    data: { url: typeof d.url === 'string' ? d.url : '/' },
  }));
});

// Only ever open the app itself, whatever the payload says.
function safeUrl(u) {
  try {
    const x = new URL(u, self.location.origin);
    return x.origin === self.location.origin ? x.href : self.location.origin + '/';
  } catch (_) { return self.location.origin + '/'; }
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = safeUrl(e.notification.data && e.notification.data.url);
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if ('navigate' in c) { try { await c.navigate(url); return c.focus(); } catch (_) {} }
    }
    return self.clients.openWindow(url);
  })());
});
