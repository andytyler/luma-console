import { env } from './env';
import { jsonb, sql } from './db';

type Json = Record<string, unknown>;

const BRIGHTDATA_BASE_URL = 'https://api.brightdata.com/datasets/v3';
const BRIGHTDATA_URL = `${BRIGHTDATA_BASE_URL}/scrape`;
const WORK_HISTORY_FIELDS = [
  'experience',
  'experiences',
  'position',
  'positions',
  'work_experience',
  'current_positions',
  'past_experience',
  'jobs',
  'optional_jobs',
  'job_history',
  'employment',
  'employment_history',
  'position_history',
  'positions_history',
  'experience_details',
  'experiences_details'
];

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '--' || /^n\/?a$/i.test(trimmed)) return null;
    return trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return null;
}

function companyName(value: unknown) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const object = value as Json;
    return firstText(object.name, object.company_name, object.title, object.organization);
  }
  return null;
}

function companyDomain(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const object = value as Json;
  return firstText(object.domain, object.website, object.url);
}

function jobCompany(item: Json) {
  return companyName(
    item.company ??
      item.company_name ??
      item.organization ??
      item.employer ??
      item.current_company ??
      item.school
  );
}

function jobCompanyDomain(item: Json) {
  return (
    companyDomain(item.company ?? item.organization ?? item.employer ?? item.current_company) ??
    firstText(
      item.company_domain,
      item.organization_domain,
      item.employer_domain,
      item.domain,
      item.company_website,
      item.website
    )
  );
}

function jobTitle(item: Json) {
  const company = jobCompany(item);
  const title = firstText(item.title);
  const subtitle = firstText(item.subtitle);

  if (subtitle && title && company && title.toLowerCase() === company.toLowerCase()) return subtitle;
  if (subtitle && !title) return subtitle;

  return firstText(
    title,
    item.position,
    item.role,
    item.job_title,
    subtitle,
    item.name,
    item.occupation
  );
}

function jobStartDate(item: Json) {
  return firstText(item.start_date, item.start, item.starts_at, item.from, item.date_from);
}

function jobEndDate(item: Json) {
  return firstText(item.end_date, item.end, item.ends_at, item.to, item.date_to);
}

function profileKeys(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Json).slice(0, 30);
}

function valueKind(value: unknown) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array:${value.length}`;
  return typeof value;
}

function shortValue(value: unknown) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 120)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    return json.length > 180 ? `${json.slice(0, 180)}...` : json;
  } catch {
    return '[unserializable]';
  }
}

function fieldSummary(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return valueKind(value);
  return Object.entries(value as Json)
    .slice(0, 24)
    .map(([key, entry]) => `${key}:${valueKind(entry)}=${shortValue(entry)}`)
    .join(' | ');
}

function rawPreview(value: unknown) {
  try {
    const json = JSON.stringify(value);
    return json.length > 5000 ? `${json.slice(0, 5000)}...<truncated>` : json;
  } catch {
    return '[unserializable]';
  }
}

function logLinkedinProfileData(label: string, value: unknown) {
  console.info(`[brightdata:linkedin:data:${label}:fields] ${fieldSummary(value)}`);
  console.info(`[brightdata:linkedin:data:${label}:raw] ${rawPreview(value)}`);
}

function objectRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Json;
}

function firstObjectFrom(value: unknown): Json | null {
  if (Array.isArray(value)) return firstObjectFrom(value[0]);
  return objectRecord(value);
}

function unwrapProfilePayload(payload: unknown) {
  const root = firstObjectFrom(payload) ?? {};
  const data = firstObjectFrom(root.data);
  if (data) return data;
  const result = firstObjectFrom(root.result);
  if (result) return result;
  const results = firstObjectFrom(root.results);
  if (results) return results;
  const records = firstObjectFrom(root.records);
  if (records) return records;
  const rows = firstObjectFrom(root.rows);
  if (rows) return rows;
  return root;
}

function candidateObjects(profile: Json) {
  return [
    profile,
    objectRecord(profile.input),
    objectRecord(profile.data),
    objectRecord(profile.result),
    objectRecord(profile.profile),
    objectRecord(profile.person)
  ].filter(Boolean) as Json[];
}

function snapshotId(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as Json;
  return firstText(object.snapshot_id, object.snapshotId);
}

function hasOnlySnapshotMetadata(profile: Json) {
  const keys = Object.keys(profile).filter((key) => !['snapshot_id', 'snapshotId', 'status'].includes(key));
  return Boolean(snapshotId(profile)) && keys.length === 0;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadSnapshot(snapshot: string, apiKey: string) {
  const response = await fetch(`${BRIGHTDATA_BASE_URL}/snapshot/${snapshot}?format=json`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json'
    }
  });
  const payload = (await response.json()) as unknown;
  const profile = Array.isArray(payload) ? ((payload[0] ?? {}) as Json) : (payload as Json);
  console.info(
    `[brightdata:linkedin:snapshot:download] snapshot=${snapshot} status=${response.status} ok=${response.ok} shape=${Array.isArray(payload) ? `array:${payload.length}` : typeof payload} keys=${profileKeys(profile).join(',')}`
  );
  if (!response.ok) {
    throw new Error(`BrightData snapshot ${snapshot} download failed.`);
  }
  return profile;
}

async function resolveSnapshot(snapshot: string, apiKey: string) {
  const attempts = Math.max(1, Math.min(12, Number(env('BRIGHTDATA_SNAPSHOT_POLL_ATTEMPTS', '4'))));
  const intervalMs = Math.max(250, Math.min(10_000, Number(env('BRIGHTDATA_SNAPSHOT_POLL_MS', '1500'))));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(`${BRIGHTDATA_BASE_URL}/progress/${snapshot}`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json'
      }
    });
    const payload = (await response.json()) as Json;
    const status = firstText(payload.status);
    console.info(
      `[brightdata:linkedin:snapshot:progress] snapshot=${snapshot} attempt=${attempt}/${attempts} status=${status ?? 'unknown'} http=${response.status}`
    );

    if (!response.ok) {
      throw new Error(`BrightData snapshot ${snapshot} progress check failed.`);
    }

    if (status === 'ready') {
      return downloadSnapshot(snapshot, apiKey);
    }

    if (['failed', 'error', 'canceled', 'cancelled'].includes((status ?? '').toLowerCase())) {
      throw new Error(`BrightData snapshot ${snapshot} is ${status}.`);
    }

    if (attempt < attempts) await sleep(intervalMs);
  }

  throw new Error(`BrightData snapshot ${snapshot} is not ready yet. Run jobs again shortly.`);
}

function currentTitle(profile: Json) {
  for (const candidate of candidateObjects(profile)) {
    const positionText = firstText(candidate.position);
    if (positionText?.includes(' - ')) return positionText.split(' - ')[0]?.trim() || null;

    const title = firstText(
      positionText,
      candidate.current_title,
      candidate.job_title,
      candidate.title,
      candidate.headline,
      candidate.occupation,
      candidate.current_position
    );
    if (title) return title;

    const firstPosition = Array.isArray(candidate.position) ? objectRecord(candidate.position[0]) : null;
    const positionTitle = firstPosition
      ? firstText(firstPosition.title, firstPosition.position, firstPosition.role)
      : null;
    if (positionTitle) return positionTitle;

    const firstHistoryItem = firstWorkHistoryItem(candidate);
    const historyTitle = firstHistoryItem ? jobTitle(firstHistoryItem) : null;
    if (historyTitle) return historyTitle;
  }

  return null;
}

function currentCompany(profile: Json) {
  for (const candidate of candidateObjects(profile)) {
    const positionText = firstText(candidate.position);
    if (positionText?.includes(' - ')) {
      const company = positionText.split(' - ').slice(1).join(' - ').trim();
      if (company) return company;
    }

    const company =
      companyName(candidate.current_company) ??
      firstText(
        candidate.current_company_name,
        candidate.company_name,
        candidate.company,
        candidate.organization,
        candidate.current_company
      );
    if (company) return company;

    const firstPosition = Array.isArray(candidate.position) ? objectRecord(candidate.position[0]) : null;
    const positionCompany = firstPosition
      ? companyName(firstPosition.company ?? firstPosition.company_name ?? firstPosition.organization)
      : null;
    if (positionCompany) return positionCompany;

    const firstHistoryItem = firstWorkHistoryItem(candidate);
    const historyCompany = firstHistoryItem ? jobCompany(firstHistoryItem) : null;
    if (historyCompany) return historyCompany;
  }

  return null;
}

function currentCompanyDomain(profile: Json) {
  for (const candidate of candidateObjects(profile)) {
    const domain =
      companyDomain(candidate.current_company) ??
      firstText(candidate.current_company_domain, candidate.company_domain, candidate.domain);
    if (domain) return domain;

    const firstPosition = Array.isArray(candidate.position) ? objectRecord(candidate.position[0]) : null;
    const positionDomain = firstPosition
      ? companyDomain(firstPosition.company ?? firstPosition.company_name ?? firstPosition.organization)
      : null;
    if (positionDomain) return positionDomain;

    const firstHistoryItem = firstWorkHistoryItem(candidate);
    const historyDomain = firstHistoryItem ? jobCompanyDomain(firstHistoryItem) : null;
    if (historyDomain) return historyDomain;
  }

  return null;
}

function workHistoryArray(candidate: Json) {
  for (const field of WORK_HISTORY_FIELDS) {
    const value = candidate[field];
    if (Array.isArray(value)) return value as Json[];
  }
  return null;
}

function firstWorkHistoryItem(candidate: Json) {
  const history = workHistoryArray(candidate);
  return history?.length ? objectRecord(history[0]) : null;
}

function workHistoryFromProfile(profile: Json) {
  for (const candidate of candidateObjects(profile)) {
    const experience = workHistoryArray(candidate);
    if (experience) return experience;
  }

  console.info(
    `[linkedin:work-history:missing] checked=${WORK_HISTORY_FIELDS.join(',')} keys=${profileKeys(profile).join(',')}`
  );
  return [];
}

export function normalizeLinkedinProfileUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return null;
  if (/^https?:\/\/(?:www\.)?linkedin\.com\//i.test(trimmed)) return trimmed;
  if (/^(?:www\.)?linkedin\.com\//i.test(trimmed)) return `https://${trimmed}`;
  if (/^\/in\//i.test(trimmed)) return `https://www.linkedin.com${trimmed}`;
  if (/^in\//i.test(trimmed)) return `https://www.linkedin.com/${trimmed}`;
  return null;
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
  if (!row) {
    console.info(`[linkedin:infer:missing] guest=${guestId} reason=no_guest`);
    return null;
  }

  for (const answer of row.answers) {
    const answerText = answer.answer ?? '';
    const direct = normalizeLinkedinProfileUrl(answerText);
    if (direct) {
      console.info(
        `[linkedin:infer:found] guest=${guestId} source=registration_answer question="${answer.question}" url=${direct}`
      );
      return { url: direct, confidence: 0.95, source: 'registration_answer' };
    }

    const match = answerText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[^\s,]+/i);
    const url = match?.[0] ? normalizeLinkedinProfileUrl(match[0]) : null;
    if (url) {
      console.info(
        `[linkedin:infer:found] guest=${guestId} source=registration_answer_match question="${answer.question}" url=${url}`
      );
      return { url, confidence: 0.95, source: 'registration_answer' };
    }
  }

  const rawMatch = JSON.stringify(row.raw_json).match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[^"',\s]+|\/in\/[^"',\s]+/i
  );
  const rawUrl = rawMatch?.[0] ? normalizeLinkedinProfileUrl(rawMatch[0]) : null;
  if (rawUrl) {
    console.info(`[linkedin:infer:found] guest=${guestId} source=luma_raw_json url=${rawUrl}`);
    return { url: rawUrl, confidence: 0.75, source: 'luma_raw_json' };
  }

  console.info(`[linkedin:infer:missing] guest=${guestId} answers=${row.answers.length}`);
  return null;
}

export async function fetchBrightDataLinkedinProfile(url: string) {
  const apiKey = env('BRIGHTDATA_API_KEY');
  if (!apiKey) {
    throw new Error('BRIGHTDATA_API_KEY is not configured.');
  }

  const datasetId = env('BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID', 'gd_l1viktl72bvl7bjuj0');
  const body = { input: [{ url }] };
  console.info(`[brightdata:linkedin:fetch:start] dataset=${datasetId} url=${url}`);
  console.info(`[brightdata:linkedin:fetch:request] ${JSON.stringify(body)}`);
  const response = await fetch(`${BRIGHTDATA_URL}?dataset_id=${datasetId}&format=json`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as unknown;
  logLinkedinProfileData('fetch-payload', payload);
  const profile = unwrapProfilePayload(payload);
  logLinkedinProfileData('fetch-profile', profile);
  console.info(
    `[brightdata:linkedin:fetch:response] status=${response.status} ok=${response.ok} payload_shape=${valueKind(payload)} profile_keys=${profileKeys(profile).join(',')}`
  );
  if (!response.ok) {
    throw new Error(`BrightData LinkedIn scrape failed for ${url}.`);
  }

  const returnedSnapshot = snapshotId(profile);
  if (returnedSnapshot && hasOnlySnapshotMetadata(profile)) {
    console.info(`[brightdata:linkedin:fetch:snapshot] snapshot=${returnedSnapshot} url=${url}`);
    return resolveSnapshot(returnedSnapshot, apiKey);
  }

  return profile;
}

export async function enrichLinkedin(guestId: string) {
  console.info(`[linkedin:enrich:start] guest=${guestId}`);
  const inferred = await inferLinkedinUrl(guestId);
  if (!inferred) {
    console.info(`[linkedin:enrich:skipped] guest=${guestId} reason=no_linkedin_url`);
    return { skipped: true, reason: 'No LinkedIn URL found in registration data.' };
  }

  const profile = await fetchBrightDataLinkedinProfile(inferred.url);
  logLinkedinProfileData(`guest-${guestId}`, profile);
  const normalizedTitle = currentTitle(profile);
  const normalizedCompany = currentCompany(profile);
  const normalizedCompanyDomain = currentCompanyDomain(profile);
  const workHistory = workHistoryFromProfile(profile);
  const experienceValue = profile.experience;

  console.info(
    `[linkedin:enrich:normalized] guest=${guestId} url=${inferred.url} title="${normalizedTitle ?? ''}" company="${normalizedCompany ?? ''}" domain="${normalizedCompanyDomain ?? ''}" work_history=${workHistory.length} keys=${profileKeys(profile).join(',')}`
  );
  if (workHistory.length === 0) {
    console.warn(
      `[linkedin:enrich:no-jobs] guest=${guestId} reason=no_experience_array position=${JSON.stringify(profile.position ?? null)} current_company=${JSON.stringify(profile.current_company ?? null)} current_company_name=${JSON.stringify(profile.current_company_name ?? null)} experience_type=${valueKind(experienceValue)}`
    );
  }
  console.info(
    `[linkedin:enrich:jobs:preview] guest=${guestId} jobs=${JSON.stringify(
      workHistory.slice(0, 5).map((item) => ({
        title: jobTitle(item),
        company: jobCompany(item),
        start: jobStartDate(item),
        end: jobEndDate(item),
        keys: profileKeys(item)
      }))
    )}`
  );

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
      ${normalizedTitle},
      ${normalizedCompany},
      ${normalizedCompanyDomain},
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
    const company = jobCompany(item);
    const domain = jobCompanyDomain(item);
    const title = jobTitle(item);
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
        ${title},
        ${domain},
        ${jobStartDate(item)},
        ${jobEndDate(item)},
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

  if (normalizedCompanyDomain) {
    await sql`
      insert into companies (domain, name, favicon_url)
      values (
        ${normalizedCompanyDomain},
        ${normalizedCompany},
        ${`https://www.google.com/s2/favicons?domain=${normalizedCompanyDomain}&sz=64`}
      )
      on conflict (domain) do update set
        name = coalesce(excluded.name, companies.name),
        favicon_url = excluded.favicon_url,
        updated_at = now()
    `;
  }

  console.info(
    `[linkedin:enrich:saved] guest=${guestId} profile=${savedProfile.id} title_present=${Boolean(normalizedTitle)} company_present=${Boolean(normalizedCompany)} work_history_saved=${workHistory.slice(0, 10).length}`
  );

  return profile;
}
