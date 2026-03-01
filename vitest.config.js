import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 30000,
        hookTimeout: 30000,
        // Force SQLite URL for all tests, overriding any PostgreSQL URL from .env
        env: {
            DATABASE_URL: 'file:./test/test.db'
        },
        poolOptions: {
            threads: {
                singleThread: true
            }
        }
    }
});
