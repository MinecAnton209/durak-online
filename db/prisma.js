const { PrismaClient } = require('../generated/prisma/client.ts');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || '';
const isPostgres = connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://');

const adapter = isPostgres
  ? new (require('@prisma/adapter-pg').PrismaPg)({ connectionString })
  : new (require('@prisma/adapter-better-sqlite3').PrismaBetterSqlite3)({ url: connectionString });

const prisma = new PrismaClient({ adapter });

prisma.getDbProvider = () => (isPostgres ? 'postgresql' : 'sqlite');

module.exports = prisma;
