import { env } from './env';
import { jsonb, sql } from './db';

type Json = Record<string, unknown>;

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

function extractGithubUsernameFromText(value: string) {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/github\.com\/([A-Za-z0-9-]+)/i);
  if (urlMatch?.[1]) return urlMatch[1].replace(/\.git$/, '');
  if (/^[A-Za-z0-9-]{1,39}$/.test(trimmed)) return trimmed;
  return null;
}

export async function inferGithubUsername(guestId: string) {
  const [row] = await sql<{ raw_json: Json; email: string; answers: { question: string; answer: string }[] }[]>`
    select
      guests.raw_json,
      guests.email,
      coalesce(
        jsonb_agg(jsonb_build_object('question', registration_answers.question, 'answer', registration_answers.answer))
          filter (where registration_answers.id is not null),
        '[]'::jsonb
      ) as answers
    from guests
    left join registration_answers on registration_answers.guest_id = guests.id
    where guests.id = ${guestId}
    group by guests.id
  `;

  if (!row) return null;

  for (const answer of row.answers) {
    const label = `${answer.question} ${answer.answer}`.toLowerCase();
    if (label.includes('github')) {
      const username = extractGithubUsernameFromText(answer.answer);
      if (username) return { username, confidence: 0.95, source: 'registration_answer' };
    }
  }

  const rawText = JSON.stringify(row.raw_json);
  const fromRaw = rawText.match(/github\.com\/([A-Za-z0-9-]+)/i)?.[1];
  if (fromRaw) return { username: fromRaw, confidence: 0.75, source: 'luma_raw_json' };

  return null;
}

function currentStreak(weeks: Json[]) {
  const days = weeks
    .flatMap((week) => (Array.isArray(week.contributionDays) ? week.contributionDays : []))
    .reverse() as Json[];

  let streak = 0;
  for (const day of days) {
    const count = Number(day.contributionCount ?? 0);
    if (count > 0) streak += 1;
    else if (streak > 0) break;
  }
  return streak;
}

export async function fetchGithubProfile(username: string) {
  const token = env('GITHUB_TOKEN');
  if (!token) {
    throw new Error('GITHUB_TOKEN is not configured.');
  }

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      query: `
        query UserContributionCalendar($login: String!) {
          user(login: $login) {
            login
            name
            bio
            avatarUrl
            url
            followers { totalCount }
            repositories(ownerAffiliations: OWNER, privacy: PUBLIC) { totalCount }
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    date
                    weekday
                    contributionCount
                    color
                  }
                }
              }
            }
          }
        }
      `,
      variables: { login: username }
    })
  });

  const payload = (await response.json()) as Json;
  if (!response.ok || payload.errors) {
    throw new Error(`GitHub profile lookup failed for ${username}.`);
  }

  const user = (payload.data as Json | undefined)?.user as Json | null | undefined;
  if (!user) {
    throw new Error(`GitHub user not found: ${username}`);
  }

  const calendar = ((user.contributionsCollection as Json).contributionCalendar as Json) ?? {};
  const weeks = (calendar.weeks as Json[]) ?? [];

  return {
    username: String(user.login),
    profileUrl: String(user.url),
    avatarUrl: String(user.avatarUrl),
    contributionTotal: Number(calendar.totalContributions ?? 0),
    followers: Number((user.followers as Json | undefined)?.totalCount ?? 0),
    publicRepos: Number((user.repositories as Json | undefined)?.totalCount ?? 0),
    currentStreak: currentStreak(weeks),
    weeks,
    raw: user
  };
}

export async function enrichGithub(guestId: string) {
  const inferred = await inferGithubUsername(guestId);
  if (!inferred) {
    return { skipped: true, reason: 'No GitHub username found in registration data.' };
  }

  const profile = await fetchGithubProfile(inferred.username);

  await sql`
    insert into github_profiles (
      guest_id,
      username,
      profile_url,
      avatar_url,
      contribution_total,
      followers,
      public_repos,
      current_streak,
      weeks,
      raw_json,
      updated_at
    )
    values (
      ${guestId},
      ${profile.username},
      ${profile.profileUrl},
      ${profile.avatarUrl},
      ${profile.contributionTotal},
      ${profile.followers},
      ${profile.publicRepos},
      ${profile.currentStreak},
      ${jsonb(profile.weeks)},
      ${jsonb(profile.raw)},
      now()
    )
    on conflict (guest_id) do update set
      username = excluded.username,
      profile_url = excluded.profile_url,
      avatar_url = excluded.avatar_url,
      contribution_total = excluded.contribution_total,
      followers = excluded.followers,
      public_repos = excluded.public_repos,
      current_streak = excluded.current_streak,
      weeks = excluded.weeks,
      raw_json = excluded.raw_json,
      updated_at = now()
  `;

  await sql`
    insert into profiles (guest_id, github_username, avatar_url, confidence, source, updated_at)
    values (${guestId}, ${profile.username}, ${profile.avatarUrl}, ${inferred.confidence}, ${inferred.source}, now())
    on conflict (guest_id) do update set
      github_username = excluded.github_username,
      avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url),
      confidence = greatest(profiles.confidence, excluded.confidence),
      source = coalesce(profiles.source, excluded.source),
      updated_at = now()
  `;

  return profile;
}
