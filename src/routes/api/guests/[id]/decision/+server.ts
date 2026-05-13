import { redirect, type RequestHandler } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { requireGuestAccess } from '$lib/server/permissions';

const statuses = new Set([
  'needs_review',
  'approve_candidate',
  'reject_candidate',
  'pool',
  'approved',
  'rejected'
]);

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const guestId = params.id;
  const form = await request.formData();
  const status = String(form.get('status') ?? '');
  const reason = String(form.get('reason') ?? '');
  const next = String(form.get('next') ?? '/events');

  if (!guestId || !statuses.has(status)) {
    throw redirect(303, next);
  }
  await requireGuestAccess(locals.user?.id, guestId);

  const [guest] = await sql<{ status_internal: string }[]>`
    select status_internal
    from guests
    where id = ${guestId}
    limit 1
  `;

  if (guest) {
    await sql`
      update guests
      set status_internal = ${status}, updated_at = now()
      where id = ${guestId}
    `;
    await sql`
      insert into decisions (guest_id, reviewer_user_id, from_status, to_status, reason)
      values (${guestId}, ${locals.user?.id ?? null}, ${guest.status_internal}, ${status}, ${reason || null})
    `;
  }

  throw redirect(303, next);
};
