import { GenericContainer, Wait } from 'testcontainers';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POSTGRES_USER = 'durak_test';
const POSTGRES_PASSWORD = 'durak_test_pass';
const POSTGRES_DB = 'durak_test';

let container;
let migrateClient;

export async function setup() {
    console.log('[Test Setup] Starting Postgres Testcontainer...');
    container = await new GenericContainer('postgres:16')
        .withEnvironment({ POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forListeningPorts())
        .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const url = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${host}:${port}/${POSTGRES_DB}`;

    // Persist the mapped URL for worker processes (globalSetup process.env is not visible to them).
    const envPath = path.join(__dirname, '.test-env.json');
    fs.writeFileSync(envPath, JSON.stringify({ DATABASE_URL: url }));
    process.env.DATABASE_URL = url;

    // Apply the Drizzle migrations programmatically against the container.
    migrateClient = postgres(url, { max: 1 });
    const migrator = drizzle(migrateClient);
    await migrate(migrator, {
        migrationsFolder: path.join(__dirname, '..', 'db', 'migrations'),
    });

    console.log('[Test Setup] Schema migrated. DATABASE_URL handed off to workers.');
}

export async function teardown() {
    if (migrateClient) {
        await migrateClient.end();
    }
    if (container) {
        await container.stop();
    }
    const envPath = path.join(__dirname, '.test-env.json');
    if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
    }
    console.log('[Test Teardown] Testcontainer stopped.');
}
