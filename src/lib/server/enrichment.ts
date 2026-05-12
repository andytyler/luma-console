import { sql } from './db';
import { enrichGithub } from './github';
import { enrichLinkedin } from './brightdata';
import { scoreGuest } from './scoring';

type JobType = 'github' | 'brightdata_linkedin' | 'score';

async function runJob(type: JobType, guestId: string) {
  if (type === 'github') return enrichGithub(guestId);
  if (type === 'brightdata_linkedin') return enrichLinkedin(guestId);
  return scoreGuest(guestId);
}

export async function runNextEnrichmentJob(eventId?: string) {
  const targetEventId = eventId ?? null;
  const [job] = await sql<{ id: string; guest_id: string; type: JobType; attempts: number }[]>`
    update enrichment_jobs
    set status = 'running', attempts = attempts + 1, started_at = now(), error = null
    where id = (
      select enrichment_jobs.id
      from enrichment_jobs
      join guests on guests.id = enrichment_jobs.guest_id
      where status = 'queued'
        and run_after <= now()
        and (${targetEventId}::uuid is null or guests.event_id = ${targetEventId})
      order by enrichment_jobs.created_at asc
      limit 1
      for update skip locked
    )
    returning id::text, guest_id::text, type, attempts
  `;

  if (!job) return null;

  try {
    await runJob(job.type, job.guest_id);
    await sql`
      update enrichment_jobs
      set status = 'succeeded', finished_at = now(), error = null
      where id = ${job.id}
    `;

    if (job.type !== 'score') {
      await sql`
        insert into enrichment_jobs (guest_id, type, status, run_after)
        values (${job.guest_id}, 'score', 'queued', now())
        on conflict (guest_id, type) do update set
          status = 'queued',
          run_after = now(),
          error = null,
          finished_at = null
      `;
    }

    return { id: job.id, type: job.type, status: 'succeeded' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retry = job.attempts < 3;
    if (retry) {
      await sql`
        update enrichment_jobs
        set
          status = 'queued',
          error = ${message},
          run_after = now() + interval '5 minutes',
          finished_at = null
        where id = ${job.id}
      `;
    } else {
      await sql`
        update enrichment_jobs
        set
          status = 'failed',
          error = ${message},
          run_after = now(),
          finished_at = now()
        where id = ${job.id}
      `;
    }
    return { id: job.id, type: job.type, status: retry ? 'queued' : 'failed', error: message };
  }
}
