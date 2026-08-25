import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 30000,
        hookTimeout: 30000,
        // Force SQLite URL for all tests, overriding any PostgreSQL URL from .env
        env: {
            DATABASE_URL: 'file:./test/test.db',
            DIRECT_URL: 'file:./test/test.db'
        },
        // Test files share a single SQLite database; running them in parallel
        // contends on the same file and produces flaky cross-file count races.
        fileParallelism: false,
        poolOptions: {
            threads: {
                singleThread: true
            }
        }
    }
});
