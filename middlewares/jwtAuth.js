const jwt = require('jsonwebtoken')

function getCookieDomain(hostname) {
    if (process.env.NODE_ENV !== 'production') return undefined;

    if (!hostname) return undefined;

    if (hostname.includes('minecanton209.pp.ua')) return '.minecanton209.pp.ua';
    if (hostname.includes('crushtalm.pp.ua')) return '.crushtalm.pp.ua';

    return undefined;
}

function getJwtSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'change-me'
}

function signToken(payload, options = {}) {
  const secret = getJwtSecret()
    const defaultOpts = {
        expiresIn: '7d',
        issuer: 'durak-api',
        audience: 'durak-client'
    }
  return jwt.sign(payload, secret, { ...defaultOpts, ...options })
}

function verifyToken(token) {
  if (!token) return null
  try {
      return jwt.verify(token, getJwtSecret(), {
          issuer: 'durak-api',
          audience: 'durak-client'
      })
  } catch (_) {
    return null
  }
}

function parseCookieHeader(cookieHeader) {
  const result = {}
  if (!cookieHeader) return result
  cookieHeader.split(';').forEach(part => {
    const idx = part.indexOf('=')
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    if (key) result[key] = decodeURIComponent(val)
  })
  return result
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

function attachUserFromToken(req, _res, next) {
    const cookies = parseCookieHeader(req.headers.cookie);

    const bearerHeader = req.headers['authorization'] || '';
    const bearer = bearerHeader.startsWith('Bearer ') ? bearerHeader.slice(7) : null;
    const token = bearer || cookies.durak_token;

    if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
            req.user = decoded;
            req.session = {
                user: decoded,
                save() {},
                destroy() {},
            };
        }
    }

    next();
}

function socketAttachUser(socket, next) {
    const deviceId = socket.handshake.auth?.deviceId;

    socket.deviceId = deviceId || 'unknown_device';

    console.log(`[Auth] Attaching data to socket. Socket ID: ${socket.id}, Device ID: ${socket.deviceId}`);

    const cookies = parseCookieHeader(socket.request.headers.cookie);
    const authHeader = socket.request.headers['authorization'] || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = bearer || cookies.durak_token;

    const decoded = verifyToken(token);

    if (decoded) {
        socket.request.user = decoded;
        socket.request.session = { user: decoded, save() {}, destroy() {} };
    } else {
        socket.request.session = { user: null, save() {}, destroy() {} };
    }

    next();
}

function authMiddleware(req, res, next) {
    attachUserFromToken(req, res, () => {
        if (req.user) {
            next();
        } else {
            res.status(401).json({ i18nKey: 'error_unauthorized' });
        }
    });
}


module.exports = {
  signToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  attachUserFromToken,
  socketAttachUser,
  authMiddleware,
}
