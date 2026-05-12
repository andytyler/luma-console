import { json, type RequestHandler } from '@sveltejs/kit';
import { sql } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  const form = await request.formData();
  const eventId = String(form.get('event_id') ?? '');
  const sourceStatus = String(form.get('source_status') ?? '');

  const rows = await sql<{ id: string; name: string | null; email: string; score: number }[]>`
    select id::text, name, email, score
    from guests
    where event_id = ${eventId}
      and status_internal = ${sourceStatus}
    order by score desc, registered_at asc nulls last
  `;

  return json({ count: rows.length, guests: rows });
};
