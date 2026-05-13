import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { sql } from './db';
import { adminEmails } from './env';
import { acceptPendingCalendarInvites } from './calendars';

const SESSION_DAYS = 14;
export const sessionCookieName = 'luma_session';

export type UserRole = 'admin' | 'reviewer';
export type User = {
  id: string;
  email: string;
  role: UserRole;
  name?: string | null;
  avatar_url?: string | null;
};

function base64url(buffer: Buffer) {
  return buffer.toString('base64url');
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function randomToken() {
  return base64url(randomBytes(32));
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${base64url(salt)}$${base64url(key)}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, n, r, p, saltEncoded, keyEncoded] = storedHash.split('$');
  if (scheme !== 'scrypt' || !saltEncoded || !keyEncoded) return false;

  const salt = Buffer.from(saltEncoded, 'base64url');
  const expected = Buffer.from(keyEncoded, 'base64url');
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function countUsers() {
  const [row] = await sql<{ count: string }[]>`select count(*)::text as count from users`;
  return Number(row.count);
}

export async function getUserByEmail(email: string) {
  const [user] = await sql<User[]>`
    select id::text, email, role
    from users
    where lower(email) = lower(${email})
    limit 1
  `;
  return user ?? null;
}

export async function createUser(email: string, password: string, role: UserRole) {
  const passwordHash = await hashPassword(password);
  const [user] = await sql<User[]>`
    insert into users (email, password_hash, role)
    values (${email.toLowerCase()}, ${passwordHash}, ${role})
    returning id::text, email, role
  `;
  return user;
}

export async function upsertSupabaseUser(supabaseUser: SupabaseUser) {
  const email = supabaseUser.email?.toLowerCase();
  if (!email) return null;

  const metadata = supabaseUser.user_metadata ?? {};
  const name =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : null;
  const avatar =
    typeof metadata.avatar_url === 'string'
      ? metadata.avatar_url
      : typeof metadata.picture === 'string'
        ? metadata.picture
        : null;
  const role: UserRole = adminEmails().includes(email) ? 'admin' : 'reviewer';

  const [user] = await sql<User[]>`
    insert into users (supabase_user_id, email, name, avatar_url, role)
    values (${supabaseUser.id}, ${email}, ${name}, ${avatar}, ${role})
    on conflict (email) do update set
      supabase_user_id = coalesce(users.supabase_user_id, excluded.supabase_user_id),
      name = excluded.name,
      avatar_url = excluded.avatar_url,
      role = case when users.role = 'admin' then users.role else excluded.role end,
      updated_at = now()
    returning id::text, email, role, name, avatar_url
  `;

  await acceptPendingCalendarInvites(user.id, email);
  return user;
}

export async function authenticate(email: string, password: string) {
  const [row] = await sql<(User & { password_hash: string })[]>`
    select id::text, email, role, password_hash
    from users
    where lower(email) = lower(${email})
    limit 1
  `;
  if (!row) return null;

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;

  return {
    id: row.id,
    email: row.email,
    role: row.role
  };
}

export async function createSession(userId: string) {
  const token = randomToken();
  await sql`
    delete from sessions
    where expires_at < now()
  `;
  await sql`
    insert into sessions (user_id, token_hash, expires_at)
    values (${userId}, ${tokenHash(token)}, now() + (${SESSION_DAYS} || ' days')::interval)
  `;
  return token;
}

export async function getSession(token: string) {
  const [row] = await sql<(User & { session_id: string })[]>`
    select
      sessions.id::text as session_id,
      users.id::text,
      users.email,
      users.role
    from sessions
    join users on users.id = sessions.user_id
    where sessions.token_hash = ${tokenHash(token)}
      and sessions.expires_at > now()
    limit 1
  `;

  if (!row) return null;
  return {
    sessionId: row.session_id,
    user: {
      id: row.id,
      email: row.email,
      role: row.role
    }
  };
}

export async function deleteSession(sessionId: string) {
  await sql`delete from sessions where id = ${sessionId}`;
}

export async function createInvitation(email: string, role: UserRole, invitedBy: string) {
  const token = randomToken();
  const [invite] = await sql<{ id: string; email: string; role: UserRole; expires_at: string }[]>`
    insert into invitations (email, role, token_hash, invited_by, expires_at)
    values (${email.toLowerCase()}, ${role}, ${tokenHash(token)}, ${invitedBy}, now() + interval '7 days')
    returning id::text, email, role, expires_at::text
  `;

  return {
    ...invite,
    token
  };
}

export async function getInvitationByToken(token: string) {
  const [invite] = await sql<{ id: string; email: string; role: UserRole; expires_at: string }[]>`
    select id::text, email, role, expires_at::text
    from invitations
    where token_hash = ${tokenHash(token)}
      and accepted_at is null
      and expires_at > now()
    limit 1
  `;
  return invite ?? null;
}

export async function acceptInvitation(token: string, password: string) {
  const invite = await getInvitationByToken(token);
  if (!invite) return null;

  const existing = await getUserByEmail(invite.email);
  const user = existing ?? (await createUser(invite.email, password, invite.role));

  if (existing) {
    const passwordHash = await hashPassword(password);
    await sql`
      update users
      set password_hash = ${passwordHash}, role = ${invite.role}, updated_at = now()
      where id = ${existing.id}
    `;
  }

  await sql`
    update invitations
    set accepted_at = now(), accepted_by = ${user.id}
    where id = ${invite.id}
  `;

  return user;
}

export function sessionCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60
  };
}
