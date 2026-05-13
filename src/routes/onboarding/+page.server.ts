import { fail, redirect, type Actions } from '@sveltejs/kit';
import { connectCalendarWithApiKey, userCalendars } from '$lib/server/calendars';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const calendars = locals.user ? await userCalendars(locals.user.id) : [];
  return {
    calendars,
    user: locals.user
  };
};

export const actions: Actions = {
  connect: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const form = await request.formData();
    const apiKey = String(form.get('api_key') ?? '').trim();
    if (!apiKey) {
      return fail(400, { message: 'Paste a Luma API key.' });
    }

    try {
      const result = await connectCalendarWithApiKey({
        apiKey,
        userId: locals.user.id,
        syncEvents: true
      });
      throw redirect(303, `/events?calendar_id=${result.calendarId}`);
    } catch (error) {
      return fail(400, {
        message: error instanceof Error ? error.message : 'Could not connect that Luma API key.'
      });
    }
  }
};
