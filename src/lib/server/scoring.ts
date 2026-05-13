import { jsonb, sql } from './db';
import { calculateGuestScore } from '../scoring-rules';

export async function scoreGuest(guestId: string) {
  const [row] = await sql<{
    id: string;
    email: string;
    status_internal: string;
    score_locked: boolean;
    current_title: string | null;
    current_company: string | null;
    github_username: string | null;
    contribution_total: number | null;
    followers: number | null;
    public_repos: number | null;
    prior_attended_count: number;
    answers: { question: string; answer: string }[];
  }[]>`
    select
      guests.id::text,
      guests.email,
      guests.status_internal,
      guests.score_locked,
      profiles.current_title,
      profiles.current_company,
      profiles.github_username,
      github_profiles.contribution_total,
      github_profiles.followers,
      github_profiles.public_repos,
      (
        select count(*)::int
        from guests previous
        join events previous_events on previous_events.id = previous.event_id
        where lower(previous.email) = lower(guests.email)
          and previous.id <> guests.id
          and previous.event_id <> guests.event_id
          and previous.checked_in_at is not null
          and previous_events.calendar_id = current_event.calendar_id
      ) as prior_attended_count,
      coalesce(
        jsonb_agg(jsonb_build_object('question', registration_answers.question, 'answer', registration_answers.answer))
          filter (where registration_answers.id is not null),
        '[]'::jsonb
      ) as answers
    from guests
    join events current_event on current_event.id = guests.event_id
    left join profiles on profiles.guest_id = guests.id
    left join github_profiles on github_profiles.guest_id = guests.id
    left join registration_answers on registration_answers.guest_id = guests.id
    where guests.id = ${guestId}
    group by guests.id, current_event.id, profiles.id, github_profiles.id
  `;

  if (!row) throw new Error('Guest not found.');
  if (row.score_locked) return null;

  const reason = calculateGuestScore({
    currentTitle: row.current_title,
    currentCompany: row.current_company,
    githubUsername: row.github_username,
    contributionTotal: row.contribution_total,
    publicRepos: row.public_repos,
    followers: row.followers,
    priorAttendedCount: row.prior_attended_count,
    answers: row.answers
  });

  await sql`
    update guests
    set
      score = ${reason.total},
      score_reason = ${jsonb(reason)},
      status_internal = case
        when status_internal in ('approved', 'rejected') then status_internal
        else ${reason.status}
      end,
      updated_at = now()
    where id = ${guestId}
  `;

  return reason;
}
