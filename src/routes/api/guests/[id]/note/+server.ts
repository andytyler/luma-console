import { redirect, type RequestHandler } from '@sveltejs/kit';
import { sql } from '$lib/server/db';

export const POST: RequestHandler = async ({ params, request }) => {
  const guestId = params.id;
  const form = await request.formData();
  const notes = String(form.get('notes') ?? '');
  const next = String(form.get('next') ?? '/events');

  if (guestId) {
    await sql`
      update guests
      set notes = ${notes}, updated_at = now()
      where id = ${guestId}
    `;
  }

  throw redirect(303, next);
};
