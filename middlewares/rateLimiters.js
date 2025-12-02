const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        i18nKey: 'error_too_many_attempts',
        message: 'Too many login attempts from this IP, please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: {
        i18nKey: 'error_too_many_registrations',
        message: 'Too many accounts created from this IP, please try again after an hour.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        i18nKey: 'error_too_many_requests',
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const passwordChangeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: {
        i18nKey: 'error_too_many_password_changes',
        message: 'Too many password change attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    loginLimiter,
    registerLimiter,
    apiLimiter,
    passwordChangeLimiter
};