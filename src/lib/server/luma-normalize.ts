type Json = Record<string, unknown>;

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return null;
}

function nested(source: Json, path: string) {
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Json)[part];
  }
  return current;
}

function url(value: unknown) {
  const result = text(value);
  return result && /^https?:\/\//.test(result) ? result : null;
}

function firstUrl(...values: unknown[]) {
  for (const value of values) {
    const result = url(value);
    if (result) return result;
  }
  return null;
}

function findCoverUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findCoverUrl(item);
      if (result) return result;
    }
    return null;
  }

  const object = value as Json;
  for (const [key, child] of Object.entries(object)) {
    const lowerKey = key.toLowerCase();
    const isImageKey =
      lowerKey.includes('cover') ||
      lowerKey.includes('image') ||
      lowerKey.includes('thumbnail') ||
      lowerKey.includes('photo');

    if (isImageKey) {
      const direct = firstUrl(
        child,
        nested(child as Json, 'url'),
        nested(child as Json, 'image.url'),
        nested(child as Json, 'original.url')
      );
      if (direct) return direct;

      const nestedResult = findCoverUrl(child);
      if (nestedResult) return nestedResult;
    }
  }

  return null;
}

export function normalizeEvent(raw: Json) {
  const event = ((raw.event as Json | undefined) ?? (raw.data as Json | undefined) ?? raw) as Json;
  const id = firstText(
    event.id,
    event.event_id,
    event.api_id,
    event.event_api_id,
    nested(event, 'api.id')
  );

  if (!id) return null;

  return {
    lumaEventId: id,
    apiId: firstText(event.api_id, event.event_api_id),
    name: firstText(event.name, event.title) ?? 'Untitled event',
    url: firstText(event.url, event.event_url, event.luma_url),
    coverUrl:
      firstUrl(
        event.cover_url,
        event.coverUrl,
        event.social_image_url,
        event.thumbnail_url,
        nested(event, 'cover.url'),
        nested(event, 'cover.image.url'),
        nested(event, 'image.url'),
        nested(event, 'images.cover.url'),
        nested(event, 'calendar.cover_url')
      ) ?? findCoverUrl(event),
    startAt: firstText(event.start_at, event.startAt),
    endAt: firstText(event.end_at, event.endAt),
    timezone: firstText(event.timezone, event.tz),
    status: firstText(event.status, event.visibility),
    raw: event
  };
}

export function normalizeCalendar(raw: Json) {
  const calendar = ((raw.calendar as Json | undefined) ?? (raw.data as Json | undefined) ?? raw) as Json;
  const id = firstText(
    calendar.id,
    calendar.calendar_id,
    calendar.api_id,
    calendar.calendar_api_id,
    nested(calendar, 'calendar.id')
  );

  return {
    lumaCalendarId: id,
    name: firstText(calendar.name, calendar.title, nested(calendar, 'calendar.name')) ?? 'Luma Calendar',
    slug: firstText(calendar.slug, calendar.handle, calendar.url_slug),
    url: firstUrl(calendar.url, calendar.calendar_url, calendar.website, calendar.luma_url),
    avatarUrl:
      firstUrl(
        calendar.avatar_url,
        calendar.logo_url,
        calendar.icon_url,
        calendar.image_url,
        nested(calendar, 'avatar.url'),
        nested(calendar, 'logo.url'),
        nested(calendar, 'image.url')
      ) ?? findCoverUrl(calendar),
    timezone: firstText(calendar.timezone, calendar.tz),
    raw: calendar
  };
}

function roleFromKey(key: string) {
  const lower = key.toLowerCase();
  if (lower.includes('owner') || lower.includes('admin') || lower.includes('manager')) return 'admin';
  return 'reviewer';
}

function calendarPeopleFromValue(value: unknown, source: string, appRole: 'admin' | 'reviewer') {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const person = typeof entry === 'object' && entry !== null ? (entry as Json) : {};
      const email = firstText(
        person.email,
        nested(person, 'user.email'),
        nested(person, 'person.email'),
        nested(person, 'profile.email')
      );
      if (!email) return null;

      return {
        email: email.toLowerCase(),
        name: firstText(person.name, nested(person, 'user.name'), nested(person, 'person.name')),
        lumaRole: firstText(person.role, person.permission, person.type, source),
        appRole,
        avatarUrl: firstUrl(
          person.avatar_url,
          person.image_url,
          nested(person, 'user.avatar_url'),
          nested(person, 'profile.avatar_url')
        ),
        source,
        raw: person
      };
    })
    .filter(Boolean) as Array<{
    email: string;
    name: string | null;
    lumaRole: string | null;
    appRole: 'admin' | 'reviewer';
    avatarUrl: string | null;
    source: string;
    raw: Json;
  }>;
}

export function normalizeCalendarPeople(raw: Json) {
  const calendar = ((raw.calendar as Json | undefined) ?? (raw.data as Json | undefined) ?? raw) as Json;
  const candidates = [
    ['admins', calendar.admins],
    ['admin_users', calendar.admin_users],
    ['managers', calendar.managers],
    ['members', calendar.members],
    ['team_members', calendar.team_members],
    ['hosts', calendar.hosts],
    ['calendar.admins', nested(calendar, 'calendar.admins')],
    ['calendar.members', nested(calendar, 'calendar.members')]
  ] as const;

  const byEmail = new Map<string, ReturnType<typeof calendarPeopleFromValue>[number]>();
  for (const [source, value] of candidates) {
    const appRole = roleFromKey(source);
    for (const person of calendarPeopleFromValue(value, source, appRole)) {
      const previous = byEmail.get(person.email);
      if (!previous || previous.appRole !== 'admin') {
        byEmail.set(person.email, person);
      }
    }
  }

  return [...byEmail.values()];
}

function answerText(answer: unknown): string {
  if (answer === null || answer === undefined) return '';
  if (Array.isArray(answer)) return answer.map(answerText).filter(Boolean).join(', ');
  if (typeof answer === 'string') {
    const trimmed = answer.trim();
    if (/^[{[]/.test(trimmed)) {
      try {
        return answerText(JSON.parse(trimmed));
      } catch {
        return answer;
      }
    }
    return answer;
  }
  if (typeof answer === 'object') {
    const object = answer as Json;
    const company = firstText(
      typeof object.company === 'object' && object.company !== null
        ? (object.company as Json).name
        : object.company,
      object.company_name,
      object.organization,
      object.employer
    );
    const title = firstText(object.job_title, object.title, object.role, object.position, object.headline);
    if (company && title) return `${title} at ${company}`;
    if (title) return title;
    if (company) return company;
    return (
      firstText(object.answer, object.value, object.label, object.text, object.name) ??
      JSON.stringify(answer)
    );
  }
  return String(answer);
}

export function normalizeAnswers(rawGuest: Json) {
  const possible = [
    rawGuest.registration_answers,
    rawGuest.registrationAnswers,
    rawGuest.answers,
    nested(rawGuest, 'registration.answers'),
    nested(rawGuest, 'form.answers'),
    nested(rawGuest, 'guest.registration_answers')
  ];

  const answers = possible.find(Array.isArray) as Json[] | undefined;
  if (!answers) return [];

  return answers
    .map((answer) => ({
      questionKey: firstText(answer.id, answer.key, answer.question_id, answer.question_key),
      question:
        firstText(answer.question, answer.label, answer.title, nested(answer, 'registration_question.title')) ??
        'Question',
      answer: answerText(answer.answer ?? answer.value ?? answer.response),
      raw: answer
    }))
    .filter((answer) => answer.question || answer.answer);
}

export function normalizeGuest(raw: Json) {
  const guest = ((raw.guest as Json | undefined) ?? (raw.data as Json | undefined) ?? raw) as Json;
  const user = ((guest.user as Json | undefined) ?? {}) as Json;
  const ticket = ((guest.ticket as Json | undefined) ??
    (Array.isArray(guest.tickets) ? (guest.tickets[0] as Json | undefined) : undefined) ??
    {}) as Json;

  const id = firstText(
    guest.id,
    guest.guest_id,
    guest.api_id,
    guest.guest_api_id,
    guest.guest_key,
    raw.id
  );
  const email = firstText(guest.email, user.email, raw.email);

  if (!id || !email) return null;

  return {
    lumaGuestId: id,
    lumaUserId: firstText(guest.user_id, user.id, user.api_id),
    name: firstText(guest.name, user.name, raw.name),
    email,
    approvalStatus: firstText(guest.approval_status, guest.status, raw.approval_status, raw.status),
    checkedInAt: firstText(guest.checked_in_at, guest.checkedInAt),
    registeredAt: firstText(guest.registered_at, guest.created_at, guest.createdAt),
    ticketName: firstText(guest.ticket_name, ticket.name, nested(ticket, 'ticket_type.name')),
    answers: normalizeAnswers(guest),
    raw: guest
  };
}
