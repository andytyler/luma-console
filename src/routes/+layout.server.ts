import type { LayoutServerLoad } from './$types';
import { userCalendars } from '$lib/server/calendars';

export const load: LayoutServerLoad = async ({ locals }) => {
  const calendars = locals.user ? await userCalendars(locals.user.id) : [];
  return {
    calendars,
    user: locals.user
      ? {
          id: locals.user.id,
          email: locals.user.email,
          role: locals.user.role,
          name: locals.user.name,
          avatar_url: locals.user.avatar_url
        }
      : null
  };
};
