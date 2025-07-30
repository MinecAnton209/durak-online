document.addEventListener('DOMContentLoaded', async () => {
    const toggleBtn = document.getElementById('toggle-push-btn');
    const statusText = document.getElementById('push-status');

    if (!toggleBtn) return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push messaging is not supported');
        toggleBtn.textContent = i18next.t('notifications_not_supported');
        if(statusText) statusText.textContent = '';
        return;
    }

    let swRegistration = null;
    let isSubscribed = false;

    try {
        swRegistration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered with scope:', swRegistration.scope);
    } catch (error) {
        console.error('Service Worker registration failed:', error);
        toggleBtn.textContent = i18next.t('error_unknown');
        return;
    }

    const subscription = await swRegistration.pushManager.getSubscription();
    isSubscribed = !(subscription === null);

    updateUI();

    toggleBtn.addEventListener('click', () => {
        toggleBtn.disabled = true;
        if (isSubscribed) {
            unsubscribeUser();
        } else {
            subscribeUser();
        }
    });

    function updateUI() {
        if (Notification.permission === 'denied') {
            toggleBtn.textContent = i18next.t('notifications_blocked_btn');
            statusText.textContent = i18next.t('notifications_blocked_status');
            toggleBtn.disabled = true;
            return;
        }

        if (isSubscribed) {
            toggleBtn.textContent = i18next.t('notifications_disable_btn');
            statusText.textContent = i18next.t('notifications_enabled_status');
        } else {
            toggleBtn.textContent = i18next.t('notifications_enable_btn');
            statusText.textContent = i18next.t('notifications_disabled_status');
        }
        toggleBtn.disabled = false;
    }

    async function subscribeUser() {
        try {
            const vapidPublicKey = await fetchVapidKey();
            const subscription = await swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });

            await sendSubscriptionToServer(subscription);
            isSubscribed = true;
            updateUI();
        } catch (err) {
            console.error('Failed to subscribe the user: ', err);
            if (Notification.permission === 'denied') {
                updateUI();
            } else {
                showError(i18next.t('error_subscription_failed'));
            }
            toggleBtn.disabled = false;
        }
    }

    async function unsubscribeUser() {
        try {
            const subscription = await swRegistration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                await removeSubscriptionFromServer();
                isSubscribed = false;
                updateUI();
            }
        } catch (err) {
            console.error('Failed to unsubscribe: ', err);
            showError(i18next.t('error_unsubscription_failed'));
        }
        toggleBtn.disabled = false;
    }

    async function fetchVapidKey() {
        const response = await fetch('/api/notifications/vapid-public-key');
        return response.text();
    }

    async function sendSubscriptionToServer(subscription) {
        const response = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok && response.status === 401) {
            window.location.href = '/';
        }
    }

    async function removeSubscriptionFromServer() {
        await fetch('/api/notifications/unsubscribe', { method: 'POST' });
    }

    function showError(message) {
        if(statusText) {
            statusText.textContent = message;
            statusText.style.color = 'var(--error-color)';
        }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
});