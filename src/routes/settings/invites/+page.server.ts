import { error, fail, type Actions } from '@sveltejs/kit';
import { createInvitation, type UserRole } from '$lib/server/auth';
import { sql } from '$lib/server/db';
import type { PageServerLoad } from './$types';

const roles = new Set(['admin', 'reviewer']);

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role !== 'admin') {
    throw error(403, 'Admins only');
  }

  const [users, invites] = await Promise.all([
    sql<{ id: string; email: string; role: UserRole; created_at: string }[]>`
      select id::text, email, role, created_at::text
      from users
      order by created_at desc
    `,
    sql<{
      id: string;
      email: string;
      role: UserRole;
      expires_at: string;
      accepted_at: string | null;
      created_at: string;
    }[]>`
      select id::text, email, role, expires_at::text, accepted_at::text, created_at::text
      from invitations
      order by created_at desc
      limit 25
    `
  ]);

  return { users, invites };
};

export const actions: Actions = {
  create: async ({ request, locals, url }) => {
    if (locals.user?.role !== 'admin') {
      throw error(403, 'Admins only');
    }

    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const role = String(form.get('role') ?? 'reviewer') as UserRole;

    if (!email || !email.includes('@')) {
      return fail(400, { message: 'Enter a valid email.', email, role });
    }
    if (!roles.has(role)) {
      return fail(400, { message: 'Choose a valid role.', email, role });
    }

    const invite = await createInvitation(email, role, locals.user.id);
    return {
      inviteUrl: `${url.origin}/invite?token=${invite.token}`
    };
  }
};
