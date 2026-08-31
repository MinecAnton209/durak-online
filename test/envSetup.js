import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The globalSetup hands off the container DATABASE_URL via this file. Load it
// so that any module imported before setup.js runs sees the right connection.
const envPath = path.join(__dirname, '.test-env.json');
if (fs.existsSync(envPath)) {
    const { DATABASE_URL } = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    process.env.DATABASE_URL = DATABASE_URL;
}
