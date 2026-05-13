import { json, type RequestHandler } from '@sveltejs/kit';
import { syncGuestsForEvent } from '$lib/server/imports';
import { lumaConfigured } from '$lib/server/luma';
import { requireEventAccess } from '$lib/server/permissions';

export const POST: RequestHandler = async ({ params, locals }) => {
  const eventId = params.id;
  if (!eventId) {
    return json({ error: 'Missing event id.' }, { status: 400 });
  }
  const access = await requireEventAccess(locals.user?.id, eventId, 'admin');
  if (!lumaConfigured()) {
    if (!access.encrypted_api_key) {
      return json({ error: 'LUMA_API_KEY is not configured.' }, { status: 400 });
    }
  }

  const result = await syncGuestsForEvent(eventId);
  return json(result);
};
