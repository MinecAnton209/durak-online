export function parseUserAgent(uaString) {
    if (!uaString) return { browser: 'Unknown', os: 'Unknown' };

    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    // Simple OS detection
    if (uaString.includes('Windows')) os = 'Windows';
    else if (uaString.includes('Android')) os = 'Android';
    else if (uaString.includes('iPhone') || uaString.includes('iPad')) os = 'iOS';
    else if (uaString.includes('Mac')) os = 'macOS';
    else if (uaString.includes('Linux')) os = 'Linux';

    // Simple Browser detection
    if (uaString.includes('Firefox')) browser = 'Firefox';
    else if (uaString.includes('SamsungBrowser')) browser = 'Samsung Internet';
    else if (uaString.includes('Opera') || uaString.includes('OPR')) browser = 'Opera';
    else if (uaString.includes('Edge') || uaString.includes('Edg')) browser = 'Edge';
    else if (uaString.includes('Chrome')) browser = 'Chrome';
    else if (uaString.includes('Safari')) browser = 'Safari';

    return { browser, os };
}
