import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { jsonb, sql } from './db';
import {
  findEventByLumaId,
  refreshEventCounts,
  syncEventsFromLuma,
  syncGuestForEventByLumaId,
  upsertEventFromRaw,
  upsertGuestRawForEvent
} from './imports';
import { enqueueScoreJobs } from './jobs';
import { lumaConfigured } from './luma';
import { lumaWebhookSecret } from './env';

type Json = Record<string, unknown>;

type WebhookStatus = 'received' | 'processed' | 'ignored' | 'failed';

const GUEST_EVENT_TYPES = new Set(['guest.registered', 'guest.updated', 'ticket.registered']);
const EVENT_EVENT_TYPES = new Set([
  'calendar.event.added',
  'event.created',
  'event.updated',
  'event.canceled'
]);
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

function parseSignatureHeader(signatureHeader: string) {
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(',')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    parts[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return parts;
}

export function verifyLumaWebhookSignature(params: {
  secret: string;
  signatureHeader: string | null;
  rawBody: string;
  nowSeconds?: number;
}) {
  if (!params.signatureHeader) return false;

  const parts = parseSignatureHeader(params.signatureHeader);
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature) return false;

  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) return false;

  const expected = createHmac('sha256', params.secret)
    .update(`${parts.t}.${params.rawBody}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function asObject(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nested(source: Json | null, path: string) {
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Json)[part];
  }
  return current;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return null;
}

function findIdByPattern(value: unknown, pattern: RegExp): string | null {
  if (typeof value === 'string' && pattern.test(value)) return value;
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findIdByPattern(item, pattern);
      if (result) return result;
    }
    return null;
  }

  for (const item of Object.values(value as Json)) {
    const result = findIdByPattern(item, pattern);
    if (result) return result;
  }
  return null;
}

function webhookType(payload: Json) {
  return firstText(payload.type, payload.event_type, payload.name) ?? 'unknown';
}

function deliveryId(headers: Headers, rawBody: string) {
  return (
    headers.get('webhook-id') ??
    headers.get('Webhook-Id') ??
    headers.get('x-luma-delivery') ??
    createHash('sha256').update(rawBody).digest('hex')
  );
}

function extractEventId(payload: Json) {
  const data = asObject(payload.data);
  return (
    firstText(
      payload.event_id,
      payload.event_api_id,
      nested(payload, 'event.id'),
      nested(payload, 'event.api_id'),
      nested(data, 'event_id'),
      nested(data, 'event_api_id'),
      nested(data, 'event.id'),
      nested(data, 'event.api_id'),
      nested(data, 'guest.event_id'),
      nested(data, 'guest.event_api_id'),
      nested(data, 'guest.event.id'),
      nested(data, 'guest.event.api_id'),
      nested(data, 'ticket.event_id'),
      nested(data, 'ticket.event_api_id'),
      nested(data, 'ticket.event.id'),
      nested(data, 'ticket.event.api_id')
    ) ?? findIdByPattern(payload, /^evt[-_]/)
  );
}

function extractGuestId(payload: Json) {
  const data = asObject(payload.data);
  return (
    firstText(
      payload.guest_id,
      payload.guest_api_id,
      nested(payload, 'guest.id'),
      nested(payload, 'guest.api_id'),
      nested(payload, 'guest.guest_id'),
      nested(payload, 'guest.guest_api_id'),
      nested(payload, 'guest.guest_key'),
      nested(data, 'guest_id'),
      nested(data, 'guest_api_id'),
      nested(data, 'guest.id'),
      nested(data, 'guest.api_id'),
      nested(data, 'guest.guest_id'),
      nested(data, 'guest.guest_api_id'),
      nested(data, 'guest.guest_key'),
      nested(data, 'ticket.guest_id'),
      nested(data, 'ticket.guest_api_id'),
      nested(data, 'ticket.guest.id'),
      nested(data, 'ticket.guest.api_id')
    ) ?? findIdByPattern(payload, /^gst[-_]/)
  );
}

async function insertDelivery(params: {
  deliveryId: string;
  eventType: string;
  lumaEventId: string | null;
  lumaGuestId: string | null;
  payload: Json;
}) {
  const [delivery] = await sql<{ id: string; inserted: boolean }[]>`
    insert into luma_webhook_deliveries (
      delivery_id,
      event_type,
      luma_event_id,
      luma_guest_id,
      signature_valid,
      payload
    )
    values (
      ${params.deliveryId},
      ${params.eventType},
      ${params.lumaEventId},
      ${params.lumaGuestId},
      true,
      ${jsonb(params.payload)}
    )
    on conflict (delivery_id) do nothing
    returning id::text, true as inserted
  `;

  if (delivery) return delivery;

  const [existing] = await sql<{ id: string; inserted: boolean }[]>`
    select id::text, false as inserted
    from luma_webhook_deliveries
    where delivery_id = ${params.deliveryId}
    limit 1
  `;
  return existing;
}

async function updateDelivery(id: string, status: WebhookStatus, error?: string) {
  await sql`
    update luma_webhook_deliveries
    set status = ${status}, error = ${error ?? null}, processed_at = now()
    where id = ${id}
  `;
}

async function processEventWebhook(payload: Json, lumaEventId: string | null) {
  const data = asObject(payload.data);
  const eventPayload = asObject(data?.event) ?? data ?? payload;
  const savedEvent = await upsertEventFromRaw(eventPayload);

  if (savedEvent) return 'processed' as const;

  if (!lumaEventId || !lumaConfigured()) return 'ignored' as const;

  await syncEventsFromLuma();
  return 'processed' as const;
}

async function findOrImportEvent(lumaEventId: string) {
  const existing = await findEventByLumaId(lumaEventId);
  if (existing) return existing;

  if (!lumaConfigured()) return null;

  await syncEventsFromLuma();
  return findEventByLumaId(lumaEventId);
}

async function processGuestWebhook(payload: Json, lumaEventId: string | null, lumaGuestId: string | null) {
  if (!lumaEventId) return 'ignored' as const;

  const event = await findOrImportEvent(lumaEventId);
  if (!event) return 'ignored' as const;

  if (lumaGuestId && lumaConfigured()) {
    await syncGuestForEventByLumaId(event.id, lumaEventId, lumaGuestId);
    return 'processed' as const;
  }

  const data = asObject(payload.data);
  const guestPayload = asObject(data?.guest) ?? data;
  if (!guestPayload) return 'ignored' as const;

  const savedGuest = await upsertGuestRawForEvent(event.id, guestPayload);
  if (!savedGuest) return 'ignored' as const;

  await enqueueScoreJobs([savedGuest.id]);
  await refreshEventCounts(event.id);
  return 'processed' as const;
}

async function processWebhookPayload(payload: Json, lumaEventId: string | null, lumaGuestId: string | null) {
  const type = webhookType(payload);

  if (EVENT_EVENT_TYPES.has(type)) {
    return processEventWebhook(payload, lumaEventId);
  }

  if (GUEST_EVENT_TYPES.has(type)) {
    return processGuestWebhook(payload, lumaEventId, lumaGuestId);
  }

  return 'ignored' as const;
}

export async function receiveLumaWebhook(headers: Headers, rawBody: string) {
  const secret = lumaWebhookSecret();
  if (!secret) {
    return {
      ok: false,
      status: 500,
      body: { ok: false, error: 'LUMA_WEBHOOK_SECRET is not configured.' }
    };
  }

  const signatureValid = verifyLumaWebhookSignature({
    secret,
    signatureHeader: headers.get('webhook-signature'),
    rawBody
  });
  if (!signatureValid) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: 'Invalid Luma webhook signature.' }
    };
  }

  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    return {
      ok: false,
      status: 400,
      body: { ok: false, error: 'Invalid JSON payload.' }
    };
  }

  const eventType = webhookType(payload);
  const lumaEventId = extractEventId(payload);
  const lumaGuestId = extractGuestId(payload);
  const inserted = await insertDelivery({
    deliveryId: deliveryId(headers, rawBody),
    eventType,
    lumaEventId,
    lumaGuestId,
    payload
  });

  if (!inserted) {
    return {
      ok: true,
      status: 200,
      body: { ok: true, status: 'ignored', reason: 'Duplicate delivery.' }
    };
  }

  if (!inserted.inserted) {
    return {
      ok: true,
      status: 200,
      body: { ok: true, id: inserted.id, status: 'ignored', reason: 'Duplicate delivery.' }
    };
  }

  try {
    const status = await processWebhookPayload(payload, lumaEventId, lumaGuestId);
    await updateDelivery(inserted.id, status);
    return {
      ok: true,
      status: 200,
      body: { ok: true, id: inserted.id, status }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateDelivery(inserted.id, 'failed', message);
    return {
      ok: true,
      status: 200,
      body: { ok: true, id: inserted.id, status: 'failed', error: message }
    };
  }
}
