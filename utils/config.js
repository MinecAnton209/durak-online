require('dotenv').config();
const path = require('path');

const config = {
    port: process.env.PORT || 3000,
    sessionSecret: process.env.SESSION_SECRET,
    vapid: {
        subject: process.env.VAPID_SUBJECT,
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
    },
    db: {
        client: process.env.DB_CLIENT,
        connection: process.env.DATABASE_URL,
    },
    cookie: {
        domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined,
        secure: process.env.NODE_ENV === 'production',
    },
    cors: {
        origin: process.env.ADMIN_CORS_ORIGIN || 'http://localhost:5173',
    },
    localesPath: path.join(__dirname, '..', 'public/locales/{{lng}}/{{ns}}.json'),
};

module.exports = config;