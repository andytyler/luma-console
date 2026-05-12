import { error, fail, type Actions } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { syncGuestsForEvent } from '$lib/server/imports';
import { runNextEnrichmentJob } from '$lib/server/enrichment';
import { enqueueEventJobs } from '$lib/server/jobs';
import { lumaWritesEnabled } from '$lib/server/env';
import { lumaConfigured } from '$lib/server/luma';
import type { PageServerLoad } from './$types';

const statuses = new Set([
  'needs_review',
  'approve_candidate',
  'reject_candidate',
  'pool',
  'approved',
  'rejected'
]);

export const load: PageServerLoad = async ({ params, url }) => {
  const status = url.searchParams.get('status') ?? '';
  const q = (url.searchParams.get('q') ?? '').trim();
  const github = url.searchParams.get('github') ?? '';
  const prior = url.searchParams.get('prior') === 'true';
  const batch = url.searchParams.get('batch');
  const count = url.searchParams.get('count');

  const [event] = await sql<{
    id: string;
    luma_event_id: string;
    name: string;
    url: string | null;
    cover_url: string | null;
    start_at: string | null;
    end_at: string | null;
    timezone: string | null;
    status: string | null;
    guest_count: number;
    pending_count: number;
    approved_count: number;
    waitlist_count: number;
    last_synced_at: string | null;
    raw_json: Record<string, unknown>;
  }[]>`
    select
      id::text,
      luma_event_id,
      name,
      url,
      cover_url,
      start_at::text,
      end_at::text,
      timezone,
      status,
      guest_count,
      pending_count,
      approved_count,
      waitlist_count,
      last_synced_at::text,
      raw_json
    from events
    where id = ${params.id}
    limit 1
  `;

  if (!event) throw error(404, 'Event not found');

  const statusFilter = statuses.has(status) ? sql`and guests.status_internal = ${status}` : sql``;
  const searchFilter = q
    ? sql`and (
        guests.name ilike ${`%${q}%`}
        or guests.email ilike ${`%${q}%`}
        or profiles.current_company ilike ${`%${q}%`}
        or profiles.current_title ilike ${`%${q}%`}
      )`
    : sql``;
  const githubFilter =
    github === 'found'
      ? sql`and github_profiles.id is not null`
      : github === 'missing'
        ? sql`and github_profiles.id is null`
        : sql``;
  const priorFilter = prior
    ? sql`and (
        select count(*)
        from guests previous
        where lower(previous.email) = lower(guests.email)
          and previous.id <> guests.id
          and previous.checked_in_at is not null
      ) > 0`
    : sql``;

  const [guests, statusCounts, jobs, failedJobs] = await Promise.all([
    sql<{
      id: string;
      name: string | null;
      email: string;
      approval_status: string | null;
      status_internal: string;
      score: number;
      score_locked: boolean;
      score_reason: Record<string, unknown>;
      notes: string;
      registered_at: string | null;
      checked_in_at: string | null;
      current_title: string | null;
      current_company: string | null;
      current_company_domain: string | null;
      linkedin_url: string | null;
      github_username: string | null;
      contribution_total: number | null;
      public_repos: number | null;
      followers: number | null;
      weeks: unknown[];
      favicon_url: string | null;
      answers: { question: string; answer: string | null }[];
      past_titles: string[];
      prior_attended_count: number;
    }[]>`
      select
        guests.id::text,
        guests.name,
        guests.email,
        guests.approval_status,
        guests.status_internal,
        guests.score,
        guests.score_locked,
        guests.score_reason,
        guests.notes,
        guests.registered_at::text,
        guests.checked_in_at::text,
        profiles.current_title,
        profiles.current_company,
        profiles.current_company_domain,
        profiles.linkedin_url,
        coalesce(profiles.github_username, github_profiles.username) as github_username,
        github_profiles.contribution_total,
        github_profiles.public_repos,
        github_profiles.followers,
        coalesce(github_profiles.weeks, '[]'::jsonb) as weeks,
        companies.favicon_url,
        coalesce(
          jsonb_agg(distinct jsonb_build_object('question', registration_answers.question, 'answer', registration_answers.answer))
            filter (where registration_answers.id is not null),
          '[]'::jsonb
        ) as answers,
        coalesce(
          array_agg(distinct work_history.title) filter (where work_history.title is not null),
          '{}'::text[]
        ) as past_titles,
        (
          select count(*)::int
          from guests previous
          where lower(previous.email) = lower(guests.email)
            and previous.id <> guests.id
            and previous.checked_in_at is not null
        ) as prior_attended_count
      from guests
      left join profiles on profiles.guest_id = guests.id
      left join github_profiles on github_profiles.guest_id = guests.id
      left join companies on companies.domain = profiles.current_company_domain
      left join registration_answers on registration_answers.guest_id = guests.id
      left join work_history on work_history.profile_id = profiles.id
      where guests.event_id = ${params.id}
        ${statusFilter}
        ${searchFilter}
        ${githubFilter}
        ${priorFilter}
      group by guests.id, profiles.id, github_profiles.id, companies.id
      order by guests.score desc, guests.registered_at asc nulls last
      limit 1000
    `,
    sql<{ status_internal: string; count: number }[]>`
      select status_internal, count(*)::int as count
      from guests
      where event_id = ${params.id}
      group by status_internal
    `,
    sql<{ type: string; status: string; count: number }[]>`
      select type, status, count(*)::int as count
      from enrichment_jobs
      join guests on guests.id = enrichment_jobs.guest_id
      where guests.event_id = ${params.id}
      group by type, status
      order by type, status
    `,
    sql<{
      id: string;
      type: string;
      error: string | null;
      guest_name: string | null;
      guest_email: string;
      finished_at: string | null;
    }[]>`
      select
        enrichment_jobs.id::text,
        enrichment_jobs.type,
        enrichment_jobs.error,
        guests.name as guest_name,
        guests.email as guest_email,
        enrichment_jobs.finished_at::text
      from enrichment_jobs
      join guests on guests.id = enrichment_jobs.guest_id
      where guests.event_id = ${params.id}
        and enrichment_jobs.status = 'failed'
      order by enrichment_jobs.finished_at desc nulls last, enrichment_jobs.created_at desc
      limit 5
    `
  ]);

  return {
    event,
    guests,
    statusCounts,
    jobs,
    failedJobs,
    filters: { status, q, github, prior },
    lumaConfigured: lumaConfigured(),
    lumaWritesEnabled: lumaWritesEnabled(),
    batch: batch ? { status: batch, count } : null,
    next: url.pathname + url.search
  };
};

export const actions: Actions = {
  syncGuests: async ({ params }) => {
    const eventId = params.id;
    if (!eventId) {
      return fail(400, { message: 'Missing event id.' });
    }
    if (!lumaConfigured()) {
      return fail(400, { message: 'Set LUMA_API_KEY before syncing guests.' });
    }
    const result = await syncGuestsForEvent(eventId);
    return { message: `Imported ${result.imported} guests.` };
  },
  queueGithub: async ({ params }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });

    const count = await enqueueEventJobs(eventId, ['github', 'score']);
    return { message: `Queued ${count} GitHub and scoring jobs.` };
  },
  queueLinkedin: async ({ params }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });

    const count = await enqueueEventJobs(eventId, ['brightdata_linkedin', 'score']);
    return { message: `Queued ${count} BrightData LinkedIn and scoring jobs.` };
  },
  queueScore: async ({ params }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });

    const count = await enqueueEventJobs(eventId, ['score']);
    return { message: `Queued ${count} scoring jobs.` };
  },
  runJobs: async ({ params, request }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });

    const form = await request.formData();
    const limit = Math.max(1, Math.min(25, Number(form.get('limit') ?? 10)));
    const results: Array<{ status?: string; error?: string }> = [];

    for (let index = 0; index < limit; index += 1) {
      const result = await runNextEnrichmentJob(eventId);
      if (!result) break;
      results.push(result);
    }

    const failed = results.filter((result) => result.status === 'failed').length;
    const queued = results.filter((result) => result.status === 'queued').length;
    const succeeded = results.filter((result) => result.status === 'succeeded').length;

    if (results.length === 0) {
      return { message: 'No ready enrichment jobs for this event.' };
    }

    return {
      message: `Ran ${results.length} jobs: ${succeeded} succeeded, ${queued} retrying, ${failed} failed.`
    };
  }
};
