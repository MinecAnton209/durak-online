require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const webpush = require('web-push');

// Custom modules
const config = require('./utils/config');
const db = require('./db');
const { initializeSocket } = require('./controllers/socketController');
const { startRoulette } = require('./controllers/rouletteController');
const { seedAchievements } = require('./db/seed.js');
const achievementService = require('./services/achievementService.js');

// Route imports
const authRoutes = require('./routes/auth.js');
const publicRoutes = require('./routes/public.js');
const achievementRoutes = require('./routes/achievements.js');
const adminRoutes = require('./routes/admin.js');
const friendsRoutes = require('./routes/friends.js');
const notificationsRoutes = require('./routes/notifications.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// VAPID Setup
if (config.vapid.publicKey && config.vapid.privateKey) {
    webpush.setVapidDetails(
        config.vapid.subject,
        config.vapid.publicKey,
        config.vapid.privateKey
    );
    console.log("Web Push (VAPID) initialized.");
} else {
    console.warn("VAPID keys not found in .env file. Push notifications will not work.");
}

// Maintenance Mode Setup
let maintenanceMode = {
    enabled: false,
    message: "The site is undergoing maintenance. Please check back later.",
    timer: null,
    startTime: null,
    warningMessage: ""
};
app.set('maintenanceMode', maintenanceMode);

// App Settings
app.set('socketio', io);
app.set('i18next', i18next);

// i18next Initialization
i18next
    .use(Backend)
    .init({
        fallbackLng: 'en',
        ns: ['translation'],
        defaultNS: 'translation',
        backend: {
            loadPath: config.localesPath,
        },
    });

// Seeding and Services Initialization
setTimeout(seedAchievements, 1000);
achievementService.init(io);

// Session Middleware
const sessionMiddleware = session({
    store: (config.db.client === 'postgres' && config.db.connection) ?
        new (require('connect-pg-simple')(session))({ pool: db.pool, tableName: 'user_sessions' }) :
        new (require('connect-sqlite3')(session))({ db: 'database.sqlite', dir: './data' }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        secure: config.cookie.secure,
        httpOnly: true,
        sameSite: 'lax',
        domain: config.cookie.domain
    }
});

// Middleware stack
app.set('trust proxy', 1);

// Maintenance Mode Middleware
app.use((req, res, next) => {
    const maintenanceMode = req.app.get('maintenanceMode');

    if (maintenanceMode.enabled) {
        if (req.originalUrl.startsWith('/api/admin') ||
            req.session?.user?.is_admin ||
            req.originalUrl.startsWith('/maintenance') ||
            req.originalUrl.startsWith('/css') ||
            req.originalUrl.startsWith('/js') ||
            req.originalUrl.startsWith('/locales')) {
            return next();
        }

        if (req.originalUrl.startsWith('/api/')) {
            return res.status(503).json({ i18nKey: 'error_maintenance_mode' });
        }

        const msg = encodeURIComponent(maintenanceMode.message);
        const eta = maintenanceMode.endTime || null;

        let redirectUrl = `/maintenance?msg=${msg}`;
        if (eta) {
            redirectUrl += `&eta=${eta}`;
        }
        return res.redirect(redirectUrl);
    }

    next();
});

app.use(cors({
    origin: config.cors.origin,
    credentials: true
}));
app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static('public'));

// Route Mounting
app.get('/maintenance', (req, res) => {
    const maintenanceMode = req.app.get('maintenanceMode');

    if (!maintenanceMode.enabled) {
        return res.redirect('/');
    }

    res.sendFile(path.join(__dirname, 'public', 'maintenance-page.html'));
});

app.use('/', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Simple page routes that could be moved to a controller/route file later
app.get('/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/roulette', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'roulette.html'));
});

// Socket.IO Initialization
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});
initializeSocket(io, app, i18next);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("Critical server error:");
    console.error(err.stack);

    if (req.originalUrl.startsWith('/api/')) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }

    res.status(500).sendFile(path.join(__dirname, 'public', 'error.html'));
});

app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    res.status(404).sendFile(path.join(__dirname, 'public', 'error.html'));
});

// Start Server and Services
const onlineUsers = app.get('onlineUsers');
startRoulette(io, onlineUsers);

server.listen(config.port, '0.0.0.0', () => {
    console.log(`Server is running on port ${config.port}`);
});