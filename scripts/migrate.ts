import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '../src/lib/server/schema.sql');
const schema = await readFile(schemaPath, 'utf8');
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/luma_console';

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlClient(url: string) {
  return postgres(url, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 20,
    prepare: false,
    transform: {
      undefined: null
    }
  });
}

async function runSchema() {
  const sql = sqlClient(databaseUrl);
  try {
    await sql.unsafe(schema);
  } finally {
    await sql.end();
  }
}

async function createMissingDatabase() {
  const targetUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(targetUrl.pathname.replace(/^\//, ''));

  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name.');
  }

  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.pathname = '/postgres';

  const sql = sqlClient(maintenanceUrl.toString());
  try {
    const [existing] = await sql<{ exists: boolean }[]>`
      select exists(select 1 from pg_database where datname = ${databaseName}) as exists
    `;

    if (!existing.exists) {
      await sql.unsafe(`create database ${quoteIdentifier(databaseName)}`);
      console.log(`Created database "${databaseName}".`);
    }
  } finally {
    await sql.end();
  }
}

try {
  await runSchema();
} catch (error) {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '3D000') {
    await createMissingDatabase();
    await runSchema();
  } else {
    throw error;
  }
}

console.log('Database schema is up to date.');
