import { readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// This script runs inside each test worker.
// It ensures that DATABASE_URL in process.env matches the provider in schema.prisma.
const schemaPath = path.resolve('./prisma/schema.prisma');
const schemaContent = readFileSync(schemaPath, 'utf8');
const providerMatch = schemaContent.match(/datasource\s+db\s*{[^}]*provider\s*=\s*"([^"]*)"/);
const currentProvider = providerMatch ? providerMatch[1] : 'sqlite';

if (currentProvider === 'sqlite') {
    const url = process.env.DATABASE_URL || '';
    if (!url.startsWith('file:')) {
        // Force SQLite test DB path if we are in sqlite mode but env points to postgres
        process.env.DATABASE_URL = 'file:./test/test.db';
        // console.log(`[EnvSetup] Forced DATABASE_URL to SQLite for tests`);
    }
}
