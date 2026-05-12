import { createUser, getUserByEmail } from '../src/lib/server/auth';
import { adminEmails } from '../src/lib/server/env';
import { sql } from '../src/lib/server/db';

const email = (process.env.ADMIN_EMAIL || adminEmails()[0] || '').toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD, or ADMIN_EMAILS plus ADMIN_PASSWORD.');
  process.exit(1);
}

const existing = await getUserByEmail(email);
if (existing) {
  console.log(`Admin already exists: ${email}`);
  await sql.end();
  process.exit(0);
}

await createUser(email, password, 'admin');
console.log(`Created admin: ${email}`);
await sql.end();
