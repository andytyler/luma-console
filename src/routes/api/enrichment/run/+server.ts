import { json, type RequestHandler } from '@sveltejs/kit';
import { runNextEnrichmentJob } from '$lib/server/enrichment';

export const POST: RequestHandler = async () => {
  const result = await runNextEnrichmentJob();
  return json(result ?? { idle: true });
};
