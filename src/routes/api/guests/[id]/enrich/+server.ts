import { redirect, type RequestHandler } from '@sveltejs/kit';
import { enqueueGuestJobs } from '$lib/server/jobs';

export const POST: RequestHandler = async ({ params, request }) => {
  const guestId = params.id;
  const form = await request.formData();
  const next = String(form.get('next') ?? '/events');
  const types = form.getAll('type').map(String);
  const allowed = types.filter((type) =>
    ['github', 'brightdata_linkedin', 'score'].includes(type)
  ) as Array<'github' | 'brightdata_linkedin' | 'score'>;

  if (guestId) {
    await enqueueGuestJobs(guestId, allowed.length ? allowed : ['github', 'brightdata_linkedin', 'score']);
  }
  throw redirect(303, next);
};
