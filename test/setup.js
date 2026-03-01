import { execSync } from 'child_process';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Detect provider directly from schema.prisma (updated by preparePrisma.js)
const schemaContent = readFileSync(path.resolve('./prisma/schema.prisma'), 'utf8');
const providerMatch = schemaContent.match(/datasource\s+db\s*{[^}]*provider\s*=\s*"([^"]*)"/);
const currentProvider = providerMatch ? providerMatch[1] : 'sqlite';

let testDbUrl = process.env.DATABASE_URL || 'file:./test/test.db';
const isSqlite = currentProvider === 'sqlite';

// If schema is sqlite but URL is postgres, we MUST force a local file for tests
if (isSqlite && !testDbUrl.startsWith('file:')) {
    testDbUrl = 'file:./test/test.db';
}

export async function setup() {
    console.log(`[Test Setup] Initializing ${isSqlite ? 'SQLite' : 'PostgreSQL'} database for tests...`);
    execSync('npx prisma db push --skip-generate --force-reset', {
        env: { ...process.env, DATABASE_URL: testDbUrl },
        stdio: 'pipe'
    });
    console.log('[Test Setup] Database schema pushed successfully.');
}

export async function teardown() {
    if (isSqlite) {
        const dbPath = path.resolve(testDbUrl.replace('file:', ''));
        if (existsSync(dbPath)) {
            unlinkSync(dbPath);
            // Also clean WAL and SHM files
            for (const suffix of ['-wal', '-shm']) {
                const f = dbPath + suffix;
                if (existsSync(f)) unlinkSync(f);
            }
        }
        console.log('[Test Teardown] SQLite Test DB cleaned up.');
    } else {
        console.log('[Test Teardown] PostgreSQL database left intact (data reset done during setup).');
    }
}
