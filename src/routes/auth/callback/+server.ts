import { redirect, type RequestHandler } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/events';
  return value;
}

export const GET: RequestHandler = async (event) => {
  const code = event.url.searchParams.get('code');
  const next = safeNext(event.url.searchParams.get('next'));
  const supabase = createSupabaseServerClient(event);

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      throw redirect(303, next);
    }
  }

  throw redirect(303, '/login?error=oauth');
};
