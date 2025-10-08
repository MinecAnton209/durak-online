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
    if (req.session.user) {
        return next();
    }
    res.status(401).json({
        error: 'Unauthorized',
        message: 'Unauthorized. Please log in.',
        i18nKey: 'error_unauthorized'
    });
}

function ensureAuthenticated(req, res, next) {
    if (req.session.user.is_banned) {
        const banReason = req.session.user.ban_reason;
        req.session.destroy();
        return res.status(403).json({
            error: 'Forbidden',
            i18nKey: 'error_account_banned_with_reason',
            options: { reason: banReason || i18next.t('ban_reason_not_specified', { ns: 'translation'}) }
        });
    }
    res.status(401).json({ error: 'Unauthorized', i18nKey: 'error_unauthorized' });
}

module.exports = {
    ensureAuthenticated,
    ensureAdmin
}