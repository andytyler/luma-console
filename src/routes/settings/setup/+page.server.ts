import { error, fail, type Actions } from '@sveltejs/kit';
import { env, lumaWebhookConfigured } from '$lib/server/env';
import { sql } from '$lib/server/db';
import { fetchBrightDataLinkedinProfile, normalizeLinkedinProfileUrl } from '$lib/server/brightdata';
import { fetchGithubProfile } from '$lib/server/github';
import { lumaWritesEnabled, setLumaWritesEnabled } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

function githubUsernameFromInput(value: string) {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/github\.com\/([A-Za-z0-9-]+)/i);
  if (urlMatch?.[1]) return urlMatch[1].replace(/\.git$/, '');
  if (/^[A-Za-z0-9-]{1,39}$/.test(trimmed)) return trimmed;
  return null;
}

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2).slice(0, 12_000);
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Sign in required');
  }

  const calendars = await sql<{
    id: string;
    name: string;
    role: string;
    api_key_hint: string | null;
    has_api_key: boolean;
    last_synced_at: string | null;
  }[]>`
    select
      luma_calendars.id::text,
      luma_calendars.name,
      calendar_memberships.role,
      luma_calendars.api_key_hint,
      (luma_calendars.encrypted_api_key is not null) as has_api_key,
      luma_calendars.last_synced_at::text
    from calendar_memberships
    join luma_calendars on luma_calendars.id = calendar_memberships.calendar_id
    where calendar_memberships.user_id = ${locals.user.id}
    order by luma_calendars.created_at asc
  `;

  const lumaCalendarCount = calendars.filter((calendar) => calendar.has_api_key).length;
  const globalLumaConfigured = Boolean(env('LUMA_API_KEY'));
  const githubConfigured = Boolean(env('GITHUB_TOKEN'));
  const brightDataConfigured = Boolean(env('BRIGHTDATA_API_KEY'));
  const brightDataDatasetId = env('BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID', 'gd_l1viktl72bvl7bjuj0');
  const writesEnabled = await lumaWritesEnabled();

  return {
    calendars,
    integrations: {
      luma: {
        connected: globalLumaConfigured || lumaCalendarCount > 0,
        calendarCount: lumaCalendarCount,
        globalConfigured: globalLumaConfigured,
        webhookConfigured: lumaWebhookConfigured(),
        writesEnabled
      },
      github: {
        connected: githubConfigured
      },
      brightData: {
        connected: brightDataConfigured,
        datasetConfigured: Boolean(brightDataDatasetId),
        datasetId: brightDataDatasetId
      }
    }
  };
};

export const actions: Actions = {
  toggleLumaWrites: async ({ request, locals }) => {
    if (!locals.user) {
      throw error(401, 'Sign in required');
    }

    if (locals.user.role !== 'admin') {
      return fail(403, { message: 'Only app admins can change the Luma write toggle.' });
    }

    const form = await request.formData();
    const enabled = String(form.get('enabled') ?? 'false') === 'true';
    await setLumaWritesEnabled(enabled);

    return {
      intent: 'lumaWrites',
      message: `Luma writes are now ${enabled ? 'enabled' : 'disabled'}.`
    };
  },
  testGithub: async ({ request, locals }) => {
    if (!locals.user) {
      throw error(401, 'Sign in required');
    }

    const form = await request.formData();
    const input = String(form.get('github') ?? '').trim();
    const username = githubUsernameFromInput(input);
    if (!username) {
      return fail(400, {
        intent: 'github',
        message: 'Enter a GitHub username or profile URL.',
        githubInput: input
      });
    }

    try {
      const profile = await fetchGithubProfile(username);
      return {
        intent: 'github',
        message: `Fetched GitHub profile for ${profile.username}.`,
        githubInput: input,
        diagnostic: {
          provider: 'github',
          title: profile.username,
          url: profile.profileUrl,
          summary: {
            contributions: profile.contributionTotal,
            repos: profile.publicRepos,
            stars: profile.totalStars,
            topRepos: profile.topRepositories.map((repo) => `${repo.name} (${repo.stars})`).join(', '),
            followers: profile.followers,
            currentStreak: profile.currentStreak
          },
          rawJson: compactJson(profile)
        }
      };
    } catch (exception) {
      return fail(400, {
        intent: 'github',
        message: exception instanceof Error ? exception.message : String(exception),
        githubInput: input
      });
    }
  },
  testBrightData: async ({ request, locals }) => {
    if (!locals.user) {
      throw error(401, 'Sign in required');
    }

    const form = await request.formData();
    const input = String(form.get('linkedin') ?? '').trim();
    const url = normalizeLinkedinProfileUrl(input);
    if (!url) {
      return fail(400, {
        intent: 'brightdata',
        message: 'Enter a LinkedIn profile URL, linkedin.com/in/... or /in/...',
        linkedinInput: input
      });
    }

    try {
      const profile = await fetchBrightDataLinkedinProfile(url);
      return {
        intent: 'brightdata',
        message: `Fetched BrightData LinkedIn profile for ${url}.`,
        linkedinInput: input,
        diagnostic: {
          provider: 'brightdata',
          title: String(profile.name ?? profile.full_name ?? profile.url ?? url),
          url,
          summary: {
            position: profile.position ?? profile.current_title ?? profile.headline ?? null,
            company:
              typeof profile.current_company === 'object' && profile.current_company !== null
                ? (profile.current_company as Record<string, unknown>).name
                : profile.current_company ?? null,
            location:
              [profile.city, profile.country_code ?? profile.country].filter(Boolean).join(', ') ||
              profile.location ||
              null
          },
          rawJson: compactJson(profile)
        }
      };
    } catch (exception) {
      return fail(400, {
        intent: 'brightdata',
        message: exception instanceof Error ? exception.message : String(exception),
        linkedinInput: input
      });
    }
  }
};
