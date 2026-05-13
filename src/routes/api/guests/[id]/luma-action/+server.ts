import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireGuestAccess } from '$lib/server/permissions';

const desiredStatuses = new Set(['', 'approved', 'declined']);

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const guestId = params.id;
  const form = await request.formData();
  const desired = String(form.get('desired_luma_status') ?? '');
  const next = String(form.get('next') ?? '/events');
  const inline = request.headers.get('x-luma-console-action') === 'true';

  if (!guestId || !desiredStatuses.has(desired)) {
    if (inline) return json({ ok: false, error: 'Unsupported desired Luma status.' }, { status: 400 });
    throw redirect(303, next);
  }

  await requireGuestAccess(locals.user?.id, guestId);

  const [guest] = await sql<{
    email: string;
    approval_status: string | null;
    desired_luma_status: string | null;
  }[]>`
    select email, approval_status, desired_luma_status
    from guests
    where id = ${guestId}
    limit 1
  `;

  if (!guest) {
    if (inline) return json({ ok: false, error: 'Guest not found.' }, { status: 404 });
    throw redirect(303, next);
  }

  const desiredStatus = desired || null;
  await sql`
    update guests
    set desired_luma_status = ${desiredStatus}, updated_at = now()
    where id = ${guestId}
  `;

  await sql`
    insert into decisions (guest_id, reviewer_user_id, from_status, to_status, reason)
    values (
      ${guestId},
      ${locals.user?.id ?? null},
      ${guest.desired_luma_status ? `luma_action:${guest.desired_luma_status}` : 'luma_action:none'},
      ${desiredStatus ? `luma_action:${desiredStatus}` : 'luma_action:none'},
      ${`Actual Luma state: ${guest.approval_status ?? 'unknown'}`}
    )
  `;

  console.info('[guest:luma-action:saved]', {
    guestId,
    email: guest.email,
    actual: guest.approval_status,
    from: guest.desired_luma_status,
    to: desiredStatus,
    user: locals.user?.email
  });

  if (inline) {
    return json({
      ok: true,
      message: desiredStatus
        ? `Queued ${guest.email} for ${desiredStatus}.`
        : `Cleared queued Luma action for ${guest.email}.`
    });
  }

  throw redirect(303, next);
};
