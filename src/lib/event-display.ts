type Json = Record<string, unknown>;

export type EventLike = {
  name: string;
  start_at: string | null;
  end_at?: string | null;
  timezone?: string | null;
  status?: string | null;
  raw_json?: Json | null;
};

function asObject(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function nested(source: unknown, path: string) {
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

function arrayText(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      const object = asObject(item);
      return firstText(object?.name, object?.title, object?.email, object?.url);
    })
    .filter(Boolean) as string[];
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function durationParts(ms: number) {
  const totalMinutes = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours > 0 && parts.length < 2) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0 && parts.length < 2 && days === 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  }
  return parts.length ? parts.join(', ') : 'now';
}

export function isPastEvent(event: EventLike, now = new Date()) {
  const end = event.end_at ? new Date(event.end_at) : null;
  const start = event.start_at ? new Date(event.start_at) : null;
  if (end && !Number.isNaN(end.valueOf())) return end.getTime() < now.getTime();
  if (start && !Number.isNaN(start.valueOf())) return start.getTime() < now.getTime();
  return false;
}

export function isLiveEvent(event: EventLike, now = new Date()) {
  if (!event.start_at || !event.end_at) return false;
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return false;
  return start.getTime() <= now.getTime() && end.getTime() >= now.getTime();
}

export function relativeEventTime(event: EventLike, now = new Date()) {
  if (!event.start_at) return 'No start time';

  const start = new Date(event.start_at);
  const end = event.end_at ? new Date(event.end_at) : null;
  if (Number.isNaN(start.valueOf())) return 'No start time';

  if (end && !Number.isNaN(end.valueOf()) && start <= now && end >= now) {
    return `Live now, ends in ${durationParts(end.getTime() - now.getTime())}`;
  }

  if (start > now) return `Starts in ${durationParts(start.getTime() - now.getTime())}`;

  if (end && !Number.isNaN(end.valueOf()) && end < now) {
    return `Ended ${durationParts(now.getTime() - end.getTime())} ago`;
  }

  return `Started ${durationParts(now.getTime() - start.getTime())} ago`;
}

export function eventDescription(raw: Json | null | undefined) {
  return firstText(
    raw?.description,
    raw?.description_md,
    raw?.description_plain,
    raw?.summary,
    nested(raw, 'event.description'),
    nested(raw, 'event.description_md')
  );
}

export function eventLocation(raw: Json | null | undefined) {
  const location = firstText(
    raw?.location,
    raw?.geo_address,
    raw?.meeting_url,
    nested(raw, 'venue.name'),
    nested(raw, 'venue.address'),
    nested(raw, 'geo_address_json.full_address'),
    nested(raw, 'geo_address_json.address'),
    nested(raw, 'location.name'),
    nested(raw, 'location.address'),
    nested(raw, 'event.location')
  );
  return location;
}

export function eventHosts(raw: Json | null | undefined) {
  const candidates = [
    raw?.hosts,
    raw?.managers,
    raw?.team_members,
    nested(raw, 'calendar.hosts'),
    nested(raw, 'event.hosts')
  ];
  for (const candidate of candidates) {
    const values = arrayText(candidate);
    if (values.length) return values;
  }
  return [];
}

export function eventCapacity(raw: Json | null | undefined) {
  return firstText(raw?.max_capacity, raw?.capacity, nested(raw, 'ticket.max_capacity'));
}

export function eventVisibility(raw: Json | null | undefined, status?: string | null) {
  return firstText(raw?.visibility, raw?.calendar_submission_status, raw?.status, status);
}

export function rawFieldNames(raw: Json | null | undefined) {
  return Object.keys(raw ?? {})
    .filter((key) => key !== '_luma')
    .sort((a, b) => a.localeCompare(b));
}

export function rawJsonPreview(raw: Json | null | undefined) {
  if (!raw) return '{}';
  return JSON.stringify(raw, null, 2);
}
