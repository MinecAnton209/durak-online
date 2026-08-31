import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 30000,
        hookTimeout: 30000,
        include: ['test/**/*.test.js'],
        // One Postgres Testcontainer is started in globalSetup and shared by all workers.
        globalSetup: './test/globalSetup.js',
        // A single shared DB across files; parallel runs contend on the same rows.
        fileParallelism: false,
    }
});
