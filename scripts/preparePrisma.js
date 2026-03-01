const { execSync } = require('child_process');
require('dotenv').config();

// Simple preparation for SQLite tests
console.log('[Prisma Prepare] Syncing SQLite database for tests...');

try {
    // Generate Prisma Client
    console.log('[Prisma Prepare] Generating client...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    // Reset test database
    const url = 'file:./test/test.db';
    console.log(`[Prisma Prepare] Resetting test database at: ${url}`);

    execSync('npx prisma db push --skip-generate --force-reset', {
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'inherit'
    });

    console.log('[Prisma Prepare] Done.');
} catch (e) {
    console.error(`[Prisma Prepare] Failed to prepare database: ${e.message}`);
    process.exit(1);
}
