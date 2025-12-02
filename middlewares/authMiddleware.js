function ensureAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.is_admin) {
        return next();
    }
    res.status(403).json({
        error: 'Forbidden',
        message: 'Forbidden. Administrator access only.',
        i18nKey: 'error_forbidden_admin_only'
    });
}

function ensureAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.status(401).json({
        error: 'Unauthorized',
        message: 'Unauthorized. Please log in.',
        i18nKey: 'error_unauthorized'
    });
}

module.exports = {
    ensureAuthenticated,
    ensureAdmin
}