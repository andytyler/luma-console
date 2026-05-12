import { type RequestHandler } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { toCsv } from '$lib/server/csv';

export const GET: RequestHandler = async ({ url }) => {
  const eventId = url.searchParams.get('event_id') ?? '';
  const rows = await sql<{
    name: string | null;
    email: string;
    status_internal: string;
    approval_status: string | null;
    score: number;
    current_title: string | null;
    current_company: string | null;
    github_username: string | null;
    linkedin_url: string | null;
    notes: string;
    answers: string;
  }[]>`
    select
      guests.name,
      guests.email,
      guests.status_internal,
      guests.approval_status,
      guests.score,
      profiles.current_title,
      profiles.current_company,
      profiles.github_username,
      profiles.linkedin_url,
      guests.notes,
      coalesce(string_agg(registration_answers.question || ': ' || coalesce(registration_answers.answer, ''), E'\n'), '') as answers
    from guests
    left join profiles on profiles.guest_id = guests.id
    left join registration_answers on registration_answers.guest_id = guests.id
    where guests.event_id = ${eventId}
    group by guests.id, profiles.id
    order by guests.score desc, guests.registered_at asc nulls last
  `;

  const csv = toCsv([
    [
      'name',
      'email',
      'internal_status',
      'luma_status',
      'score',
      'title',
      'company',
      'github',
      'linkedin',
      'notes',
      'answers'
    ],
    ...rows.map((row) => [
      row.name,
      row.email,
      row.status_internal,
      row.approval_status,
      row.score,
      row.current_title,
      row.current_company,
      row.github_username,
      row.linkedin_url,
      row.notes,
      row.answers
    ])
  ]);

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="luma-guests.csv"'
    }
  });
};
