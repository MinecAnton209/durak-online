import type { Request, Response, NextFunction } from 'express';
import maintenanceService from '../services/maintenanceService.js';

export default function (req: Request, res: Response, next: NextFunction): void {
    const maintenanceMode = maintenanceService.getMaintenanceMode();

    if (maintenanceMode.enabled) {
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

        if (req.originalUrl.startsWith('/api/')) {
            void res.status(503).json({ i18nKey: 'error_maintenance_mode' }); return;
        }

        const msg = encodeURIComponent(maintenanceMode.message);
        const eta = maintenanceMode.startTime || null;

        let redirectUrl = `/maintenance?msg=${msg}`;
        if (eta) {
            redirectUrl += `&eta=${eta}`;
        }
        void res.redirect(redirectUrl); return;
    }

    next();
};
