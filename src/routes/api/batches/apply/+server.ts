import { json, redirect, type RequestHandler } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { LumaError, updateGuestStatus } from '$lib/server/luma';
import { lumaWritesEnabled, setLumaBatchNote } from '$lib/server/settings';
import { decryptSecret } from '$lib/server/crypto';
import { requireEventAccess } from '$lib/server/permissions';

function targetInternalStatus(lumaStatus: string) {
  if (lumaStatus === 'approved') return 'approved';
  if (lumaStatus === 'declined') return 'rejected';
  return 'pool';
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const form = await request.formData();
  const eventId = String(form.get('event_id') ?? '');
  const sourceStatus = String(form.get('source_status') ?? '');
  const sourceLumaStatus = String(form.get('source_luma_status') ?? '');
  const usesLumaTransition = form.has('source_luma_status') || form.has('target_luma_status');
  const lumaStatus = String(form.get('target_luma_status') ?? form.get('luma_status') ?? '');
  const message = String(form.get('message') ?? '');
  const dryRun = String(form.get('dry_run') ?? 'true') !== 'false';
  const confirmed = String(form.get('confirm') ?? '') === 'APPLY';
  const next = String(form.get('next') ?? `/events/${eventId}`);
  const inline = request.headers.get('x-luma-console-action') === 'true';

  if (!['approved', 'declined'].includes(lumaStatus)) {
    if (inline) return json({ ok: false, error: 'Unsupported Luma status for batch apply.' }, { status: 400 });
    throw redirect(303, next);
  }

  const writesEnabled = await lumaWritesEnabled();
  if (!dryRun && !confirmed) {
    const errorMessage = 'Type APPLY before sending updates to Luma.';
    if (inline) return json({ ok: false, error: errorMessage }, { status: 400 });
    throw redirect(303, `${next}?batch=failed&count=0&error=${encodeURIComponent(errorMessage)}`);
  }
  if (!dryRun && !writesEnabled) {
    const errorMessage = 'Enable Luma writes in Setup before sending updates.';
    if (inline) return json({ ok: false, error: errorMessage }, { status: 400 });
    throw redirect(303, `${next}?batch=failed&count=0&error=${encodeURIComponent(errorMessage)}`);
  }

  const eventAccess = await requireEventAccess(locals.user?.id, eventId, 'admin');
  await setLumaBatchNote(eventId, lumaStatus, message);
  const apiKey = eventAccess.encrypted_api_key ? decryptSecret(eventAccess.encrypted_api_key) : undefined;
  const batchFilter = usesLumaTransition
    ? sql`
      and guests.desired_luma_status = ${lumaStatus}
      and coalesce(guests.approval_status, '') <> guests.desired_luma_status
      and coalesce(guests.approval_status, '') = ${sourceLumaStatus}
    `
    : sql`and guests.status_internal = ${sourceStatus}`;

  const guests = await sql<{
    id: string;
    luma_guest_id: string;
    luma_event_id: string;
    approval_status: string | null;
    desired_luma_status: string | null;
    status_internal: string;
  }[]>`
    select
      guests.id::text,
      guests.luma_guest_id,
      events.luma_event_id,
      guests.approval_status,
      guests.desired_luma_status,
      guests.status_internal
    from guests
    join events on events.id = guests.event_id
    where guests.event_id = ${eventId}
      ${batchFilter}
    order by guests.approval_status asc nulls first, guests.score desc
  `;

  const realWrite = !dryRun && confirmed && writesEnabled;
  let applied = 0;

  for (const guest of guests) {
    try {
      await updateGuestStatus({
        eventId: guest.luma_event_id,
        guestId: guest.luma_guest_id,
        approvalStatus: lumaStatus as 'approved' | 'declined',
        message,
        dryRun: !realWrite,
        confirmed,
        writesEnabled: realWrite,
        apiKey
      });
    } catch (exception) {
      const lumaError = exception instanceof LumaError ? exception : null;
      const errorMessage = lumaError
        ? `Luma rejected ${guest.luma_guest_id} with ${lumaError.status}: ${JSON.stringify(lumaError.payload)}`
        : exception instanceof Error
          ? exception.message
          : String(exception);

      console.error('[batch:apply:error]', {
        eventId,
        guestId: guest.id,
        lumaGuestId: guest.luma_guest_id,
        status: lumaStatus,
        sourceStatus,
        sourceLumaStatus,
        usesLumaTransition,
        applied,
        error: errorMessage
      });

      if (inline) {
        return json(
          {
            ok: false,
            error: `Batch stopped after ${applied} applied. ${errorMessage}`
          },
          { status: 502 }
        );
      }

      throw redirect(
        303,
        `${next}?batch=failed&count=${applied}&error=${encodeURIComponent(errorMessage.slice(0, 180))}`
      );
    }

    if (realWrite) {
      const toStatus = targetInternalStatus(lumaStatus);
      await sql`
        update guests
        set
          status_internal = ${toStatus},
          approval_status = ${lumaStatus},
          desired_luma_status = ${lumaStatus},
          updated_at = now()
        where id = ${guest.id}
      `;
      await sql`
        insert into decisions (guest_id, reviewer_user_id, from_status, to_status, reason)
        values (
          ${guest.id},
          ${locals.user?.id ?? null},
          ${usesLumaTransition ? `luma:${guest.approval_status ?? 'unknown'}` : guest.status_internal},
          ${usesLumaTransition ? `luma:${lumaStatus}` : toStatus},
          ${
            [
              usesLumaTransition ? 'Batch Luma transition apply' : 'Batch Luma apply',
              message ? `Batch note: ${message.slice(0, 500)}` : null
            ]
              .filter(Boolean)
              .join('. ')
          }
        )
      `;
      applied += 1;
    }
  }

  if (inline) {
    return json({
      ok: true,
      message: `${realWrite ? 'Applied' : 'Dry-run completed'} ${realWrite ? applied : guests.length} guests.`
    });
  }

  throw redirect(303, `${next}?batch=${realWrite ? 'applied' : 'dry-run'}&count=${guests.length}`);
};
