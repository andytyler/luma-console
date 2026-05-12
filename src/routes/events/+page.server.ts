import { fail, type Actions } from '@sveltejs/kit';
import { syncEventsFromLuma, syncGuestsForEvent } from '$lib/server/imports';
import { lumaConfigured } from '$lib/server/luma';
import { sql } from '$lib/server/db';
import { lumaWebhookConfigured } from '$lib/server/env';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [events, syncRuns, webhookDeliveries] = await Promise.all([
    sql<{
      id: string;
      luma_event_id: string;
      name: string;
      url: string | null;
      cover_url: string | null;
      start_at: string | null;
      end_at: string | null;
      timezone: string | null;
      status: string | null;
      guest_count: number;
      pending_count: number;
      approved_count: number;
      waitlist_count: number;
      last_synced_at: string | null;
      raw_json: Record<string, unknown>;
    }[]>`
      select
        id::text,
        luma_event_id,
        name,
        url,
        cover_url,
        start_at::text,
        end_at::text,
        timezone,
        status,
        guest_count,
        pending_count,
        approved_count,
        waitlist_count,
        last_synced_at::text,
        raw_json
      from events
      order by start_at desc nulls last
    `,
    sql<{
      type: string;
      status: string;
      records_seen: number;
      error: string | null;
      started_at: string;
      finished_at: string | null;
    }[]>`
      select type, status, records_seen, error, started_at::text, finished_at::text
      from luma_sync_runs
      order by started_at desc
      limit 5
    `,
    sql<{
      event_type: string | null;
      luma_event_id: string | null;
      luma_guest_id: string | null;
      status: string;
      error: string | null;
      received_at: string;
    }[]>`
      select
        event_type,
        luma_event_id,
        luma_guest_id,
        status,
        error,
        received_at::text
      from luma_webhook_deliveries
      order by received_at desc
      limit 8
    `
  ]);

  return {
    events,
    syncRuns,
    webhookDeliveries,
    lumaWebhookConfigured: lumaWebhookConfigured(),
    lumaConfigured: lumaConfigured()
  };
};

export const actions: Actions = {
  sync: async () => {
    if (!lumaConfigured()) {
      return fail(400, { message: 'Set LUMA_API_KEY before syncing events.' });
    }
    const result = await syncEventsFromLuma();
    return { message: `Imported ${result.imported} events.` };
  },
  syncAllGuests: async () => {
    if (!lumaConfigured()) {
      return fail(400, { message: 'Set LUMA_API_KEY before syncing guests.' });
    }

    await syncEventsFromLuma();
    const events = await sql<{ id: string; name: string }[]>`
      select id::text, name
      from events
      order by start_at desc nulls last
    `;

    let imported = 0;
    const failures: string[] = [];

    for (const event of events) {
      try {
        const result = await syncGuestsForEvent(event.id);
        imported += result.imported;
      } catch (error) {
        failures.push(`${event.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (failures.length > 0) {
      return fail(500, {
        message: `Imported ${imported} guests, but ${failures.length} event syncs failed.`,
        details: failures.slice(0, 5)
      });
    }

    return { message: `Synced ${events.length} events and imported ${imported} guests.` };
  }
};
