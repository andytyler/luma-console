import { env, lumaWritesEnabled, requireEnv } from './env';

const LUMA_BASE_URL = 'https://public-api.luma.com';
const PAGE_LIMIT = 50;

type Json = Record<string, unknown>;

export class LumaError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload: unknown
  ) {
    super(message);
  }
}

function apiKey() {
  return requireEnv('LUMA_API_KEY');
}

function appendParams(url: URL, params: Record<string, string | number | undefined>) {
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { text };
  }
}

export async function lumaGet(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(path, LUMA_BASE_URL);
  appendParams(url, params);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-luma-api-key': apiKey(),
      accept: 'application/json'
    }
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new LumaError(`Luma GET ${path} failed`, response.status, payload);
  }
  return payload;
}

export async function lumaPost(
  path: string,
  body: Json,
  options: { dryRun?: boolean; confirmed?: boolean } = {}
) {
  if (options.dryRun || !options.confirmed || !lumaWritesEnabled()) {
    return {
      dryRun: true,
      writesEnabled: lumaWritesEnabled(),
      path,
      body
    };
  }

  const response = await fetch(new URL(path, LUMA_BASE_URL), {
    method: 'POST',
    headers: {
      'x-luma-api-key': apiKey(),
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new LumaError(`Luma POST ${path} failed`, response.status, payload);
  }
  return payload;
}

function entries(payload: Json) {
  const candidates = [
    payload.entries,
    payload.events,
    payload.guests,
    payload.data,
    payload.items,
    payload.results
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Json[];
  }
  return [];
}

function hasMore(payload: Json) {
  return Boolean(payload.has_more ?? payload.hasMore);
}

function nextCursor(payload: Json) {
  return String(payload.next_cursor ?? payload.nextCursor ?? payload.pagination_cursor ?? '');
}

async function paginated(path: string, params: Record<string, string | number | undefined>) {
  const all: Json[] = [];
  let cursor = '';

  do {
    const payload = await lumaGet(path, {
      ...params,
      pagination_limit: PAGE_LIMIT,
      pagination_cursor: cursor || undefined
    });
    all.push(...entries(payload));
    cursor = nextCursor(payload);
    if (!hasMore(payload)) break;
  } while (cursor);

  return all;
}

export function unwrapEvent(entry: Json) {
  return ((entry.event as Json | undefined) ?? entry) as Json;
}

export function unwrapGuest(entry: Json) {
  return ((entry.guest as Json | undefined) ?? entry) as Json;
}

export async function listCalendarEvents() {
  return paginated('/v1/calendar/list-events', {
    sort_column: 'start_at',
    sort_direction: 'desc'
  });
}

export async function listEventGuests(eventId: string) {
  return paginated('/v1/event/get-guests', {
    event_id: eventId
  });
}

export async function getEventGuest(eventId: string, guestId: string) {
  return lumaGet('/v1/event/get-guest', {
    event_id: eventId,
    id: guestId
  });
}

export async function updateGuestStatus(params: {
  eventId: string;
  guestId: string;
  approvalStatus: 'approved' | 'declined' | 'waitlist';
  message?: string;
  dryRun?: boolean;
  confirmed?: boolean;
}) {
  return lumaPost(
    '/v1/event/update-guest-status',
    {
      event_id: params.eventId,
      guest_id: params.guestId,
      approval_status: params.approvalStatus,
      message: params.message || undefined
    },
    {
      dryRun: params.dryRun,
      confirmed: params.confirmed
    }
  );
}

export function lumaConfigured() {
  return Boolean(env('LUMA_API_KEY'));
}
