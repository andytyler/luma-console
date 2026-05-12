import { redirect, type RequestHandler } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { updateGuestStatus } from '$lib/server/luma';
import { lumaWritesEnabled } from '$lib/server/env';

function targetInternalStatus(lumaStatus: string) {
  if (lumaStatus === 'approved') return 'approved';
  if (lumaStatus === 'declined') return 'rejected';
  return 'pool';
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const form = await request.formData();
  const eventId = String(form.get('event_id') ?? '');
  const sourceStatus = String(form.get('source_status') ?? '');
  const lumaStatus = String(form.get('luma_status') ?? '');
  const message = String(form.get('message') ?? '');
  const dryRun = String(form.get('dry_run') ?? 'true') !== 'false';
  const confirmed = String(form.get('confirm') ?? '') === 'APPLY';
  const next = String(form.get('next') ?? `/events/${eventId}`);

  if (!['approved', 'declined', 'waitlist'].includes(lumaStatus)) {
    throw redirect(303, next);
  }

  const guests = await sql<{
    id: string;
    luma_guest_id: string;
    luma_event_id: string;
    status_internal: string;
  }[]>`
    select guests.id::text, guests.luma_guest_id, events.luma_event_id, guests.status_internal
    from guests
    join events on events.id = guests.event_id
    where guests.event_id = ${eventId}
      and guests.status_internal = ${sourceStatus}
    order by guests.score desc
  `;

  const realWrite = !dryRun && confirmed && lumaWritesEnabled();
  for (const guest of guests) {
    await updateGuestStatus({
      eventId: guest.luma_event_id,
      guestId: guest.luma_guest_id,
      approvalStatus: lumaStatus as 'approved' | 'declined' | 'waitlist',
      message,
      dryRun: !realWrite,
      confirmed
    });

    if (realWrite) {
      const toStatus = targetInternalStatus(lumaStatus);
      await sql`
        update guests
        set status_internal = ${toStatus}, approval_status = ${lumaStatus}, updated_at = now()
        where id = ${guest.id}
      `;
      await sql`
        insert into decisions (guest_id, reviewer_user_id, from_status, to_status, reason)
        values (${guest.id}, ${locals.user?.id ?? null}, ${guest.status_internal}, ${toStatus}, 'Batch Luma apply')
      `;
    }
  }

  throw redirect(303, `${next}?batch=${realWrite ? 'applied' : 'dry-run'}&count=${guests.length}`);
};
