import { createServerClient } from '@supabase/ssr';
import type { RequestEvent } from '@sveltejs/kit';
import { env, supabaseConfigured } from './env';

export function createSupabaseServerClient(event: RequestEvent) {
  if (!supabaseConfigured()) return null;

  return createServerClient(
    env('PUBLIC_SUPABASE_URL'),
    env('PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll: () => event.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value, options } of cookiesToSet) {
            event.cookies.set(name, value, { ...options, path: options.path ?? '/' });
          }
          if (headers && Object.keys(headers).length > 0) {
            event.setHeaders(headers);
          }
        }
      }
    }
  );
}
