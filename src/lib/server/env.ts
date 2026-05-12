const requiredCache = new Map<string, string>();

export function env(name: string, fallback = '') {
  return process.env[name] ?? fallback;
}

export function requireEnv(name: string) {
  const cached = requiredCache.get(name);
  if (cached) return cached;

  const value = process.env[name];
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

export function lumaWritesEnabled() {
  return env('LUMA_WRITES_ENABLED', 'false').toLowerCase() === 'true';
}
