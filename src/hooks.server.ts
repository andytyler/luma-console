import { redirect, type Handle } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { setSvelteKitEnv } from '$lib/server/env';

const publicPrefixes = ['/login', '/invite', '/api/webhooks/luma'];
const publicFiles = ['/favicon.ico'];

export const handle: Handle = async ({ event, resolve }) => {
  setSvelteKitEnv(privateEnv);
  const { getSession, sessionCookieName } = await import('$lib/server/auth');
  const token = event.cookies.get(sessionCookieName);
  event.locals.user = null;
  event.locals.sessionId = null;

  if (token) {
    const session = await getSession(token);
    if (session) {
      event.locals.user = session.user;
      event.locals.sessionId = session.sessionId;
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

  return resolve(event);
};
