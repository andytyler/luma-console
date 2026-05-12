import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from '../src/lib/server/db';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '../src/lib/server/schema.sql');
const schema = await readFile(schemaPath, 'utf8');

await sql.unsafe(schema);
await sql.end();

console.log('Database schema is up to date.');
