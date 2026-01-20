import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToastStore } from './toast';
import i18n from '@/i18n';
import { getApiUrl } from '@/utils/api';

export const useNotificationStore = defineStore('notifications', () => {
  const toast = useToastStore();

  const isSupported = ref(false);
  const isSubscribed = ref(false);
  const permission = ref('default');
  const isLoading = ref(false);

  let swRegistration = null;

  async function init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      isSupported.value = false;
      return;
    }
    isSupported.value = true;

    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('SW Registered:', swRegistration.scope);

      const subscription = await swRegistration.pushManager.getSubscription();
      isSubscribed.value = !!subscription;
      permission.value = Notification.permission;

    } catch (error) {
      console.error('SW Error:', error);
    }
  }

  async function subscribe() {
    if (!swRegistration) return;
    isLoading.value = true;

    try {
      const response = await fetch(getApiUrl('/api/notifications/vapid-public-key'));
      if (!response.ok) throw new Error(i18n.global.t('notifications_vapid_error'));
      const vapidPublicKey = await response.text();

      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });

      const saveRes = await fetch(getApiUrl('/api/notifications/subscribe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

      if (!saveRes.ok) throw new Error(i18n.global.t('notifications_save_error'));

      isSubscribed.value = true;
      permission.value = 'granted';
      toast.addToast(i18n.global.t('notifications_enabled'), 'success');

    } catch (error) {
      console.error(error);
      if (Notification.permission === 'denied') {
        permission.value = 'denied';
        toast.addToast(i18n.global.t('notifications_blocked'), 'error');
      } else {
        toast.addToast(i18n.global.t('notifications_subscribe_failed'), 'error');
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function unsubscribe() {
    if (!swRegistration) return;
    isLoading.value = true;

    try {
      const subscription = await swRegistration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await fetch(getApiUrl('/api/notifications/unsubscribe'), { method: 'POST' });

        isSubscribed.value = false;
        toast.addToast(i18n.global.t('notifications_disabled'), 'info');
      }
    } catch (error) {
      console.error(error);
      toast.addToast(i18n.global.t('notifications_unsubscribe_error'), 'error');
    } finally {
      isLoading.value = false;
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

  return {
    isSupported, isSubscribed, permission, isLoading,
    init, subscribe, unsubscribe
  };
});
