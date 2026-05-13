import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const requiredCache = new Map<string, string>();
let localEnv: Record<string, string> | null = null;
let svelteKitEnv: Record<string, string | undefined> = {};

function parseDotEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex === -1) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return key ? [key, value] : null;
}

function readLocalEnv() {
  if (localEnv) return localEnv;

  localEnv = {};
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return localEnv;

  const contents = readFileSync(envPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);
    if (parsed) {
      const [key, value] = parsed;
      localEnv[key] = value;
    }
  }

  return localEnv;
}

export function env(name: string, fallback = '') {
  return svelteKitEnv[name] ?? process.env[name] ?? readLocalEnv()[name] ?? fallback;
}

export function setSvelteKitEnv(values: Record<string, string | undefined>) {
  svelteKitEnv = values;
  requiredCache.clear();
}

export function requireEnv(name: string) {
  const cached = requiredCache.get(name);
  if (cached) return cached;

  const value = env(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  requiredCache.set(name, value);
  return value;
}

export function adminEmails() {
  return env('ADMIN_EMAILS')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function lumaWebhookSecret() {
  return env('LUMA_WEBHOOK_SECRET');
}

export function lumaWebhookConfigured() {
  return Boolean(lumaWebhookSecret());
}

export function supabaseConfigured() {
  return Boolean(env('PUBLIC_SUPABASE_URL') && env('PUBLIC_SUPABASE_PUBLISHABLE_KEY'));
}

export function appEncryptionKey() {
  return env('APP_ENCRYPTION_KEY');
}

export function inviteEmailsEnabled() {
  return env('INVITE_EMAILS_ENABLED', 'false').toLowerCase() === 'true';
}
