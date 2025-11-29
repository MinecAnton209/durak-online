// client/public/sw.js

self.addEventListener('push', (event) => {
    // Получаем данные от сервера
    const data = event.data ? event.data.json() : {};
    console.log('[Service Worker] Push Received:', data);

    const title = data.title || 'Дурень Онлайн';
    const options = {
        body: data.body || 'У вас нове повідомлення',
        icon: '/icons/icon-192.png', // Убедись, что иконка есть в public/icons/
        badge: '/icons/badge-72.png', // Или убери эту строку, если нет иконки
        data: {
            url: data.url || '/'
        }
    };

    // Показываем уведомление
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click Received.');

    event.notification.close();

    // При клике открываем игру или фокусируемся на вкладке
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Если вкладка уже открыта - фокусируемся
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // Если нет - открываем новую
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url);
            }
        })
    );
});