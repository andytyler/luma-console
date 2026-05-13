import { error, fail, type Actions } from '@sveltejs/kit';
import { sql } from '$lib/server/db';
import { syncGuestsForEvent } from '$lib/server/imports';
import { runNextEnrichmentJob } from '$lib/server/enrichment';
import {
  cancelEnrichmentJobsForEvent,
  deleteEnrichmentJobsForEvent,
  enqueueEventJobs,
  enqueueGithubJobsForEvent
} from '$lib/server/jobs';
import { lumaConfigured } from '$lib/server/luma';
import { requireEventAccess } from '$lib/server/permissions';
import { getLumaBatchNotes, lumaWritesEnabled } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

const statuses = new Set([
  'needs_review',
  'approve_candidate',
  'reject_candidate',
  'pool',
  'approved',
  'rejected'
]);
const sortOptions = new Set(['score_desc', 'github_activity_desc', 'github_stars_desc', 'registered_desc']);

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const status = url.searchParams.get('status') ?? '';
  const q = (url.searchParams.get('q') ?? '').trim();
  const github = url.searchParams.get('github') ?? '';
  const prior = url.searchParams.get('prior') === 'true';
  const requestedSort = url.searchParams.get('sort') ?? 'score_desc';
  const sort = sortOptions.has(requestedSort) ? requestedSort : 'score_desc';
  const batch = url.searchParams.get('batch');
  const count = url.searchParams.get('count');

  const eventAccess = await requireEventAccess(locals.user?.id, params.id);

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
        join events previous_events on previous_events.id = previous.event_id
        where lower(previous.email) = lower(guests.email)
          and previous.id <> guests.id
          and previous.event_id <> guests.event_id
          and previous.checked_in_at is not null
          and previous_events.calendar_id = ${eventAccess.calendar_id}
      ) > 0`
    : sql``;
  const orderBy =
    sort === 'github_activity_desc'
      ? sql`
          order by
            coalesce(github_profiles.contribution_total, 0) desc,
            coalesce(github_profiles.total_stars, 0) desc,
            coalesce(github_profiles.followers, 0) desc,
            coalesce(github_profiles.public_repos, 0) desc,
            guests.score desc,
            guests.registered_at asc nulls last
        `
      : sort === 'github_stars_desc'
        ? sql`
            order by
              coalesce(github_profiles.total_stars, 0) desc,
              coalesce(github_profiles.contribution_total, 0) desc,
              guests.score desc,
              guests.registered_at asc nulls last
          `
        : sort === 'registered_desc'
          ? sql`order by guests.registered_at desc nulls last, guests.score desc`
          : sql`order by guests.score desc, guests.registered_at asc nulls last`;

  const [
    guests,
    statusCounts,
    lumaStatusCounts,
    actionCounts,
    transitionCounts,
    jobs,
    activeJobs,
    failedJobs,
    answerColumns,
    batchNotes,
    writesEnabled
  ] = await Promise.all([
    sql<{
      id: string;
      name: string | null;
      email: string;
      approval_status: string | null;
      desired_luma_status: string | null;
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
      linkedin_avatar_url: string | null;
      linkedin_display_name: string | null;
      linkedin_bio: string | null;
      linkedin_location: string | null;
      linkedin_followers: number | null;
      linkedin_connections: number | null;
      linkedin_snapshot_id: string | null;
      linkedin_snapshot_status: string | null;
      linkedin_organizations: {
        title: string;
        subtitle: string | null;
      }[];
      linkedin_activity: {
        title: string;
        interaction: string | null;
        link: string | null;
      }[];
      linkedin_awards: {
        title: string;
        subtitle: string | null;
      }[];
      linkedin_recent_jobs: {
        company: string | null;
        title: string | null;
        start_date: string | null;
        end_date: string | null;
      }[];
      profile_raw_keys: string[];
      profile_source: string | null;
      profile_confidence: number | null;
      profile_updated_at: string | null;
      github_username: string | null;
      contribution_total: number | null;
      public_repos: number | null;
      followers: number | null;
      total_stars: number | null;
      top_repositories: {
        name: string;
        url: string;
        description: string | null;
        stars: number;
        forks: number;
        language: string | null;
        languageColor: string | null;
      }[];
      weeks: unknown[];
      favicon_url: string | null;
      answers: {
        question_key: string | null;
        question: string;
        question_type: string | null;
        answer: string | null;
        raw_json: Record<string, unknown> | null;
      }[];
      past_titles: string[];
      prior_attended_count: number;
      event_history: {
        event_id: string;
        event_name: string;
        event_url: string | null;
        event_start_at: string | null;
        event_end_at: string | null;
        approval_status: string | null;
        status_internal: string | null;
        checked_in_at: string | null;
        registered_at: string | null;
        ticket_name: string | null;
      }[];
    }[]>`
      select
        guests.id::text,
        guests.name,
        guests.email,
        guests.approval_status,
        guests.desired_luma_status,
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
        profiles.avatar_url as linkedin_avatar_url,
        nullif(profiles.raw_json->>'name', '') as linkedin_display_name,
        profiles.bio as linkedin_bio,
        profiles.location as linkedin_location,
        case
          when profiles.raw_json->>'followers' ~ '^[0-9]+$'
            then (profiles.raw_json->>'followers')::int
          else null
        end as linkedin_followers,
        case
          when profiles.raw_json->>'connections' ~ '^[0-9]+$'
            then (profiles.raw_json->>'connections')::int
          else null
        end as linkedin_connections,
        profiles.raw_json->>'snapshot_id' as linkedin_snapshot_id,
        profiles.raw_json->>'status' as linkedin_snapshot_status,
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'title', linkedin_org.title,
                'subtitle', linkedin_org.subtitle
              )
              order by linkedin_org.position
            )
            from (
              select
                organization.position,
                organization.item->>'title' as title,
                coalesce(
                  nullif(organization.item->>'membership_type', ''),
                  nullif(organization.item->>'subtitle', ''),
                  nullif(organization.item->>'start_date', '')
                ) as subtitle
              from jsonb_array_elements(
                case
                  when jsonb_typeof(profiles.raw_json->'organizations') = 'array'
                    then profiles.raw_json->'organizations'
                  else '[]'::jsonb
                end
              )
                with ordinality as organization(item, position)
              where nullif(organization.item->>'title', '') is not null
              order by organization.position
              limit 2
            ) linkedin_org
          ),
          '[]'::jsonb
        ) as linkedin_organizations,
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'title', linkedin_activity.title,
                'interaction', linkedin_activity.interaction,
                'link', linkedin_activity.link
              )
              order by linkedin_activity.position
            )
            from (
              select
                activity.position,
                activity.item->>'title' as title,
                nullif(activity.item->>'interaction', '') as interaction,
                nullif(activity.item->>'link', '') as link
              from jsonb_array_elements(
                case
                  when jsonb_typeof(profiles.raw_json->'activity') = 'array'
                    then profiles.raw_json->'activity'
                  else '[]'::jsonb
                end
              )
                with ordinality as activity(item, position)
              where nullif(activity.item->>'title', '') is not null
              order by activity.position
              limit 2
            ) linkedin_activity
          ),
          '[]'::jsonb
        ) as linkedin_activity,
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'title', linkedin_award.title,
                'subtitle', linkedin_award.subtitle
              )
              order by linkedin_award.position
            )
            from (
              select
                award.position,
                award.item->>'title' as title,
                coalesce(
                  nullif(award.item->>'publication', ''),
                  nullif(award.item->>'issuer', ''),
                  nullif(award.item->>'date', '')
                ) as subtitle
              from jsonb_array_elements(
                case
                  when jsonb_typeof(profiles.raw_json->'honors_and_awards') = 'array'
                    then profiles.raw_json->'honors_and_awards'
                  else '[]'::jsonb
                end
              )
                with ordinality as award(item, position)
              where nullif(award.item->>'title', '') is not null
              order by award.position
              limit 2
            ) linkedin_award
          ),
          '[]'::jsonb
        ) as linkedin_awards,
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'company', recent_work.company,
                'title', recent_work.title,
                'start_date', recent_work.start_date,
                'end_date', recent_work.end_date
              )
              order by recent_work.position
            )
            from (
              select
                row_number() over (
                  order by
                    case
                      when lower(coalesce(work_history.end_date, '')) in ('', 'present', 'current', 'now')
                        then 0
                      else 1
                    end,
                    work_history.start_date desc nulls last,
                    work_history.id
                ) as position,
                work_history.company,
                work_history.title,
                work_history.start_date,
                work_history.end_date
              from work_history
              where work_history.profile_id = profiles.id
                and (work_history.company is not null or work_history.title is not null)

              union all

              select
                1000 + raw_work.position as position,
                raw_work.company,
                raw_work.title,
                raw_work.start_date,
                raw_work.end_date
              from (
                select
                  raw_job.position,
                  coalesce(
                    nullif(raw_job.item #>> '{company,name}', ''),
                    nullif(raw_job.item #>> '{company,company_name}', ''),
                    nullif(raw_job.item->>'company_name', ''),
                    nullif(raw_job.item->>'company', ''),
                    nullif(raw_job.item #>> '{organization,name}', ''),
                    nullif(raw_job.item->>'organization', ''),
                    nullif(raw_job.item #>> '{employer,name}', ''),
                    nullif(raw_job.item->>'employer', '')
                  ) as company,
                  case
                    when lower(coalesce(nullif(raw_job.item->>'title', ''), '')) = lower(coalesce(
                      nullif(raw_job.item #>> '{company,name}', ''),
                      nullif(raw_job.item #>> '{company,company_name}', ''),
                      nullif(raw_job.item->>'company_name', ''),
                      nullif(raw_job.item->>'company', ''),
                      nullif(raw_job.item #>> '{organization,name}', ''),
                      nullif(raw_job.item->>'organization', ''),
                      nullif(raw_job.item #>> '{employer,name}', ''),
                      nullif(raw_job.item->>'employer', ''),
                      ''
                    ))
                    and nullif(raw_job.item->>'subtitle', '') is not null
                      then nullif(raw_job.item->>'subtitle', '')
                    else coalesce(
                      nullif(raw_job.item->>'title', ''),
                      nullif(raw_job.item->>'position', ''),
                      nullif(raw_job.item->>'role', ''),
                      nullif(raw_job.item->>'job_title', ''),
                      nullif(raw_job.item->>'subtitle', ''),
                      nullif(raw_job.item->>'occupation', '')
                    )
                  end as title,
                  coalesce(
                    nullif(raw_job.item->>'start_date', ''),
                    nullif(raw_job.item->>'start', ''),
                    nullif(raw_job.item->>'starts_at', ''),
                    nullif(raw_job.item->>'from', ''),
                    nullif(raw_job.item->>'date_from', '')
                  ) as start_date,
                  coalesce(
                    nullif(raw_job.item->>'end_date', ''),
                    nullif(raw_job.item->>'end', ''),
                    nullif(raw_job.item->>'ends_at', ''),
                    nullif(raw_job.item->>'to', ''),
                    nullif(raw_job.item->>'date_to', '')
                  ) as end_date
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(profiles.raw_json->'experience') = 'array'
                      then profiles.raw_json->'experience'
                    when jsonb_typeof(profiles.raw_json->'experiences') = 'array'
                      then profiles.raw_json->'experiences'
                    when jsonb_typeof(profiles.raw_json->'position') = 'array'
                      then profiles.raw_json->'position'
                    when jsonb_typeof(profiles.raw_json->'positions') = 'array'
                      then profiles.raw_json->'positions'
                    when jsonb_typeof(profiles.raw_json->'work_experience') = 'array'
                      then profiles.raw_json->'work_experience'
                    when jsonb_typeof(profiles.raw_json->'current_positions') = 'array'
                      then profiles.raw_json->'current_positions'
                    when jsonb_typeof(profiles.raw_json->'past_experience') = 'array'
                      then profiles.raw_json->'past_experience'
                    when jsonb_typeof(profiles.raw_json->'jobs') = 'array'
                      then profiles.raw_json->'jobs'
                    when jsonb_typeof(profiles.raw_json->'optional_jobs') = 'array'
                      then profiles.raw_json->'optional_jobs'
                    when jsonb_typeof(profiles.raw_json->'job_history') = 'array'
                      then profiles.raw_json->'job_history'
                    when jsonb_typeof(profiles.raw_json->'employment') = 'array'
                      then profiles.raw_json->'employment'
                    when jsonb_typeof(profiles.raw_json->'employment_history') = 'array'
                      then profiles.raw_json->'employment_history'
                    when jsonb_typeof(profiles.raw_json->'position_history') = 'array'
                      then profiles.raw_json->'position_history'
                    when jsonb_typeof(profiles.raw_json->'positions_history') = 'array'
                      then profiles.raw_json->'positions_history'
                    when jsonb_typeof(profiles.raw_json->'experience_details') = 'array'
                      then profiles.raw_json->'experience_details'
                    when jsonb_typeof(profiles.raw_json->'experiences_details') = 'array'
                      then profiles.raw_json->'experiences_details'
                    else '[]'::jsonb
                  end
                )
                  with ordinality as raw_job(item, position)
              ) raw_work
              where not exists (
                  select 1
                  from work_history existing_work
                  where existing_work.profile_id = profiles.id
                )
                and (raw_work.company is not null or raw_work.title is not null)
              order by position
              limit 5
            ) recent_work
          ),
          '[]'::jsonb
        ) as linkedin_recent_jobs,
        coalesce(
          (
            select array_agg(profile_keys.key order by profile_keys.key)
            from jsonb_object_keys(coalesce(profiles.raw_json, '{}'::jsonb)) as profile_keys(key)
          ),
          '{}'::text[]
        ) as profile_raw_keys,
        profiles.source as profile_source,
        profiles.confidence::float as profile_confidence,
        profiles.updated_at::text as profile_updated_at,
        coalesce(profiles.github_username, github_profiles.username) as github_username,
        github_profiles.contribution_total,
        github_profiles.public_repos,
        github_profiles.followers,
        github_profiles.total_stars,
        coalesce(github_profiles.top_repositories, '[]'::jsonb) as top_repositories,
        coalesce(github_profiles.weeks, '[]'::jsonb) as weeks,
        companies.favicon_url,
        coalesce(
          jsonb_agg(
            distinct jsonb_build_object(
              'question_key', registration_answers.question_key,
              'question', registration_answers.question,
              'question_type', coalesce(
                nullif(registration_answers.raw_json->>'type', ''),
                nullif(registration_answers.raw_json->>'question_type', ''),
                nullif(registration_answers.raw_json->>'answer_type', ''),
                nullif(registration_answers.raw_json #>> '{registration_question,type}', ''),
                nullif(registration_answers.raw_json #>> '{question,type}', '')
              ),
              'answer', registration_answers.answer,
              'raw_json', registration_answers.raw_json
            )
          )
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
          join events previous_events on previous_events.id = previous.event_id
          where lower(previous.email) = lower(guests.email)
            and previous.id <> guests.id
            and previous.event_id <> guests.event_id
            and previous.checked_in_at is not null
            and previous_events.calendar_id = ${eventAccess.calendar_id}
        ) as prior_attended_count,
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'event_id', history.event_id,
                'event_name', history.event_name,
                'event_url', history.event_url,
                'event_start_at', history.event_start_at,
                'event_end_at', history.event_end_at,
                'approval_status', history.approval_status,
                'status_internal', history.status_internal,
                'checked_in_at', history.checked_in_at,
                'registered_at', history.registered_at,
                'ticket_name', history.ticket_name
              )
              order by history.sort_start_at desc nulls last
            )
            from (
              select
                previous_events.id::text as event_id,
                previous_events.name as event_name,
                previous_events.url as event_url,
                previous_events.start_at::text as event_start_at,
                previous_events.end_at::text as event_end_at,
                previous_events.start_at as sort_start_at,
                previous.approval_status,
                previous.status_internal,
                previous.checked_in_at::text as checked_in_at,
                previous.registered_at::text as registered_at,
                previous.ticket_name
              from guests previous
              join events previous_events on previous_events.id = previous.event_id
              where lower(previous.email) = lower(guests.email)
                and previous.id <> guests.id
                and previous.event_id <> guests.event_id
                and previous_events.calendar_id = ${eventAccess.calendar_id}
              order by previous_events.start_at desc nulls last
              limit 12
            ) history
          ),
          '[]'::jsonb
        ) as event_history
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
      ${orderBy}
      limit 1000
    `,
    sql<{ status_internal: string; count: number }[]>`
      select status_internal, count(*)::int as count
      from guests
      where event_id = ${params.id}
      group by status_internal
    `,
    sql<{ approval_status: string | null; count: number }[]>`
      select approval_status, count(*)::int as count
      from guests
      where event_id = ${params.id}
      group by approval_status
      order by count(*) desc, approval_status asc nulls last
    `,
    sql<{ desired_luma_status: string | null; count: number }[]>`
      select desired_luma_status, count(*)::int as count
      from guests
      where event_id = ${params.id}
      group by desired_luma_status
      order by
        case when desired_luma_status is null then 1 else 0 end,
        desired_luma_status asc
    `,
    sql<{
      from_status: string;
      to_status: 'approved' | 'declined';
      count: number;
      sample_guests: {
        id: string;
        name: string | null;
        email: string;
        score: number;
      }[];
    }[]>`
      with transition_groups as (
        select
          coalesce(approval_status, '') as from_status,
          desired_luma_status as to_status,
          count(*)::int as count
        from guests
        where event_id = ${params.id}
          and desired_luma_status in ('approved', 'declined')
          and coalesce(approval_status, '') <> desired_luma_status
        group by coalesce(approval_status, ''), desired_luma_status
      )
      select
        transition_groups.from_status,
        transition_groups.to_status,
        transition_groups.count,
        coalesce(samples.sample_guests, '[]'::jsonb) as sample_guests
      from transition_groups
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', sample.id,
            'name', sample.name,
            'email', sample.email,
            'score', sample.score
          )
          order by sample.score desc, sample.registered_at asc nulls last
        ) as sample_guests
        from (
          select id::text, name, email, score, registered_at
          from guests
          where event_id = ${params.id}
            and coalesce(approval_status, '') = transition_groups.from_status
            and desired_luma_status = transition_groups.to_status
          order by score desc, registered_at asc nulls last
          limit 12
        ) sample
      ) samples on true
      order by transition_groups.to_status, transition_groups.from_status
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
      status: string;
      error: string | null;
      guest_name: string | null;
      guest_email: string;
      run_after: string;
      started_at: string | null;
      created_at: string;
    }[]>`
      select
        enrichment_jobs.id::text,
        enrichment_jobs.type,
        enrichment_jobs.status,
        enrichment_jobs.error,
        guests.name as guest_name,
        guests.email as guest_email,
        enrichment_jobs.run_after::text,
        enrichment_jobs.started_at::text,
        enrichment_jobs.created_at::text
      from enrichment_jobs
      join guests on guests.id = enrichment_jobs.guest_id
      where guests.event_id = ${params.id}
        and enrichment_jobs.status in ('queued', 'running')
      order by
        case enrichment_jobs.status
          when 'running' then 0
          when 'queued' then 1
          else 2
        end,
        enrichment_jobs.run_after asc,
        enrichment_jobs.created_at asc
      limit 50
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
    `,
    sql<{
      question_key: string | null;
      question: string;
      question_type: string | null;
      answer_count: number;
    }[]>`
      select
        min(registration_answers.question_key) as question_key,
        registration_answers.question,
        max(
          coalesce(
            nullif(registration_answers.raw_json->>'type', ''),
            nullif(registration_answers.raw_json->>'question_type', ''),
            nullif(registration_answers.raw_json->>'answer_type', ''),
            nullif(registration_answers.raw_json #>> '{registration_question,type}', ''),
            nullif(registration_answers.raw_json #>> '{question,type}', '')
          )
        ) as question_type,
        count(*)::int as answer_count
      from registration_answers
      join guests on guests.id = registration_answers.guest_id
      where guests.event_id = ${params.id}
      group by registration_answers.question
      order by
        min(
          case
            when registration_answers.raw_json->>'position' ~ '^[0-9]+$'
              then (registration_answers.raw_json->>'position')::int
            when registration_answers.raw_json->>'order' ~ '^[0-9]+$'
              then (registration_answers.raw_json->>'order')::int
            when registration_answers.raw_json #>> '{registration_question,position}' ~ '^[0-9]+$'
              then (registration_answers.raw_json #>> '{registration_question,position}')::int
            else null
          end
        ) asc nulls last,
        min(registration_answers.question_key) asc nulls last,
        registration_answers.question asc
    `,
    getLumaBatchNotes(params.id),
    lumaWritesEnabled()
  ]);

  const linkedinProfiles = guests.filter(
    (guest) =>
      guest.linkedin_url ||
      guest.current_company ||
      guest.current_title ||
      guest.linkedin_display_name ||
      guest.linkedin_bio ||
      guest.linkedin_location ||
      guest.linkedin_followers !== null ||
      guest.linkedin_connections !== null ||
      guest.profile_source === 'registration_answer' ||
      guest.profile_source === 'luma_raw_json' ||
      guest.linkedin_recent_jobs.length
  );
  const linkedinWithJobs = linkedinProfiles.filter((guest) => guest.linkedin_recent_jobs.length > 0);
  const linkedinEmptyResponses = linkedinProfiles.filter(
    (guest) =>
      guest.linkedin_url &&
      !guest.current_company &&
      !guest.current_title &&
      !guest.linkedin_bio &&
      guest.linkedin_recent_jobs.length === 0
  );
  console.info(
    `[linkedin:page:summary] event=${params.id} loaded=${guests.length} linkedin_profiles=${linkedinProfiles.length} with_recent_jobs=${linkedinWithJobs.length} empty_linkedin_responses=${linkedinEmptyResponses.length} current_company=${linkedinProfiles.filter((guest) => Boolean(guest.current_company)).length} current_title=${linkedinProfiles.filter((guest) => Boolean(guest.current_title)).length}`
  );
  console.info(
    `[linkedin:page:samples] ${JSON.stringify(
      [...linkedinWithJobs, ...linkedinProfiles.filter((guest) => guest.current_company || guest.current_title), ...linkedinProfiles]
        .filter((guest, index, rows) => rows.findIndex((row) => row.id === guest.id) === index)
        .slice(0, 12)
        .map((guest) => ({
        email: guest.email,
        linkedin: guest.linkedin_url,
        source: guest.profile_source,
        current_title: guest.current_title,
        current_company: guest.current_company,
        bio: guest.linkedin_bio,
        recent_jobs: guest.linkedin_recent_jobs.slice(0, 5),
        raw_keys: guest.profile_raw_keys.slice(0, 12),
        updated_at: guest.profile_updated_at
      }))
    )}`
  );

  return {
    event,
    calendarRole: eventAccess.role,
    guests,
    statusCounts,
    lumaStatusCounts,
    actionCounts,
    transitionCounts,
    jobs,
    activeJobs,
    failedJobs,
    answerColumns,
    batchNotes,
    filters: { status, q, github, prior, sort },
    lumaConfigured: Boolean(eventAccess.encrypted_api_key) || lumaConfigured(),
    lumaWritesEnabled: writesEnabled,
    batch: batch ? { status: batch, count } : null,
    next: url.pathname + url.search
  };
};

export const actions: Actions = {
  syncGuests: async ({ params, locals }) => {
    const eventId = params.id;
    if (!eventId) {
      return fail(400, { message: 'Missing event id.' });
    }
    await requireEventAccess(locals.user?.id, eventId, 'admin');
    if (!lumaConfigured()) {
      const [event] = await sql<{ encrypted_api_key: string | null }[]>`
        select luma_calendars.encrypted_api_key
        from events
        left join luma_calendars on luma_calendars.id = events.calendar_id
        where events.id = ${eventId}
      `;
      if (!event?.encrypted_api_key) {
        return fail(400, { message: 'Set LUMA_API_KEY before syncing guests.' });
      }
    }
    const result = await syncGuestsForEvent(eventId);
    return { message: `Imported ${result.imported} guests.` };
  },
  queueGithub: async ({ params, locals }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });
    await requireEventAccess(locals.user?.id, eventId, 'admin');

    const count = await enqueueGithubJobsForEvent(eventId);
    return { message: `Queued ${count} missing GitHub graph jobs.` };
  },
  queueGithubForce: async ({ params, locals }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });
    await requireEventAccess(locals.user?.id, eventId, 'admin');

    const count = await enqueueGithubJobsForEvent(eventId, { force: true });
    return { message: `Queued ${count} GitHub graph refresh jobs.` };
  },
  queueLinkedin: async ({ params, locals }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });
    await requireEventAccess(locals.user?.id, eventId, 'admin');

    console.info(`[action:queue-linkedin:start] event=${eventId} user=${locals.user?.email ?? 'unknown'}`);
    const count = await enqueueEventJobs(eventId, ['brightdata_linkedin', 'score']);
    console.info(`[action:queue-linkedin:done] event=${eventId} count=${count}`);
    return { message: `Queued ${count} BrightData LinkedIn and scoring jobs.` };
  },
  queueScore: async ({ params, locals }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });
    await requireEventAccess(locals.user?.id, eventId, 'admin');

    const count = await enqueueEventJobs(eventId, ['score']);
    return { message: `Queued ${count} scoring jobs.` };
  },
  runJobs: async ({ params, request, locals }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });
    await requireEventAccess(locals.user?.id, eventId, 'admin');

    const form = await request.formData();
    const limit = Math.max(1, Math.min(25, Number(form.get('limit') ?? 10)));
    const results: Array<{ status?: string; error?: string }> = [];
    console.info(`[action:run-jobs:start] event=${eventId} limit=${limit} user=${locals.user?.email ?? 'unknown'}`);

    for (let index = 0; index < limit; index += 1) {
      const result = await runNextEnrichmentJob(eventId);
      if (!result) break;
      results.push(result);
    }

    const failed = results.filter((result) => result.status === 'failed').length;
    const queued = results.filter((result) => result.status === 'queued').length;
    const succeeded = results.filter((result) => result.status === 'succeeded').length;

    if (results.length === 0) {
      console.info(`[action:run-jobs:empty] event=${eventId} requested=${limit}`);
      return { message: 'No ready enrichment jobs for this event.' };
    }

    console.info(
      `[action:run-jobs:done] event=${eventId} requested=${limit} ran=${results.length} succeeded=${succeeded} queued=${queued} failed=${failed}`
    );
    return {
      message: `Ran ${results.length} jobs: ${succeeded} succeeded, ${queued} retrying, ${failed} failed.`
    };
  },
  cancelJobs: async ({ params, locals }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });
    await requireEventAccess(locals.user?.id, eventId, 'admin');

    const result = await cancelEnrichmentJobsForEvent(eventId);
    console.info(
      `[action:cancel-jobs] event=${eventId} queued=${result.queued} running=${result.running} user=${locals.user?.email ?? 'unknown'}`
    );

    if (result.total === 0) return { message: 'No queued or running jobs to stop.' };
    return {
      message: `Stopped ${result.queued} queued jobs and marked ${result.running} running jobs to stop after their current request.`
    };
  },
  deleteJobs: async ({ params, locals }) => {
    const eventId = params.id;
    if (!eventId) return fail(400, { message: 'Missing event id.' });
    await requireEventAccess(locals.user?.id, eventId, 'admin');

    const result = await deleteEnrichmentJobsForEvent(eventId);
    console.info(
      `[action:delete-jobs] event=${eventId} deleted=${result.total} user=${locals.user?.email ?? 'unknown'}`
    );

    if (result.total === 0) return { message: 'No stopped, finished, or failed jobs to clear.' };
    return {
      message: `Cleared ${result.total} job records: ${result.succeeded} done, ${result.failed} failed, ${result.stopped} stopped.`
    };
  }
};
