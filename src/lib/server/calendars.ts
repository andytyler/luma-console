import { createHash, randomUUID } from 'node:crypto';
import { jsonb, sql } from './db';
import { decryptSecret, encryptSecret, secretHint } from './crypto';
import { getCalendar } from './luma';
import { normalizeCalendar, normalizeCalendarPeople } from './luma-normalize';
import { syncEventsFromLuma } from './imports';
import { env, inviteEmailsEnabled } from './env';

type CalendarRole = 'owner' | 'admin' | 'reviewer';

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function randomInviteToken() {
  return randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
}

export async function calendarApiKey(calendarId: string) {
  const [calendar] = await sql<{ encrypted_api_key: string }[]>`
    select encrypted_api_key
    from luma_calendars
    where id = ${calendarId}
    limit 1
  `;
  if (!calendar) throw new Error('Calendar not found.');
  return decryptSecret(calendar.encrypted_api_key);
}

export async function userCalendars(userId: string) {
  return sql<{
    id: string;
    name: string;
    url: string | null;
    avatar_url: string | null;
    timezone: string | null;
    role: CalendarRole;
    last_synced_at: string | null;
  }[]>`
    select
      luma_calendars.id::text,
      luma_calendars.name,
      luma_calendars.url,
      luma_calendars.avatar_url,
      luma_calendars.timezone,
      calendar_memberships.role,
      luma_calendars.last_synced_at::text
    from calendar_memberships
    join luma_calendars on luma_calendars.id = calendar_memberships.calendar_id
    where calendar_memberships.user_id = ${userId}
    order by luma_calendars.created_at asc
  `;
}

export async function defaultCalendar(userId: string) {
  const [calendar] = await userCalendars(userId);
  return calendar ?? null;
}

export async function syncDiscoveredPeople(calendarId: string, rawCalendar: Record<string, unknown>) {
  const people = normalizeCalendarPeople(rawCalendar);

  for (const person of people) {
    await sql`
      insert into luma_calendar_people (
        calendar_id,
        email,
        name,
        luma_role,
        app_role,
        avatar_url,
        source,
        raw_json,
        updated_at
      )
      values (
        ${calendarId},
        ${person.email},
        ${person.name},
        ${person.lumaRole},
        ${person.appRole},
        ${person.avatarUrl},
        ${person.source},
        ${jsonb(person.raw)},
        now()
      )
      on conflict (calendar_id, email) do update set
        name = excluded.name,
        luma_role = excluded.luma_role,
        app_role = excluded.app_role,
        avatar_url = excluded.avatar_url,
        source = excluded.source,
        raw_json = excluded.raw_json,
        updated_at = now()
    `;
  }

  return people.length;
}

export async function connectCalendarWithApiKey(params: {
  apiKey: string;
  userId: string;
  syncEvents?: boolean;
}) {
  const raw = (await getCalendar({ apiKey: params.apiKey })) as Record<string, unknown>;
  const calendar = normalizeCalendar(raw);
  const encrypted = encryptSecret(params.apiKey);

  const [saved] = await sql<{ id: string }[]>`
    insert into luma_calendars (
      luma_calendar_id,
      name,
      slug,
      url,
      avatar_url,
      timezone,
      encrypted_api_key,
      api_key_hint,
      raw_json,
      created_by,
      last_synced_at,
      updated_at
    )
    values (
      ${calendar.lumaCalendarId},
      ${calendar.name},
      ${calendar.slug},
      ${calendar.url},
      ${calendar.avatarUrl},
      ${calendar.timezone},
      ${encrypted},
      ${secretHint(params.apiKey)},
      ${jsonb(calendar.raw)},
      ${params.userId},
      now(),
      now()
    )
    on conflict (luma_calendar_id) do update set
      name = excluded.name,
      slug = excluded.slug,
      url = excluded.url,
      avatar_url = excluded.avatar_url,
      timezone = excluded.timezone,
      encrypted_api_key = excluded.encrypted_api_key,
      api_key_hint = excluded.api_key_hint,
      raw_json = excluded.raw_json,
      last_synced_at = now(),
      updated_at = now()
    returning id::text
  `;

  await sql`
    insert into calendar_memberships (calendar_id, user_id, role)
    values (${saved.id}, ${params.userId}, 'owner')
    on conflict (calendar_id, user_id) do update set role = 'owner'
  `;

  const discoveredPeople = await syncDiscoveredPeople(saved.id, calendar.raw);
  const events = params.syncEvents
    ? await syncEventsFromLuma({ calendarId: saved.id, apiKey: params.apiKey })
    : { imported: 0 };

  return {
    calendarId: saved.id,
    calendar,
    discoveredPeople,
    importedEvents: events.imported
  };
}

export async function acceptPendingCalendarInvites(userId: string, email: string) {
  const invites = await sql<{ id: string; calendar_id: string; role: 'admin' | 'reviewer' }[]>`
    select id::text, calendar_id::text, role
    from calendar_invites
    where lower(email) = lower(${email})
      and accepted_at is null
      and expires_at > now()
  `;

  for (const invite of invites) {
    await sql`
      insert into calendar_memberships (calendar_id, user_id, role)
      values (${invite.calendar_id}, ${userId}, ${invite.role})
      on conflict (calendar_id, user_id) do update set role = excluded.role
    `;
    await sql`
      update calendar_invites
      set accepted_at = now(), accepted_by = ${userId}
      where id = ${invite.id}
    `;
  }

  return invites.length;
}

async function sendInviteEmail(params: {
  email: string;
  calendarName: string;
  inviteUrl: string;
}) {
  if (!inviteEmailsEnabled()) {
    return { status: 'dry_run' as const, error: null };
  }

  const apiKey = env('RESEND_API_KEY');
  const from = env('INVITE_EMAIL_FROM');
  if (!apiKey || !from) {
    return { status: 'failed' as const, error: 'RESEND_API_KEY and INVITE_EMAIL_FROM are required.' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: params.email,
      subject: `You were invited to ${params.calendarName} on Luma Console`,
      text: `Sign in with Google to review this Luma calendar: ${params.inviteUrl}`
    })
  });

  if (!response.ok) {
    return { status: 'failed' as const, error: await response.text() };
  }

  return { status: 'sent' as const, error: null };
}

export async function sendCalendarInvites(params: {
  calendarId: string;
  invitedBy: string;
  origin: string;
}) {
  const [calendar] = await sql<{ id: string; name: string }[]>`
    select id::text, name
    from luma_calendars
    where id = ${params.calendarId}
  `;
  if (!calendar) throw new Error('Calendar not found.');

  const people = await sql<{ email: string; app_role: 'admin' | 'reviewer' }[]>`
    select email, app_role
    from luma_calendar_people
    where calendar_id = ${params.calendarId}
      and email is not null
  `;

  let created = 0;
  let sent = 0;
  let dryRun = 0;
  let failed = 0;

  for (const person of people) {
    const token = randomInviteToken();
    const [invite] = await sql<{ id: string; inserted: boolean; token_hash: string }[]>`
      insert into calendar_invites (calendar_id, email, role, token_hash, invited_by)
      values (${params.calendarId}, ${person.email.toLowerCase()}, ${person.app_role}, ${tokenHash(token)}, ${params.invitedBy})
      on conflict (calendar_id, email) do update set
        role = excluded.role,
        invited_by = excluded.invited_by,
        expires_at = now() + interval '14 days'
      returning id::text, true as inserted, token_hash
    `;

    if (invite?.inserted) created += 1;

    const result = await sendInviteEmail({
      email: person.email,
      calendarName: calendar.name,
      inviteUrl: `${params.origin}/login?next=/events`
    });

    if (result.status === 'sent') sent += 1;
    if (result.status === 'dry_run') dryRun += 1;
    if (result.status === 'failed') failed += 1;

    await sql`
      update calendar_invites
      set
        send_status = ${result.status},
        sent_at = case when ${result.status} in ('sent', 'dry_run') then now() else sent_at end,
        last_error = ${result.error}
      where id = ${invite.id}
    `;
  }

  return { created, sent, dryRun, failed, people: people.length };
}
