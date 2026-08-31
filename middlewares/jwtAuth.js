import jwt from 'jsonwebtoken';
import db from '../db/drizzle.js';
import { eq } from 'drizzle-orm';
import { activeSession } from '../db/schema.ts';

function getCookieDomain(hostname) {
    if (process.env.NODE_ENV !== 'production') return undefined;

    if (!hostname) return undefined;

    if (hostname.includes('minecanton209.pp.ua')) return '.minecanton209.pp.ua';
    if (hostname.includes('crushtalm.pp.ua')) return '.crushtalm.pp.ua';

    return undefined;
}

function getJwtSecret() {
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'change-me';

    if (process.env.NODE_ENV === 'production' && (secret === 'change-me' || secret.length < 32)) {
        console.error('FATAL ERROR: JWT_SECRET must be set to a strong value (32+ characters) in production!');
        console.error('Set JWT_SECRET in your .env file immediately.');
        process.exit(1);
    }

    if (secret === 'change-me' || secret.length < 32) {
        console.warn('WARNING: Using weak JWT_SECRET. Set a strong JWT_SECRET in your .env file!');
    }

    return secret;
}

function signToken(payload, options = {}) {
    const secret = getJwtSecret();
    const defaultOpts = {
        expiresIn: '7d',
        issuer: 'durak-api',
        audience: 'durak-client'
    };
    return jwt.sign(payload, secret, { ...defaultOpts, ...options });
}

function verifyToken(token) {
    if (!token) return null;
    try {
        return jwt.verify(token, getJwtSecret(), {
            issuer: 'durak-api',
            audience: 'durak-client'
        });
    } catch (_) {
        return null;
    }
}

function parseCookieHeader(cookieHeader) {
    const result = {};
    if (!cookieHeader) return result;
    cookieHeader.split(';').forEach(part => {
        const idx = part.indexOf('=');
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (key) result[key] = decodeURIComponent(val);
    });
    return result;
}

function setAuthCookie(req, res, token) {
    const domain = getCookieDomain(req.hostname);

    res.cookie('durak_token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 1000 * 60 * 60 * 24 * 7,
        path: '/',
        domain: domain,
    });
}

function clearAuthCookie(req, res) {
    const domain = getCookieDomain(req.hostname);

    res.clearCookie('durak_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        domain: domain,
    });
}

async function checkSession(decoded, onUser, onInvalid) {
    if (!decoded.sessionId) {
        // Legacy token support disabled - force logout
        onInvalid();
        return;
    }
    try {
        const session = await db.query.activeSession.findFirst({ where: { id: decoded.sessionId } });
        if (session) {
            onUser(session);
        } else {
            onInvalid();
        }
    } catch (e) {
        console.error('Session check error:', e);
        onInvalid();
    }
}

function touchSession(sessionId, lastActive) {
    const now = new Date();
    if (now.getTime() - lastActive.getTime() > 1 * 60 * 1000) {
        db.update(activeSession)
            .set({ last_active: now })
            .where(eq(activeSession.id, sessionId))
            .catch(err => console.error('Last active update fail', err.message));
    }
}

function attachUserFromToken(req, _res, next) {
    const cookies = parseCookieHeader(req.headers.cookie);

    const bearerHeader = req.headers['authorization'] || '';
    const bearer = bearerHeader.startsWith('Bearer ') ? bearerHeader.slice(7) : null;
    const token = bearer || cookies.durak_token;

    if (!token) {
        next();
        return;
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        next();
        return;
    }

    checkSession(
        decoded,
        (session) => {
            req.user = decoded;
            req.session = { user: decoded, save() { }, destroy() { } };
            touchSession(decoded.sessionId, new Date(session.last_active));
            next();
        },
        () => {
            req.user = null;
            next();
        }
    );
}

function socketAttachUser(socket, next) {
    const deviceId = socket.handshake.auth?.deviceId;
    socket.deviceId = deviceId || 'unknown_device';

    const cookies = parseCookieHeader(socket.request.headers.cookie);
    const authHeader = socket.request.headers['authorization'] || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = bearer || cookies.durak_token;

    const decoded = verifyToken(token);

    if (!decoded) {
        socket.request.session = { user: null, save() { }, destroy() { } };
        next();
        return;
    }

    checkSession(
        decoded,
        (session) => {
            socket.request.user = decoded;
            socket.request.session = { user: decoded, save() { }, destroy() { } };
            touchSession(decoded.sessionId, new Date(session.last_active));
            next();
        },
        () => {
            socket.request.user = null;
            socket.request.session = { user: null, save() { }, destroy() { } };
            next();
        }
    );
}

function authMiddleware(req, res, next) {
    if (req.user) {
        next();
    } else {
        res.status(401).json({ i18nKey: 'error_unauthorized' });
    }
}

export {
    signToken,
    verifyToken,
    setAuthCookie,
    clearAuthCookie,
    attachUserFromToken,
    socketAttachUser,
    authMiddleware
};
