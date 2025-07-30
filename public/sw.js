self.addEventListener('push', (event) => {
    const data = event.data.json();
    console.log('[Service Worker] Push Received:', data);

    const title = data.title || 'Дурень Онлайн';
    const options = {
        body: data.body,
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/badge-72.png',
        data: {
            url: data.url
        }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click Received.');
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});