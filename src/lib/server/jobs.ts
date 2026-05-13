import { sql } from './db';

export type EnrichmentJobType = 'github' | 'brightdata_linkedin' | 'score';
export type EnrichmentJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

type EnqueueOptions = {
  force?: boolean;
};

type JobMutationCounts = Record<EnrichmentJobStatus, number> & {
  stopped: number;
  total: number;
};

const allJobTypes: EnrichmentJobType[] = ['github', 'brightdata_linkedin', 'score'];
const clearableJobStatuses: EnrichmentJobStatus[] = ['succeeded', 'failed'];

function selectedTypes(types?: EnrichmentJobType[]) {
  return types?.length ? types : allJobTypes;
}

function mutationCounts(row?: Partial<JobMutationCounts>): JobMutationCounts {
  return {
    queued: row?.queued ?? 0,
    running: row?.running ?? 0,
    succeeded: row?.succeeded ?? 0,
    failed: row?.failed ?? 0,
    stopped: row?.stopped ?? 0,
    total: row?.total ?? 0
  };
}

export async function enqueueScoreJobs(guestIds: string[]) {
  if (guestIds.length === 0) return;

  await sql`
    insert into enrichment_jobs (guest_id, type, status, run_after)
    select guest_id, 'score', 'queued', now()
    from unnest(${guestIds}::uuid[]) as ids(guest_id)
    on conflict (guest_id, type) do update set
      status = 'queued',
      attempts = 0,
      error = null,
      run_after = now(),
      started_at = null,
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
        attempts = 0,
        error = null,
        run_after = now(),
        started_at = null,
        finished_at = null
    `;
    console.info(`[jobs:guest:queued] guest=${guestId} type=${type}`);
  }
}

export async function enqueueGithubJobsForGuests(guestIds: string[], options: EnqueueOptions = {}) {
  if (guestIds.length === 0) return 0;
  const force = Boolean(options.force);

  const [result] = await sql<{ count: number }[]>`
    with selected_guests as (
      select ids.guest_id
      from unnest(${guestIds}::uuid[]) as ids(guest_id)
      left join github_profiles on github_profiles.guest_id = ids.guest_id
      where ${force}::boolean or github_profiles.id is null
    ),
    inserted as (
      insert into enrichment_jobs (guest_id, type, status, run_after)
      select selected_guests.guest_id, 'github', 'queued', now()
      from selected_guests
      on conflict (guest_id, type) do update set
        status = 'queued',
        attempts = 0,
        error = null,
        run_after = now(),
        started_at = null,
        finished_at = null
      returning id
    )
    select count(*)::int as count from inserted
  `;

  return result.count;
}

export async function enqueueGithubJobsForEvent(eventId: string, options: EnqueueOptions = {}) {
  const force = Boolean(options.force);

  const [result] = await sql<{ count: number }[]>`
    with event_guests as (
      select guests.id
      from guests
      left join github_profiles on github_profiles.guest_id = guests.id
      where guests.event_id = ${eventId}
        and (${force}::boolean or github_profiles.id is null)
    ),
    inserted as (
      insert into enrichment_jobs (guest_id, type, status, run_after)
      select event_guests.id, 'github', 'queued', now()
      from event_guests
      on conflict (guest_id, type) do update set
        status = 'queued',
        attempts = 0,
        error = null,
        run_after = now(),
        started_at = null,
        finished_at = null
      returning id
    )
    select count(*)::int as count from inserted
  `;

  return result.count;
}

export async function enqueueLinkedinJobsForEvent(eventId: string, options: EnqueueOptions = {}) {
  const force = Boolean(options.force);
  console.info(`[jobs:linkedin:event:start] event=${eventId} mode=${force ? 'force' : 'missing'}`);

  const [result] = await sql<{ count: number }[]>`
    with event_guests as (
      select guests.id
      from guests
      left join profiles on profiles.guest_id = guests.id
      where guests.event_id = ${eventId}
        and (
          profiles.linkedin_url is not null
          or exists (
            select 1
            from registration_answers
            where registration_answers.guest_id = guests.id
              and (
                registration_answers.question ilike '%linkedin%'
                or registration_answers.answer ilike '%linkedin%'
                or registration_answers.answer ilike '/in/%'
                or registration_answers.answer ilike 'in/%'
              )
          )
        )
        and (
          ${force}::boolean
          or profiles.id is null
          or profiles.linkedin_url is null
          or profiles.raw_json = '{}'::jsonb
          or (profiles.current_title is null and profiles.current_company is null)
        )
    ),
    inserted as (
      insert into enrichment_jobs (guest_id, type, status, run_after)
      select event_guests.id, 'brightdata_linkedin', 'queued', now()
      from event_guests
      on conflict (guest_id, type) do update set
        status = 'queued',
        attempts = 0,
        error = null,
        run_after = now(),
        started_at = null,
        finished_at = null
      returning id
    )
    select count(*)::int as count from inserted
  `;

  console.info(`[jobs:linkedin:event:queued] event=${eventId} mode=${force ? 'force' : 'missing'} count=${result.count}`);
  return result.count;
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
        attempts = 0,
        error = null,
        run_after = now(),
        started_at = null,
        finished_at = null
      returning id
    )
    select count(*)::int as count from inserted
  `;

  return result.count;
}

export async function cancelEnrichmentJobsForEvent(eventId: string, types?: EnrichmentJobType[]) {
  const requestedTypes = selectedTypes(types);
  const [result] = await sql<Partial<JobMutationCounts>[]>`
    with target_jobs as (
      select enrichment_jobs.id, enrichment_jobs.status, enrichment_jobs.error
      from enrichment_jobs
      join guests on guests.id = enrichment_jobs.guest_id
      where guests.event_id = ${eventId}
        and enrichment_jobs.type = any(${requestedTypes}::text[])
        and enrichment_jobs.status in ('queued', 'running')
    ),
    updated as (
      update enrichment_jobs
      set
        status = 'failed',
        error = 'Stopped by user. Queued work will not run; in-flight requests may still finish.',
        finished_at = now()
      from target_jobs
      where enrichment_jobs.id = target_jobs.id
      returning target_jobs.status as previous_status
    )
    select
      count(*) filter (where previous_status = 'queued')::int as queued,
      count(*) filter (where previous_status = 'running')::int as running,
      0::int as succeeded,
      count(*)::int as failed,
      count(*)::int as stopped,
      count(*)::int as total
    from updated
  `;

  return mutationCounts(result);
}

export async function deleteEnrichmentJobsForEvent(
  eventId: string,
  statuses: EnrichmentJobStatus[] = clearableJobStatuses,
  types?: EnrichmentJobType[]
) {
  const requestedTypes = selectedTypes(types);
  const requestedStatuses = statuses.length ? statuses : clearableJobStatuses;
  const [result] = await sql<Partial<JobMutationCounts>[]>`
    with target_jobs as (
      select enrichment_jobs.id, enrichment_jobs.status
      from enrichment_jobs
      join guests on guests.id = enrichment_jobs.guest_id
      where guests.event_id = ${eventId}
        and enrichment_jobs.type = any(${requestedTypes}::text[])
        and enrichment_jobs.status = any(${requestedStatuses}::text[])
    ),
    deleted as (
      delete from enrichment_jobs
      using target_jobs
      where enrichment_jobs.id = target_jobs.id
      returning target_jobs.status, target_jobs.error
    )
    select
      count(*) filter (where status = 'queued')::int as queued,
      count(*) filter (where status = 'running')::int as running,
      count(*) filter (where status = 'succeeded')::int as succeeded,
      count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status = 'failed' and coalesce(error, '') like 'Stopped by user.%')::int as stopped,
      count(*)::int as total
    from deleted
  `;

  return mutationCounts(result);
}
