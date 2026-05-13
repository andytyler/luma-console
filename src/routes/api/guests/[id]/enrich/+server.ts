import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { enqueueGuestJobs } from '$lib/server/jobs';
import { requireGuestAccess } from '$lib/server/permissions';
import { enrichGithub } from '$lib/server/github';
import { enrichLinkedin } from '$lib/server/brightdata';
import { scoreGuest } from '$lib/server/scoring';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const guestId = params.id;
  const form = await request.formData();
  const next = String(form.get('next') ?? '/events');
  const types = form.getAll('type').map(String);
  const force = String(form.get('force') ?? '') === 'true';
  const inline = request.headers.get('x-luma-console-action') === 'true';
  const allowed = types.filter((type) =>
    ['github', 'brightdata_linkedin', 'score'].includes(type)
  ) as Array<'github' | 'brightdata_linkedin' | 'score'>;

  if (!guestId) {
    if (inline) return json({ ok: false, error: 'Missing guest id.' }, { status: 400 });
    throw redirect(303, next);
  }

  await requireGuestAccess(locals.user?.id, guestId, 'admin');
  const selected: Array<'github' | 'brightdata_linkedin' | 'score'> = allowed.length
    ? allowed
    : ['github', 'brightdata_linkedin', 'score'];
  let message = `Queued ${selected.join(', ')} enrichment.`;

  console.info(
    `[guest:enrich:start] guest=${guestId} types=${selected.join(',')} force=${force} user=${locals.user?.email ?? 'unknown'}`
  );
  if (force && (selected.includes('github') || selected.includes('brightdata_linkedin'))) {
    const handled = new Set<'github' | 'brightdata_linkedin' | 'score'>();
    const messages: string[] = [];

    try {
      if (selected.includes('github')) {
        const profile = await enrichGithub(guestId);
        await scoreGuest(guestId);
        handled.add('github');
        handled.add('score');
        if ('username' in profile) {
          messages.push(`Fetched GitHub graph for ${profile.username}.`);
          console.info(`[guest:enrich:github:done] guest=${guestId} username=${profile.username}`);
        } else {
          messages.push(`GitHub skipped: ${profile.reason}`);
          console.info(`[guest:enrich:github:skipped] guest=${guestId} reason=${profile.reason}`);
        }
      }
    } catch (exception) {
      const errorMessage = exception instanceof Error ? exception.message : String(exception);
      console.error(`[guest:enrich:github:error] guest=${guestId} queued_fallback=true`, errorMessage);
      await enqueueGuestJobs(guestId, ['github']);
      handled.add('github');
      messages.push(`GitHub fetch failed and was queued for retry: ${errorMessage}`);
    }

    try {
      if (selected.includes('brightdata_linkedin')) {
        const profile = await enrichLinkedin(guestId);
        await scoreGuest(guestId);
        handled.add('brightdata_linkedin');
        handled.add('score');
        if ('skipped' in profile) {
          messages.push(`LinkedIn skipped: ${profile.reason}`);
          console.info(`[guest:enrich:linkedin:skipped] guest=${guestId} reason=${profile.reason}`);
        } else {
          messages.push('Fetched LinkedIn profile.');
          console.info(`[guest:enrich:linkedin:done] guest=${guestId}`);
        }
      }
    } catch (exception) {
      const errorMessage = exception instanceof Error ? exception.message : String(exception);
      console.error(`[guest:enrich:linkedin:error] guest=${guestId} queued_fallback=true`, errorMessage);
      await enqueueGuestJobs(guestId, ['brightdata_linkedin']);
      handled.add('brightdata_linkedin');
      messages.push(`LinkedIn fetch failed and was queued for retry: ${errorMessage}`);
    }

    const remaining = selected.filter((type) => !handled.has(type));
    if (remaining.length) {
      await enqueueGuestJobs(guestId, remaining);
      console.info(`[guest:enrich:queued] guest=${guestId} types=${remaining.join(',')}`);
      messages.push(`Queued ${remaining.join(', ')}.`);
    }
    message = messages.join(' ');
  } else {
    await enqueueGuestJobs(guestId, selected);
    console.info(`[guest:enrich:queued] guest=${guestId} types=${selected.join(',')}`);
  }

  if (inline) return json({ ok: true, message });
  throw redirect(303, next);
};
