import { json, type RequestHandler } from '@sveltejs/kit';
import { syncEventsFromLuma } from '$lib/server/imports';
import { lumaConfigured } from '$lib/server/luma';

export const POST: RequestHandler = async () => {
  if (!lumaConfigured()) {
    return json({ error: 'LUMA_API_KEY is not configured.' }, { status: 400 });
  }

  const result = await syncEventsFromLuma();
  return json(result);
};
