import { error } from '@sveltejs/kit';
import { sql } from './db';

type CalendarRole = 'owner' | 'admin' | 'reviewer';

const roleRank: Record<CalendarRole, number> = {
  reviewer: 1,
  admin: 2,
  owner: 3
};

export async function requireCalendarAccess(
  userId: string | undefined,
  calendarId: string,
  minimumRole: CalendarRole = 'reviewer'
) {
  if (!userId) throw error(401, 'Sign in required.');

  const [membership] = await sql<{ role: CalendarRole }[]>`
    select role
    from calendar_memberships
    where user_id = ${userId}
      and calendar_id = ${calendarId}
    limit 1
  `;

  if (!membership || roleRank[membership.role] < roleRank[minimumRole]) {
    throw error(403, 'You do not have access to this calendar.');
  }

  return membership;
}

export async function requireEventAccess(
  userId: string | undefined,
  eventId: string,
  minimumRole: CalendarRole = 'reviewer'
) {
  if (!userId) throw error(401, 'Sign in required.');

  const [event] = await sql<{
    id: string;
    calendar_id: string;
    role: CalendarRole;
    encrypted_api_key: string | null;
  }[]>`
    select
      events.id::text,
      events.calendar_id::text,
      calendar_memberships.role,
      luma_calendars.encrypted_api_key
    from events
    join calendar_memberships on calendar_memberships.calendar_id = events.calendar_id
    left join luma_calendars on luma_calendars.id = events.calendar_id
    where events.id = ${eventId}
      and calendar_memberships.user_id = ${userId}
    limit 1
  `;

  if (!event || roleRank[event.role] < roleRank[minimumRole]) {
    throw error(403, 'You do not have access to this event.');
  }

  return event;
}

export async function requireGuestAccess(
  userId: string | undefined,
  guestId: string,
  minimumRole: CalendarRole = 'reviewer'
) {
  if (!userId) throw error(401, 'Sign in required.');

  const [guest] = await sql<{
    id: string;
    event_id: string;
    calendar_id: string;
    role: CalendarRole;
  }[]>`
    select
      guests.id::text,
      guests.event_id::text,
      events.calendar_id::text,
      calendar_memberships.role
    from guests
    join events on events.id = guests.event_id
    join calendar_memberships on calendar_memberships.calendar_id = events.calendar_id
    where guests.id = ${guestId}
      and calendar_memberships.user_id = ${userId}
    limit 1
  `;

  if (!guest || roleRank[guest.role] < roleRank[minimumRole]) {
    throw error(403, 'You do not have access to this guest.');
  }

  return guest;
}
