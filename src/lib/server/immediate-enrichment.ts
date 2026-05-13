import { sql } from './db';
import { enrichLinkedin } from './brightdata';
import { enrichGithub } from './github';
import { scoreGuest } from './scoring';
import type { EnrichmentJobType } from './jobs';

type GuestTarget = {
  id: string;
  email: string;
  name: string | null;
};

type ImmediateResult = {
  selected: number;
  fetched: number;
  skipped: number;
  scored: number;
  failed: number;
  errors: string[];
};

function emptyResult(selected: number): ImmediateResult {
  return {
    selected,
    fetched: 0,
    skipped: 0,
    scored: 0,
    failed: 0,
    errors: []
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function markJobRunning(guestId: string, type: EnrichmentJobType) {
  await sql`
    insert into enrichment_jobs (guest_id, type, status, attempts, run_after, started_at)
    values (${guestId}, ${type}, 'running', 1, now(), now())
    on conflict (guest_id, type) do update set
      status = 'running',
      attempts = enrichment_jobs.attempts + 1,
      error = null,
      run_after = now(),
      started_at = now(),
      finished_at = null
  `;
}

async function clearJob(guestId: string, type: EnrichmentJobType) {
  await sql`
    delete from enrichment_jobs
    where guest_id = ${guestId}
      and type = ${type}
  `;
}

async function markJobFailed(guestId: string, type: EnrichmentJobType, message: string) {
  await sql`
    insert into enrichment_jobs (guest_id, type, status, attempts, error, run_after, started_at, finished_at)
    values (${guestId}, ${type}, 'failed', 1, ${message}, now(), now(), now())
    on conflict (guest_id, type) do update set
      status = 'failed',
      error = ${message},
      run_after = now(),
      finished_at = now()
  `;
}

async function runScoreNow(guest: GuestTarget, result: ImmediateResult) {
  await markJobRunning(guest.id, 'score');
  try {
    await scoreGuest(guest.id);
    await clearJob(guest.id, 'score');
    result.scored += 1;
  } catch (error) {
    const message = errorMessage(error);
    await markJobFailed(guest.id, 'score', message);
    result.failed += 1;
    result.errors.push(`${guest.email} score: ${message}`);
  }
}

export async function githubTargetsForEvent(eventId: string, force: boolean) {
  return sql<GuestTarget[]>`
    select guests.id::text, guests.email, guests.name
    from guests
    left join github_profiles on github_profiles.guest_id = guests.id
    where guests.event_id = ${eventId}
      and (${force}::boolean or github_profiles.id is null)
    order by guests.score desc, guests.registered_at asc nulls last
  `;
}

export async function linkedinTargetsForEvent(eventId: string, force: boolean) {
  return sql<GuestTarget[]>`
    select guests.id::text, guests.email, guests.name
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
    order by guests.score desc, guests.registered_at asc nulls last
  `;
}

export async function runGithubForGuestsNow(guests: GuestTarget[]) {
  const result = emptyResult(guests.length);

  for (const guest of guests) {
    await markJobRunning(guest.id, 'github');
    try {
      const profile = await enrichGithub(guest.id);
      await clearJob(guest.id, 'github');
      if ('skipped' in profile) {
        result.skipped += 1;
        continue;
      }
      result.fetched += 1;
      await runScoreNow(guest, result);
    } catch (error) {
      const message = errorMessage(error);
      await markJobFailed(guest.id, 'github', message);
      result.failed += 1;
      result.errors.push(`${guest.email} GitHub: ${message}`);
    }
  }

  return result;
}

export async function runLinkedinForGuestsNow(guests: GuestTarget[]) {
  const result = emptyResult(guests.length);

  for (const guest of guests) {
    await markJobRunning(guest.id, 'brightdata_linkedin');
    try {
      const profile = await enrichLinkedin(guest.id);
      await clearJob(guest.id, 'brightdata_linkedin');
      if ('skipped' in profile) {
        result.skipped += 1;
        continue;
      }
      result.fetched += 1;
      await runScoreNow(guest, result);
    } catch (error) {
      const message = errorMessage(error);
      await markJobFailed(guest.id, 'brightdata_linkedin', message);
      result.failed += 1;
      result.errors.push(`${guest.email} LinkedIn: ${message}`);
    }
  }

  return result;
}
