import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireGuestAccess } from '$lib/server/permissions';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const guestId = params.id;
  const form = await request.formData();
  const notes = String(form.get('notes') ?? '');
  const next = String(form.get('next') ?? '/events');
  const wantsJson = request.headers.get('x-luma-console-action') === 'true';

  if (guestId) {
    await requireGuestAccess(locals.user?.id, guestId);
    await sql`
      update guests
      set notes = ${notes}, updated_at = now()
      where id = ${guestId}
    `;
  }

  if (wantsJson) {
    return json({ ok: true, message: 'Note saved.' });
  }

  throw redirect(303, next);
};
