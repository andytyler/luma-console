import { error, fail, type Actions } from '@sveltejs/kit';
import type { UserRole } from '$lib/server/auth';
import { sql } from '$lib/server/db';
import { defaultCalendar, sendCalendarInvites, userCalendars } from '$lib/server/calendars';
import { requireCalendarAccess } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

const roles = new Set(['admin', 'reviewer']);

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw error(401, 'Sign in required');
  }

  const calendars = await userCalendars(locals.user.id);
  const calendarId = url.searchParams.get('calendar_id') ?? (await defaultCalendar(locals.user.id))?.id ?? '';
  if (calendarId) await requireCalendarAccess(locals.user.id, calendarId, 'admin');

  const [users, invites, people] = await Promise.all([
    sql<{ id: string; email: string; role: UserRole; created_at: string }[]>`
      select users.id::text, users.email, calendar_memberships.role, calendar_memberships.created_at::text
      from calendar_memberships
      join users on users.id = calendar_memberships.user_id
      where calendar_memberships.calendar_id = ${calendarId}
      order by calendar_memberships.created_at desc
    `,
    sql<{
      id: string;
      email: string;
      role: UserRole;
      expires_at: string;
      accepted_at: string | null;
      send_status: string;
      sent_at: string | null;
      last_error: string | null;
      created_at: string;
    }[]>`
      select
        id::text,
        email,
        role,
        expires_at::text,
        accepted_at::text,
        send_status,
        sent_at::text,
        last_error,
        created_at::text
      from calendar_invites
      where calendar_id = ${calendarId}
      order by created_at desc
      limit 25
    `,
    sql<{
      id: string;
      email: string | null;
      name: string | null;
      luma_role: string | null;
      app_role: UserRole;
      avatar_url: string | null;
      source: string | null;
    }[]>`
      select id::text, email, name, luma_role, app_role, avatar_url, source
      from luma_calendar_people
      where calendar_id = ${calendarId}
      order by app_role asc, email asc
    `
  ]);

  return { users, invites, people, calendars, selectedCalendarId: calendarId };
};

export const actions: Actions = {
  create: async ({ request, locals, url }) => {
    if (!locals.user) {
      throw error(401, 'Sign in required');
    }

    const form = await request.formData();
    const calendarId = String(form.get('calendar_id') ?? '');
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const role = String(form.get('role') ?? 'reviewer') as UserRole;
    await requireCalendarAccess(locals.user.id, calendarId, 'admin');

    if (!email || !email.includes('@')) {
      return fail(400, { message: 'Enter a valid email.', email, role });
    }
    if (!roles.has(role)) {
      return fail(400, { message: 'Choose a valid role.', email, role });
    }

    await sql`
      insert into luma_calendar_people (calendar_id, email, app_role, source)
      values (${calendarId}, ${email}, ${role}, 'manual')
      on conflict (calendar_id, email) do update set app_role = excluded.app_role, updated_at = now()
    `;
    const { sendCalendarInvites } = await import('$lib/server/calendars');
    await sendCalendarInvites({ calendarId, invitedBy: locals.user.id, origin: url.origin });
    return {
      message: `Prepared invite for ${email}.`
    };
  },
  sendAll: async ({ locals, request, url }) => {
    if (!locals.user) throw error(401, 'Sign in required');
    const form = await request.formData();
    const calendarId = String(form.get('calendar_id') ?? '');
    await requireCalendarAccess(locals.user.id, calendarId, 'admin');
    const result = await sendCalendarInvites({ calendarId, invitedBy: locals.user.id, origin: url.origin });
    return {
      message: `Processed ${result.people} invite candidates: ${result.sent} sent, ${result.dryRun} dry-run, ${result.failed} failed.`
    };
  }
};
