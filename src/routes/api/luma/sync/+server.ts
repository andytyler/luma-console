import { json, type RequestHandler } from '@sveltejs/kit';
import { syncEventsFromLuma } from '$lib/server/imports';
import { lumaConfigured } from '$lib/server/luma';
import { calendarApiKey, defaultCalendar } from '$lib/server/calendars';
import { requireCalendarAccess } from '$lib/server/permissions';

export const POST: RequestHandler = async ({ locals }) => {
  const calendar = locals.user ? await defaultCalendar(locals.user.id) : null;
  if (!calendar) return json({ error: 'No calendar connected.' }, { status: 400 });
  await requireCalendarAccess(locals.user?.id, calendar.id, 'admin');
  const apiKey = await calendarApiKey(calendar.id);
  if (!apiKey && !lumaConfigured()) {
    return json({ error: 'LUMA_API_KEY is not configured.' }, { status: 400 });
  }

  const result = await syncEventsFromLuma({ calendarId: calendar.id, apiKey: apiKey || undefined });
  return json(result);
};
