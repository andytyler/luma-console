import { redirect, type Handle } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { setSvelteKitEnv, supabaseConfigured } from '$lib/server/env';

const publicPrefixes = ['/login', '/auth/callback', '/api/webhooks/luma'];
const publicFiles = ['/favicon.ico'];

export const handle: Handle = async ({ event, resolve }) => {
  const startedAt = Date.now();
  const isActionRequest = event.request.method === 'POST';

  setSvelteKitEnv(privateEnv);
  event.locals.user = null;
  event.locals.sessionId = null;

  if (supabaseConfigured()) {
    const { createSupabaseServerClient } = await import('$lib/server/supabase');
    const { upsertSupabaseUser } = await import('$lib/server/auth');
    const supabase = createSupabaseServerClient(event);
    const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (data.user) {
      event.locals.user = await upsertSupabaseUser(data.user);
      event.locals.sessionId = data.user.id;
    }
  }

  if (!event.locals.user) {
    const { getSession, sessionCookieName } = await import('$lib/server/auth');
    const token = event.cookies.get(sessionCookieName);
    if (token) {
      const session = await getSession(token);
      if (session) {
        event.locals.user = session.user;
        event.locals.sessionId = session.sessionId;
      }
    }
  }

  const pathname = event.url.pathname;
  const isPublic =
    publicFiles.includes(pathname) || publicPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!event.locals.user && !isPublic) {
    throw redirect(303, `/login?next=${encodeURIComponent(pathname + event.url.search)}`);
  }

  if (event.locals.user && pathname === '/login') {
    throw redirect(303, '/events');
  }

  if (
    event.locals.user &&
    pathname !== '/onboarding' &&
    !pathname.startsWith('/logout') &&
    !isPublic
  ) {
    const { defaultCalendar } = await import('$lib/server/calendars');
    const calendar = await defaultCalendar(event.locals.user.id);
    if (!calendar) {
      throw redirect(303, '/onboarding');
    }
  }

  if (isActionRequest) {
    console.info(
      `[action:start] ${event.request.method} ${event.url.pathname}${event.url.search} user=${event.locals.user?.email ?? 'anonymous'}`
    );
  }

  try {
    const response = await resolve(event);
    if (isActionRequest) {
      console.info(
        `[action:done] ${event.request.method} ${event.url.pathname}${event.url.search} status=${response.status} duration_ms=${Date.now() - startedAt}`
      );
    }
    return response;
  } catch (exception) {
    if (isActionRequest) {
      console.error(
        `[action:error] ${event.request.method} ${event.url.pathname}${event.url.search} duration_ms=${Date.now() - startedAt}`,
        exception
      );
    }
    throw exception;
  }
};
