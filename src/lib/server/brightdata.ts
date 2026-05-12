import { env } from './env';
import { jsonb, sql } from './db';

type Json = Record<string, unknown>;

const BRIGHTDATA_URL = 'https://api.brightdata.com/datasets/v3/scrape';

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function companyName(value: unknown) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return text((value as Json).name);
  return null;
}

function companyDomain(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  return text((value as Json).domain ?? (value as Json).website);
}

export async function inferLinkedinUrl(guestId: string) {
  const [row] = await sql<{ raw_json: Json; answers: { question: string; answer: string }[] }[]>`
    select
      guests.raw_json,
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
    const answerText = answer.answer ?? '';
    const match = answerText.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s,]+/i);
    if (match?.[0]) return { url: match[0], confidence: 0.95, source: 'registration_answer' };
  }

  const rawMatch = JSON.stringify(row.raw_json).match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"',\s]+/i);
  if (rawMatch?.[0]) return { url: rawMatch[0], confidence: 0.75, source: 'luma_raw_json' };

  return null;
}

async function scrapeLinkedinProfile(url: string) {
  const apiKey = env('BRIGHTDATA_API_KEY');
  if (!apiKey) {
    throw new Error('BRIGHTDATA_API_KEY is not configured.');
  }

  const datasetId = env('BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID', 'gd_l1viktl72bvl7bjuj0');
  const response = await fetch(`${BRIGHTDATA_URL}?dataset_id=${datasetId}&format=json`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify([{ url }])
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`BrightData LinkedIn scrape failed for ${url}.`);
  }

  if (Array.isArray(payload)) return (payload[0] ?? {}) as Json;
  return payload as Json;
}

export async function enrichLinkedin(guestId: string) {
  const inferred = await inferLinkedinUrl(guestId);
  if (!inferred) {
    return { skipped: true, reason: 'No LinkedIn URL found in registration data.' };
  }

  const profile = await scrapeLinkedinProfile(inferred.url);
  const currentCompany = companyName(profile.current_company);
  const currentCompanyDomain = companyDomain(profile.current_company);
  const experience = (profile.experience ?? profile.position ?? profile.work_experience) as unknown;
  const workHistory = Array.isArray(experience) ? (experience as Json[]) : [];

  const [savedProfile] = await sql<{ id: string }[]>`
    insert into profiles (
      guest_id,
      linkedin_url,
      website_url,
      avatar_url,
      current_title,
      current_company,
      current_company_domain,
      location,
      bio,
      confidence,
      source,
      raw_json,
      updated_at
    )
    values (
      ${guestId},
      ${inferred.url},
      ${text(profile.website)},
      ${text(profile.avatar) ?? text(profile.avatar_url) ?? text(profile.profile_image_url)},
      ${text(profile.position) ?? text(profile.current_title) ?? text(profile.headline)},
      ${currentCompany},
      ${currentCompanyDomain},
      ${[text(profile.city), text(profile.country_code)].filter(Boolean).join(', ') || null},
      ${text(profile.about) ?? text(profile.summary)},
      ${inferred.confidence},
      ${inferred.source},
      ${jsonb(profile)},
      now()
    )
    on conflict (guest_id) do update set
      linkedin_url = excluded.linkedin_url,
      website_url = excluded.website_url,
      avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
      current_title = excluded.current_title,
      current_company = excluded.current_company,
      current_company_domain = excluded.current_company_domain,
      location = excluded.location,
      bio = excluded.bio,
      confidence = greatest(profiles.confidence, excluded.confidence),
      source = excluded.source,
      raw_json = excluded.raw_json,
      updated_at = now()
    returning id::text
  `;

  await sql`delete from work_history where profile_id = ${savedProfile.id}`;
  for (const item of workHistory.slice(0, 10)) {
    const company = companyName(item.company ?? item.company_name);
    const domain = companyDomain(item.company);
    await sql`
      insert into work_history (
        profile_id,
        company,
        title,
        company_domain,
        start_date,
        end_date,
        source,
        raw_json
      )
      values (
        ${savedProfile.id},
        ${company},
        ${text(item.title ?? item.position)},
        ${domain},
        ${text(item.start_date ?? item.start)},
        ${text(item.end_date ?? item.end)},
        'brightdata',
        ${jsonb(item)}
      )
    `;

    if (domain) {
      await sql`
        insert into companies (domain, name, favicon_url)
        values (${domain}, ${company}, ${`https://www.google.com/s2/favicons?domain=${domain}&sz=64`})
        on conflict (domain) do update set
          name = coalesce(companies.name, excluded.name),
          favicon_url = excluded.favicon_url,
          updated_at = now()
      `;
    }
  }

  if (currentCompanyDomain) {
    await sql`
      insert into companies (domain, name, favicon_url)
      values (
        ${currentCompanyDomain},
        ${currentCompany},
        ${`https://www.google.com/s2/favicons?domain=${currentCompanyDomain}&sz=64`}
      )
      on conflict (domain) do update set
        name = coalesce(excluded.name, companies.name),
        favicon_url = excluded.favicon_url,
        updated_at = now()
    `;
  }

  return profile;
}
