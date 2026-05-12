import { redirect, type RequestHandler } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { scoreGuest } from '$lib/server/scoring';

export const POST: RequestHandler = async ({ params, request }) => {
  const guestId = params.id;
  const form = await request.formData();
  const next = String(form.get('next') ?? '/events');
  const mode = String(form.get('mode') ?? 'rescore');

  if (!guestId) {
    throw redirect(303, next);
  }

  if (mode === 'manual') {
    const score = Math.max(0, Math.min(100, Number(form.get('score') ?? 0)));
    await sql`
      update guests
      set score = ${score}, score_locked = true, updated_at = now()
      where id = ${guestId}
    `;
  } else {
    await sql`update guests set score_locked = false where id = ${guestId}`;
    await scoreGuest(guestId);
  }

  throw redirect(303, next);
};
