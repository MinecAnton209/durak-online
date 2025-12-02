import FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY = 'durak_device_id';

let deviceIdPromise = null;

async function generateAndStoreId() {
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    const visitorId = result.visitorId;

    localStorage.setItem(STORAGE_KEY, visitorId);
    return visitorId;
  } catch (error) {
    console.error('Fingerprint generation failed:', error);
    return 'fallback-' + Date.now();
  }
}

export function getDeviceId() {
  if (deviceIdPromise) {
    return deviceIdPromise;
  }

  deviceIdPromise = new Promise(async (resolve) => {
    let deviceId = localStorage.getItem(STORAGE_KEY);
    if (!deviceId) {
      deviceId = await generateAndStoreId();
    }

    resolve(deviceId);
  });

  return deviceIdPromise;
}
