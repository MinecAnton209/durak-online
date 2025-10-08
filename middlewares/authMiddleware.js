function ensureAdmin(req, res, next) {
    if (req.session.user && req.session.user.is_admin) {
        return next();
    }
    res.status(403).json({
        error: 'Forbidden',
        message: 'Forbidden. Administrator access only.',
        i18nKey: 'error_forbidden_admin_only'
    });
}

function ensureAuthenticated(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Unauthorized. Please log in.',
            i18nKey: 'error_unauthorized'
        });
    }

    if (req.session.user.is_banned) {
        const banReason = req.session.user.ban_reason;
        const i18n = req.app.get('i18next');
        const reasonText = banReason || i18n.t('ban_reason_not_specified');

        req.session.destroy((err) => {
            if (err) {
                console.error("Session destruction error:", err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            return res.status(403).json({
                error: 'Forbidden',
                i18nKey: 'error_account_banned_with_reason',
                options: { reason: reasonText }
            });
        });
    } else {
        next();
    }
}

module.exports = {
    ensureAuthenticated,
    ensureAdmin
};