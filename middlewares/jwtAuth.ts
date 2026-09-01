import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import db from '../db/drizzle.js';
import type { Socket } from 'socket.io';
import { eq } from 'drizzle-orm';
import { activeSession } from '../db/schema.ts';
import type { SessionUser } from '../types/index.js';

function getCookieDomain(hostname: string): string | undefined {
    if (process.env.NODE_ENV !== 'production') return undefined;

    if (!hostname) return undefined;

    if (hostname.includes('minecanton209.pp.ua')) return '.minecanton209.pp.ua';
    if (hostname.includes('crushtalm.pp.ua')) return '.crushtalm.pp.ua';

    return undefined;
}

function getJwtSecret(): string {
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

function signToken(payload: any, options: any = {}): string {
    const secret = getJwtSecret();
    const defaultOpts = {
        expiresIn: '7d',
        issuer: 'durak-api',
        audience: 'durak-client'
    };
    return jwt.sign(payload, secret, { ...defaultOpts, ...options });
}

function verifyToken(token: string): any {
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

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!cookieHeader) return result;
    cookieHeader.split(';').forEach((part: string) => {
        const idx = part.indexOf('=');
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (key) result[key] = decodeURIComponent(val);
    });
    return result;
}

function setAuthCookie(req: Request, res: Response, token: string): void {
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

function clearAuthCookie(req: Request, res: Response): void {
    const domain = getCookieDomain(req.hostname);

    res.clearCookie('durak_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        domain: domain,
    });
}

async function checkSession(decoded: any, onUser: (session: any) => void, onInvalid: () => void): Promise<void> {
    if (!decoded.sessionId) {
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
    } catch (e: any) {
        console.error('Session check error:', e);
        onInvalid();
    }
}

function touchSession(sessionId: string, lastActive: Date): void {
    const now = new Date();
    if (now.getTime() - lastActive.getTime() > 1 * 60 * 1000) {
        db.update(activeSession)
            .set({ last_active: now })
            .where(eq(activeSession.id, sessionId))
            .catch((err: any) => console.error('Last active update fail', err.message));
    }
}

const attachUserFromToken: RequestHandler = (req, _res, next) => {
    const cookies = parseCookieHeader(req.headers.cookie);

    const bearerHeader = req.headers['authorization'] || '';
    const bearer = bearerHeader.startsWith('Bearer ') ? bearerHeader.slice(7) : null;
    const token = bearer || cookies.durak_token;

    if (!token) {
        next();
        return;
    }

    const decoded = verifyToken(token || "");
    if (!decoded) {
        next();
        return;
    }

    checkSession(
        decoded,
        (session) => {
            req.user = decoded as SessionUser;
            (req as any).session = { user: decoded as SessionUser, save() { }, destroy() { } } as any;
            touchSession(decoded.sessionId!, new Date(session.last_active));
            next();
        },
        () => {
            req.user = null;
            next();
        }
    );
};

function socketAttachUser(socket: Socket, next: (err?: Error) => void): void {
    const deviceId = socket.handshake.auth?.deviceId;
    socket.deviceId = deviceId || 'unknown_device';

    const cookies = parseCookieHeader(socket.request.headers.cookie);
    const authHeader = socket.request.headers['authorization'] || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = bearer || cookies.durak_token;

    const decoded = verifyToken(token || "");

    if (!decoded) {
        (socket.request as any).session = { user: null, save() { }, destroy() { } } as any;
        next();
        return;
    }

    checkSession(
        decoded,
        (session) => {
            (socket.request as any).user = decoded as SessionUser;
            (socket.request as any).session = { user: decoded as SessionUser, save() { }, destroy() { } } as any;
            touchSession(decoded.sessionId!, new Date(session.last_active));
            next();
        },
        () => {
            (socket.request as any).user = null;
            socket.request.session = { user: null, save() { }, destroy() { } };
            next();
        }
    );
}

const authMiddleware: RequestHandler = (req, res, next) => {
    if (req.user) {
        next();
    } else {
        res.status(401).json({ i18nKey: 'error_unauthorized' });
    }
};

export {
    signToken,
    verifyToken,
    setAuthCookie,
    clearAuthCookie,
    attachUserFromToken,
    socketAttachUser,
    authMiddleware
};
