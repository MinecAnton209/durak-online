import maintenanceService from '../services/maintenanceService.js';

export default function (req, res, next) {
    const maintenanceMode = maintenanceService.getMaintenanceMode();

    if (maintenanceMode.enabled) {
        // Allow admin routes, auth (for login), and admins
        if (req.originalUrl.startsWith('/api/admin') ||
            (req.user && req.user.is_admin) ||
            req.originalUrl.startsWith('/login') ||
            req.originalUrl.startsWith('/register') ||
            req.originalUrl.startsWith('/maintenance') ||
            req.originalUrl.startsWith('/css') ||
            req.originalUrl.startsWith('/js') ||
            req.originalUrl.startsWith('/locales') ||
            req.originalUrl.startsWith('/assets') ||
            req.originalUrl === '/favicon.ico') {
            return next();
        }

        // Return JSON error for API requests
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(503).json({ i18nKey: 'error_maintenance_mode' });
        }

        // Redirect to maintenance page for browser requests
        const msg = encodeURIComponent(maintenanceMode.message);
        const eta = maintenanceMode.endTime || null;

        let redirectUrl = `/maintenance?msg=${msg}`;
        if (eta) {
            redirectUrl += `&eta=${eta}`;
        }
        return res.redirect(redirectUrl);
    }

    next();
};
