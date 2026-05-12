import { json, type RequestHandler } from '@sveltejs/kit';
import { syncGuestsForEvent } from '$lib/server/imports';
import { lumaConfigured } from '$lib/server/luma';

export const POST: RequestHandler = async ({ params }) => {
  const eventId = params.id;
  if (!eventId) {
    return json({ error: 'Missing event id.' }, { status: 400 });
  }
  if (!lumaConfigured()) {
    return json({ error: 'LUMA_API_KEY is not configured.' }, { status: 400 });
  }

  const result = await syncGuestsForEvent(eventId);
  return json(result);
};
