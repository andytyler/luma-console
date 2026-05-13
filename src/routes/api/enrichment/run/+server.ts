import { json, type RequestHandler } from '@sveltejs/kit';
import { runNextEnrichmentJob } from '$lib/server/enrichment';
import { requireEventAccess } from '$lib/server/permissions';

export const POST: RequestHandler = async ({ locals, url }) => {
  const eventId = url.searchParams.get('event_id') ?? '';
  if (!eventId) return json({ error: 'event_id is required.' }, { status: 400 });
  await requireEventAccess(locals.user?.id, eventId, 'admin');
  const result = await runNextEnrichmentJob(eventId);
  return json(result ?? { idle: true });
};
