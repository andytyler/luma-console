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
    coverUrl: firstText(event.cover_url, nested(event, 'cover.url')),
    startAt: firstText(event.start_at, event.startAt),
    endAt: firstText(event.end_at, event.endAt),
    timezone: firstText(event.timezone, event.tz),
    status: firstText(event.status, event.visibility),
    raw: event
  };
}

function answerText(answer: unknown): string {
  if (answer === null || answer === undefined) return '';
  if (Array.isArray(answer)) return answer.map(answerText).filter(Boolean).join(', ');
  if (typeof answer === 'object') {
    const object = answer as Json;
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
