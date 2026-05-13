import { redirect, type RequestHandler } from '@sveltejs/kit';
import { deleteSession, sessionCookieName, sessionCookieOptions } from '$lib/server/auth';
import { supabaseConfigured } from '$lib/server/env';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const POST: RequestHandler = async (event) => {
  const { locals, cookies } = event;
  if (supabaseConfigured()) {
    const supabase = createSupabaseServerClient(event);
    await supabase?.auth.signOut();
  }

  if (locals.sessionId) {
    try {
      await deleteSession(locals.sessionId);
    } catch {
      // Supabase session ids are not stored in the local sessions table.
    }
  }
  cookies.delete(sessionCookieName, sessionCookieOptions());
  throw redirect(303, '/login');
};
