import { afterEach, beforeEach } from 'bun:test';
import { setSvelteKitEnv } from '../src/lib/server/env';

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response;

const originalFetch = globalThis.fetch.bind(globalThis);

const baseEnv: Record<string, string | undefined> = {
  ADMIN_EMAILS: 'admin@example.com',
  APP_ENCRYPTION_KEY: 'test-encryption-key-that-is-long-enough',
  BRIGHTDATA_API_KEY: '',
  BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID: 'gd_l1viktl72bvl7bjuj0',
  DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/luma_console_test',
  GITHUB_TOKEN: '',
  INVITE_EMAIL_FROM: '',
  INVITE_EMAILS_ENABLED: 'false',
  LUMA_API_KEY: '',
  LUMA_WEBHOOK_SECRET: '',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
  PUBLIC_SUPABASE_URL: '',
  RESEND_API_KEY: ''
};

function urlFromInput(input: RequestInfo | URL) {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
}

function isLocalUrl(url: URL) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
}

export function resetTestEnv(overrides: Record<string, string | undefined> = {}) {
  setSvelteKitEnv({ ...baseEnv, ...overrides });
}

export async function blockedExternalFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = urlFromInput(input);
  if (isLocalUrl(url)) return originalFetch(input, init);

  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  throw new Error(`Unstubbed external fetch blocked in tests: ${method.toUpperCase()} ${url.href}`);
}

export function mockFetch(handler: FetchHandler) {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit; url: URL; method: string }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlFromInput(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    calls.push({ input, init, url, method: method.toUpperCase() });
    return handler(input, init);
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = blockedExternalFetch as typeof fetch;
    }
  };
}

beforeEach(() => {
  resetTestEnv();
  globalThis.fetch = blockedExternalFetch as typeof fetch;
});

afterEach(() => {
  resetTestEnv();
  globalThis.fetch = blockedExternalFetch as typeof fetch;
});
