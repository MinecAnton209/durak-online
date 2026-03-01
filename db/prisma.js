const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

// Helper to check provider in runtime (used in routes/admin.js)
prisma.getDbProvider = () => {
    const url = process.env.DATABASE_URL || '';
    if (url.startsWith('postgresql://') || url.startsWith('postgres://')) return 'postgresql';
    return 'sqlite';
};

module.exports = prisma;
