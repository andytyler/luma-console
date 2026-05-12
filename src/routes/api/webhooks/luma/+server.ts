import { json, type RequestHandler } from '@sveltejs/kit';
import { receiveLumaWebhook } from '$lib/server/luma-webhooks';

export const POST: RequestHandler = async ({ request }) => {
  const rawBody = await request.text();
  const result = await receiveLumaWebhook(request.headers, rawBody);
  return json(result.body, { status: result.status });
};
