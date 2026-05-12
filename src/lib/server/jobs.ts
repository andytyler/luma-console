import { sql } from './db';

export type EnrichmentJobType = 'github' | 'brightdata_linkedin' | 'score';

export async function enqueueScoreJobs(guestIds: string[]) {
  if (guestIds.length === 0) return;

  await sql`
    insert into enrichment_jobs (guest_id, type, status, run_after)
    select guest_id, 'score', 'queued', now()
    from unnest(${guestIds}::uuid[]) as ids(guest_id)
    on conflict (guest_id, type) do update set
      status = 'queued',
      error = null,
      run_after = now(),
      finished_at = null
  `;
}

export async function enqueueGuestJobs(guestId: string, types: EnrichmentJobType[]) {
  for (const type of types) {
    await sql`
      insert into enrichment_jobs (guest_id, type, status, run_after)
      values (${guestId}, ${type}, 'queued', now())
      on conflict (guest_id, type) do update set
        status = 'queued',
        error = null,
        run_after = now(),
        finished_at = null
    `;
  }
}

export async function enqueueEventJobs(eventId: string, types: EnrichmentJobType[]) {
  const [result] = await sql<{ count: number }[]>`
    with event_guests as (
      select id
      from guests
      where event_id = ${eventId}
    ),
    requested_types as (
      select unnest(${types}::text[]) as type
    ),
    inserted as (
      insert into enrichment_jobs (guest_id, type, status, run_after)
      select event_guests.id, requested_types.type, 'queued', now()
      from event_guests
      cross join requested_types
      on conflict (guest_id, type) do update set
        status = 'queued',
        error = null,
        run_after = now(),
        finished_at = null
      returning id
    )
    select count(*)::int as count from inserted
  `;

  return result.count;
}
