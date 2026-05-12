import { fail, redirect, type Actions } from '@sveltejs/kit';
import {
  acceptInvitation,
  createSession,
  getInvitationByToken,
  sessionCookieName,
  sessionCookieOptions
} from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const token = url.searchParams.get('token') ?? '';
  const invite = token ? await getInvitationByToken(token) : null;
  return {
    token,
    invite
  };
};

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const form = await request.formData();
    const token = String(form.get('token') ?? '');
    const password = String(form.get('password') ?? '');

    if (password.length < 12) {
      return fail(400, { message: 'Use at least 12 characters.', token });
    }

    const user = await acceptInvitation(token, password);
    if (!user) {
      return fail(400, { message: 'This invite is invalid or expired.', token });
    }

    const sessionToken = await createSession(user.id);
    cookies.set(sessionCookieName, sessionToken, sessionCookieOptions());
    throw redirect(303, '/events');
  }
};
