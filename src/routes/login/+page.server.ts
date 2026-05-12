import { fail, redirect, type Actions } from '@sveltejs/kit';
import {
  authenticate,
  countUsers,
  createSession,
  createUser,
  sessionCookieName,
  sessionCookieOptions
} from '$lib/server/auth';
import { adminEmails } from '$lib/server/env';
import type { PageServerLoad } from './$types';

function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/events';
  return value;
}

export const load: PageServerLoad = async ({ url }) => {
  const userCount = await countUsers();
  return {
    setupMode: userCount === 0,
    next: safeNext(url.searchParams.get('next')),
    adminEmails: adminEmails()
  };
};

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const password = String(form.get('password') ?? '');
    const next = safeNext(url.searchParams.get('next'));

    if (!email || !password) {
      return fail(400, { message: 'Email and password are required.', email });
    }

    let user = await authenticate(email, password);

    if (!user) {
      const userCount = await countUsers();
      if (userCount === 0) {
        const admins = adminEmails();
        if (!admins.includes(email)) {
          return fail(403, {
            message: 'First admin must match ADMIN_EMAILS.',
            email,
            adminEmails: admins
          });
        }
        if (password.length < 12) {
          return fail(400, {
            message: 'Use at least 12 characters for the first admin password.',
            email
          });
        }
        user = await createUser(email, password, 'admin');
      } else {
        return fail(401, { message: 'Invalid email or password.', email });
      }
    }

    const token = await createSession(user.id);
    cookies.set(sessionCookieName, token, sessionCookieOptions());
    throw redirect(303, next);
  }
};
