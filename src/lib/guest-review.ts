export type AttendanceLike = {
  approval_status: string | null;
  checked_in_at: string | null;
  status_internal?: string | null;
};

export type EventHistory = AttendanceLike & {
  event_name: string;
  event_url: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  registered_at: string | null;
  ticket_name: string | null;
};

export type AnswerColumn = {
  question_key: string | null;
  question: string;
  question_type: string | null;
};

export type RegistrationAnswer = AnswerColumn & {
  answer: string | null;
  raw_json?: unknown;
};

type JsonObject = Record<string, unknown>;

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function objectValue(source: unknown, keys: string[]) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const object = source as JsonObject;
  for (const key of keys) {
    const direct = text(object[key]);
    if (direct) return direct;

    const nested = object[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedText = text((nested as JsonObject).name ?? (nested as JsonObject).title);
      if (nestedText) return nestedText;
    }
  }
  return null;
}

function linkedinUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return null;
  if (/^https?:\/\/(?:www\.)?linkedin\.com\//i.test(trimmed)) return trimmed;
  if (/^(?:www\.)?linkedin\.com\//i.test(trimmed)) return `https://${trimmed}`;
  if (/^\/in\//i.test(trimmed)) return `https://www.linkedin.com${trimmed}`;
  if (/^in\//i.test(trimmed)) return `https://www.linkedin.com/${trimmed}`;
  return null;
}

function githubUsername(value: string) {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/github\.com\/([A-Za-z0-9-]+)/i);
  if (urlMatch?.[1]) return urlMatch[1].replace(/\.git$/, '');
  if (/^[A-Za-z0-9-]{1,39}$/.test(trimmed)) return trimmed;
  return null;
}

function displayTextFromParsed(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.map(displayTextFromParsed).filter(Boolean).join(', ') || null;
  }

  if (!value || typeof value !== 'object') return text(value);

  const company = objectValue(value, ['company', 'company_name', 'organization', 'employer']);
  const title = objectValue(value, ['job_title', 'title', 'role', 'position', 'headline']);
  if (company && title) return `${title} at ${company}`;
  if (title) return title;
  if (company) return company;

  const object = value as JsonObject;
  return (
    text(object.answer) ??
    text(object.value) ??
    text(object.label) ??
    text(object.text) ??
    text(object.name)
  );
}

function rawAnswerValue(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as JsonObject;
  const raw = object.answer ?? object.value ?? object.response;

  if (typeof raw === 'string') {
    return parseJson(raw) ?? raw;
  }

  return raw ?? null;
}

export function humanStatus(value: string | null | undefined) {
  return value ? value.replaceAll('_', ' ') : 'unknown';
}

export function isGoingStatus(value: string | null | undefined) {
  return ['approved', 'going', 'confirmed'].includes((value ?? '').toLowerCase());
}

export function currentAttendanceLabel(guest: AttendanceLike) {
  if (guest.checked_in_at) return 'checked in';
  if (isGoingStatus(guest.approval_status)) return 'going';
  return guest.approval_status ? humanStatus(guest.approval_status) : null;
}

export function historyAttendanceLabel(history: EventHistory) {
  if (history.checked_in_at) return 'went';
  if (isGoingStatus(history.approval_status)) return 'going';
  return humanStatus(history.approval_status ?? history.status_internal);
}

export function attendanceVariant(label: string | null) {
  if (label === 'checked in' || label === 'went') return 'secondary';
  if (label === 'going') return 'default';
  if (label === 'declined' || label === 'rejected') return 'destructive';
  return 'outline';
}

export function attendanceMarker(label: string | null | undefined) {
  const normalized = (label ?? '').toLowerCase();

  if (normalized === 'checked in' || normalized === 'went') {
    return {
      tone: 'checked_in',
      shape: 'square',
      shortLabel: normalized === 'checked in' ? 'in' : 'went'
    } as const;
  }

  if (normalized === 'going') {
    return { tone: 'going', shape: 'circle', shortLabel: 'going' } as const;
  }

  if (normalized.includes('waitlist') || normalized.includes('pool')) {
    return { tone: 'waitlist', shape: 'diamond', shortLabel: 'wait' } as const;
  }

  if (normalized.includes('declined') || normalized.includes('rejected')) {
    return { tone: 'rejected', shape: 'square', shortLabel: 'no' } as const;
  }

  if (normalized.includes('invited')) {
    return { tone: 'invited', shape: 'outline', shortLabel: 'invited' } as const;
  }

  if (normalized.includes('pending')) {
    return { tone: 'pending', shape: 'outline', shortLabel: 'pending' } as const;
  }

  return { tone: 'unknown', shape: 'outline', shortLabel: normalized || 'unknown' } as const;
}

export function questionTypeLabel(value: string | null) {
  return value ? humanStatus(value) : 'answer';
}

export function answerFor(answers: RegistrationAnswer[], column: AnswerColumn) {
  if (column.question_key) {
    const keyed = answers.find((answer) => answer.question_key === column.question_key);
    if (keyed) return keyed;

    return answers.find((answer) => !answer.question_key && answer.question === column.question);
  }

  return answers.find((answer) => answer.question === column.question);
}

export function displayAnswer(answer: RegistrationAnswer | undefined | null, column: AnswerColumn) {
  const raw = answer?.answer?.trim() ?? '';
  const parsed = parseJson(raw);
  const type = (column.question_type ?? answer?.question_type ?? '').toLowerCase();
  const question = column.question.toLowerCase();
  const rawStructuredValue = rawAnswerValue(answer?.raw_json);
  const value = rawStructuredValue ?? parsed ?? raw;
  const fallback = displayTextFromParsed(value) ?? raw;

  if (!raw && !parsed && !rawStructuredValue) {
    return { primary: 'No answer', secondary: null, href: null, kind: 'empty' as const };
  }

  if (type.includes('company') || question.includes('company') || question.includes('job title')) {
    const company = objectValue(value, ['company', 'company_name', 'organization', 'employer']);
    const title = objectValue(value, ['job_title', 'title', 'role', 'position', 'headline']);

    if (company || title) {
      return {
        primary: company ?? title ?? 'No answer',
        secondary: company && title && title !== company ? title : null,
        href: null,
        kind: 'company' as const
      };
    }
  }

  if (type.includes('linkedin') || question.includes('linkedin')) {
    const url = linkedinUrl(fallback);
    return {
      primary: fallback.replace(/^https?:\/\/(?:www\.)?linkedin\.com/i, ''),
      secondary: null,
      href: url,
      kind: 'link' as const
    };
  }

  if (type.includes('github') || question.includes('github')) {
    const username = githubUsername(fallback);
    return {
      primary: username ?? fallback,
      secondary: null,
      href: username ? `https://github.com/${username}` : null,
      kind: 'link' as const
    };
  }

  return {
    primary: fallback || 'No answer',
    secondary: null,
    href: null,
    kind: fallback ? ('text' as const) : ('empty' as const)
  };
}
