import { redirect, type RequestHandler } from '@sveltejs/kit';
import { deleteSession, sessionCookieName, sessionCookieOptions } from '$lib/server/auth';

export const POST: RequestHandler = async ({ locals, cookies }) => {
  if (locals.sessionId) {
    await deleteSession(locals.sessionId);
  }
  cookies.delete(sessionCookieName, sessionCookieOptions());
  throw redirect(303, '/login');
};
