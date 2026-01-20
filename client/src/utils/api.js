export const BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Prepend BASE_URL to the URL if it's relative.
 */
export const getApiUrl = (url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    // Ensure we don't end up with // if BASE_URL ends with / and url starts with /
    const baseUrl = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${baseUrl}${path}`;
};
