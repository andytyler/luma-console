import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { linkedinTargetsForEvent, runLinkedinForGuestsNow } from '$lib/server/immediate-enrichment';
import { requireEventAccess } from '$lib/server/permissions';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const eventId = params.id;
  const form = await request.formData();
  const next = String(form.get('next') ?? (eventId ? `/events/${eventId}` : '/events'));
  const mode = String(form.get('mode') ?? 'missing');
  const inline = request.headers.get('x-luma-console-action') === 'true';

  if (!eventId) {
    if (inline) return json({ ok: false, error: 'Missing event id.' }, { status: 400 });
    throw redirect(303, next);
  }

  await requireEventAccess(locals.user?.id, eventId, 'admin');
  const force = mode === 'force';
  console.info(
    `[linkedin:event:start] event=${eventId} mode=${force ? 'force' : 'missing'} user=${locals.user?.email ?? 'unknown'}`
  );
  const guests = await linkedinTargetsForEvent(eventId, force);
  const result = await runLinkedinForGuestsNow(guests);
  console.info(
    `[linkedin:event:done] event=${eventId} mode=${mode} selected=${result.selected} fetched=${result.fetched} skipped=${result.skipped} scored=${result.scored} failed=${result.failed}`
  );

  if (inline) {
    const message =
      `${force ? 'Fetched all' : 'Fetched missing'} LinkedIn profiles now: ${result.fetched} fetched, ${result.skipped} skipped, ${result.scored} scored, ${result.failed} failed.` +
      (result.errors.length ? ` First error: ${result.errors[0]}` : '');
    return json({
      ok: result.failed === 0,
      message,
      error: result.failed ? message : undefined
    });
  }

  throw redirect(303, next);
};
