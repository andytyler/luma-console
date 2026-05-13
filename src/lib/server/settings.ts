import { jsonb, sql } from './db';

const LUMA_WRITES_KEY = 'luma_writes_enabled';
const BATCH_NOTES_PREFIX = 'luma_batch_notes:';
const batchNoteStatuses = new Set(['approved', 'declined']);

export async function lumaWritesEnabled() {
  const [row] = await sql<{ value: { enabled?: boolean } }[]>`
    select value
    from app_settings
    where key = ${LUMA_WRITES_KEY}
    limit 1
  `;

  return row?.value?.enabled === true;
}

export async function setLumaWritesEnabled(enabled: boolean) {
  await sql`
    insert into app_settings (key, value, updated_at)
    values (${LUMA_WRITES_KEY}, ${jsonb({ enabled })}, now())
    on conflict (key) do update set
      value = excluded.value,
      updated_at = now()
  `;
}

export async function getLumaBatchNotes(eventId: string) {
  const [row] = await sql<{ value: Record<string, unknown> }[]>`
    select value
    from app_settings
    where key = ${`${BATCH_NOTES_PREFIX}${eventId}`}
    limit 1
  `;

  return {
    approved: typeof row?.value?.approved === 'string' ? row.value.approved : '',
    declined: typeof row?.value?.declined === 'string' ? row.value.declined : ''
  };
}

export async function setLumaBatchNote(eventId: string, status: string, message: string) {
  if (!batchNoteStatuses.has(status)) return;
  const current = await getLumaBatchNotes(eventId);
  const next = {
    ...current,
    [status]: message
  };

  await sql`
    insert into app_settings (key, value, updated_at)
    values (${`${BATCH_NOTES_PREFIX}${eventId}`}, ${jsonb(next)}, now())
    on conflict (key) do update set
      value = excluded.value,
      updated_at = now()
  `;
}
