import { jsonb, sql } from './db';

type ScoreReason = {
  total: number;
  status: 'needs_review' | 'approve_candidate' | 'reject_candidate' | 'pool';
  positive: string[];
  negative: string[];
  signals: Record<string, number | string | boolean>;
};

const relevantTitlePattern =
  /(engineer|developer|founder|cto|technical|software|ai|ml|machine learning|research|product|designer|builder|agent|infra|platform|data)/i;
const vendorPattern = /(sales|account executive|business development|recruiter|talent|agency|marketing|lead generation)/i;
const vaguePattern = /^(n\/a|na|none|no|yes|maybe|tbd|not sure|\.|-)?$/i;

function scoreStatus(score: number): ScoreReason['status'] {
  if (score >= 78) return 'approve_candidate';
  if (score >= 58) return 'pool';
  if (score >= 38) return 'needs_review';
  return 'reject_candidate';
}

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
        where lower(previous.email) = lower(guests.email)
          and previous.id <> guests.id
          and previous.checked_in_at is not null
      ) as prior_attended_count,
      coalesce(
        jsonb_agg(jsonb_build_object('question', registration_answers.question, 'answer', registration_answers.answer))
          filter (where registration_answers.id is not null),
        '[]'::jsonb
      ) as answers
    from guests
    left join profiles on profiles.guest_id = guests.id
    left join github_profiles on github_profiles.guest_id = guests.id
    left join registration_answers on registration_answers.guest_id = guests.id
    where guests.id = ${guestId}
    group by guests.id, profiles.id, github_profiles.id
  `;

  if (!row) throw new Error('Guest not found.');
  if (row.score_locked) return null;

  let score = 35;
  const positive: string[] = [];
  const negative: string[] = [];
  const answerText = row.answers.map((answer) => `${answer.question}: ${answer.answer}`).join('\n');
  const title = row.current_title ?? '';

  if (row.prior_attended_count > 0) {
    score += Math.min(25, row.prior_attended_count * 15);
    positive.push(`Prior checked-in attendance: ${row.prior_attended_count}`);
  }

  if (relevantTitlePattern.test(title)) {
    score += 15;
    positive.push(`Relevant title: ${title}`);
  }

  if (vendorPattern.test(title) || vendorPattern.test(answerText)) {
    score -= 20;
    negative.push('Sales/recruiting/vendor signal');
  }

  const substantialAnswers = row.answers.filter((answer) => {
    const value = String(answer.answer ?? '').trim();
    return value.length >= 30 && !vaguePattern.test(value);
  }).length;
  if (substantialAnswers >= 2) {
    score += 18;
    positive.push('Specific registration answers');
  } else if (substantialAnswers === 0) {
    score -= 12;
    negative.push('Sparse or vague registration answers');
  }

  const contributions = Number(row.contribution_total ?? 0);
  if (contributions >= 500) {
    score += 20;
    positive.push('Strong GitHub contribution activity');
  } else if (contributions >= 100) {
    score += 12;
    positive.push('Some GitHub contribution activity');
  } else if (row.github_username) {
    score += 4;
    positive.push('GitHub profile found');
  } else {
    score -= 8;
    negative.push('No GitHub profile found yet');
  }

  if (row.current_company) {
    score += 5;
    positive.push(`Company identified: ${row.current_company}`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const reason: ScoreReason = {
    total: score,
    status: scoreStatus(score),
    positive,
    negative,
    signals: {
      prior_attended_count: row.prior_attended_count,
      contribution_total: contributions,
      public_repos: Number(row.public_repos ?? 0),
      followers: Number(row.followers ?? 0),
      substantial_answers: substantialAnswers
    }
  };

  await sql`
    update guests
    set
      score = ${score},
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
