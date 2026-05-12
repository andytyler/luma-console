import { jsonb, sql } from './db';
import { getEvent, getEventGuest, listCalendarEvents, listEventGuests, unwrapEvent } from './luma';
import { normalizeEvent, normalizeGuest } from './luma-normalize';
import { enqueueScoreJobs } from './jobs';

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function mergeEventPayload(listEntry: Json, detailResponse: Json) {
  const listEvent = asObject(unwrapEvent(listEntry));
  const detailEvent = asObject(unwrapEvent(detailResponse));

  return {
    ...listEvent,
    ...detailEvent,
    _luma: {
      list_entry: listEntry,
      detail_response: detailResponse
    }
  };
}

export async function upsertEventFromRaw(raw: Json) {
  const event = normalizeEvent(raw);
  if (!event) return null;

  const [savedEvent] = await sql<{ id: string }[]>`
    insert into events (
      luma_event_id,
      api_id,
      name,
      url,
      cover_url,
      start_at,
      end_at,
      timezone,
      status,
      raw_json,
      last_synced_at,
      updated_at
    )
    values (
      ${event.lumaEventId},
      ${event.apiId},
      ${event.name},
      ${event.url},
      ${event.coverUrl},
      ${event.startAt},
      ${event.endAt},
      ${event.timezone},
      ${event.status},
      ${jsonb(event.raw)},
      now(),
      now()
    )
    on conflict (luma_event_id) do update set
      api_id = excluded.api_id,
      name = excluded.name,
      url = excluded.url,
      cover_url = excluded.cover_url,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      timezone = excluded.timezone,
      status = excluded.status,
      raw_json = excluded.raw_json,
      last_synced_at = now(),
      updated_at = now()
    returning id::text
  `;

  return {
    id: savedEvent.id,
    lumaEventId: event.lumaEventId
  };
}

export async function findEventByLumaId(lumaEventId: string) {
  const [event] = await sql<{ id: string; luma_event_id: string }[]>`
    select id::text, luma_event_id
    from events
    where luma_event_id = ${lumaEventId}
    limit 1
  `;
  return event ?? null;
}

export async function upsertGuestRawForEvent(eventId: string, raw: Json) {
  const guest = normalizeGuest(raw);
  if (!guest) return null;

  const [savedGuest] = await sql<{ id: string; score_locked: boolean }[]>`
    insert into guests (
      event_id,
      luma_guest_id,
      luma_user_id,
      name,
      email,
      approval_status,
      checked_in_at,
      registered_at,
      ticket_name,
      raw_json,
      updated_at
    )
    values (
      ${eventId},
      ${guest.lumaGuestId},
      ${guest.lumaUserId},
      ${guest.name},
      ${guest.email.toLowerCase()},
      ${guest.approvalStatus},
      ${guest.checkedInAt},
      ${guest.registeredAt},
      ${guest.ticketName},
      ${jsonb(guest.raw)},
      now()
    )
    on conflict (event_id, luma_guest_id) do update set
      luma_user_id = excluded.luma_user_id,
      name = excluded.name,
      email = excluded.email,
      approval_status = excluded.approval_status,
      checked_in_at = excluded.checked_in_at,
      registered_at = excluded.registered_at,
      ticket_name = excluded.ticket_name,
      raw_json = excluded.raw_json,
      updated_at = now()
    returning id::text, score_locked
  `;

  await sql`delete from registration_answers where guest_id = ${savedGuest.id}`;
  for (const answer of guest.answers) {
    await sql`
      insert into registration_answers (guest_id, question_key, question, answer, raw_json)
      values (${savedGuest.id}, ${answer.questionKey}, ${answer.question}, ${answer.answer}, ${jsonb(answer.raw)})
      on conflict (guest_id, question) do update set
        question_key = excluded.question_key,
        answer = excluded.answer,
        raw_json = excluded.raw_json
    `;
  }

  return savedGuest;
}

export async function refreshEventCounts(eventId: string) {
  const [counts] = await sql<{
    guest_count: number;
    pending_count: number;
    approved_count: number;
    waitlist_count: number;
  }[]>`
    select
      count(*)::int as guest_count,
      count(*) filter (where approval_status in ('pending_approval', 'pending'))::int as pending_count,
      count(*) filter (where approval_status in ('approved', 'going'))::int as approved_count,
      count(*) filter (where approval_status = 'waitlist')::int as waitlist_count
    from guests
    where event_id = ${eventId}
  `;

  await sql`
    update events
    set
      guest_count = ${counts.guest_count},
      pending_count = ${counts.pending_count},
      approved_count = ${counts.approved_count},
      waitlist_count = ${counts.waitlist_count},
      last_synced_at = now(),
      updated_at = now()
    where id = ${eventId}
  `;
}

export async function syncEventsFromLuma() {
  const [run] = await sql<{ id: string }[]>`
    insert into luma_sync_runs (type)
    values ('events')
    returning id::text
  `;

  try {
    const rawEvents = await listCalendarEvents();
    let imported = 0;

    for (const raw of rawEvents) {
      const listedEvent = normalizeEvent(raw);
      if (!listedEvent) continue;

      let eventRaw = raw;
      try {
        const detail = await getEvent(listedEvent.lumaEventId);
        eventRaw = mergeEventPayload(raw, detail);
      } catch (error) {
        eventRaw = {
          ...asObject(unwrapEvent(raw)),
          _luma: {
            list_entry: raw,
            detail_fetch_error: error instanceof Error ? error.message : String(error)
          }
        };
      }

      const savedEvent = await upsertEventFromRaw(eventRaw);
      if (savedEvent) imported += 1;
    }

    await sql`
      update luma_sync_runs
      set status = 'succeeded', records_seen = ${imported}, finished_at = now()
      where id = ${run.id}
    `;

    return { imported };
  } catch (error) {
    await sql`
      update luma_sync_runs
      set status = 'failed', error = ${error instanceof Error ? error.message : String(error)}, finished_at = now()
      where id = ${run.id}
    `;
    throw error;
  }
}

export async function syncGuestsForEvent(eventId: string) {
  const [event] = await sql<{ id: string; luma_event_id: string }[]>`
    select id::text, luma_event_id
    from events
    where id = ${eventId}
    limit 1
  `;
  if (!event) {
    throw new Error('Event not found.');
  }

  const [run] = await sql<{ id: string }[]>`
    insert into luma_sync_runs (type, event_id)
    values ('guests', ${event.id})
    returning id::text
  `;

  try {
    const rawGuests = await listEventGuests(event.luma_event_id);
    let imported = 0;
    const guestIds: string[] = [];

    for (const raw of rawGuests) {
      const savedGuest = await upsertGuestRawForEvent(event.id, raw);
      if (!savedGuest) continue;
      guestIds.push(savedGuest.id);
      imported += 1;
    }

    if (guestIds.length > 0) {
      await enqueueScoreJobs(guestIds);
    }

    await refreshEventCounts(event.id);

    await sql`
      update luma_sync_runs
      set status = 'succeeded', records_seen = ${imported}, finished_at = now()
      where id = ${run.id}
    `;

    return { imported };
  } catch (error) {
    await sql`
      update luma_sync_runs
      set status = 'failed', error = ${error instanceof Error ? error.message : String(error)}, finished_at = now()
      where id = ${run.id}
    `;
    throw error;
  }
}

export async function syncGuestForEventByLumaId(eventId: string, lumaEventId: string, guestId: string) {
  const rawGuest = await getEventGuest(lumaEventId, guestId);
  const savedGuest = await upsertGuestRawForEvent(eventId, rawGuest);
  if (!savedGuest) return { imported: 0 };

  await enqueueScoreJobs([savedGuest.id]);
  await refreshEventCounts(eventId);
  return { imported: 1 };
}
