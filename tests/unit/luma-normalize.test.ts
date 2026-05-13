import { describe, expect, test } from 'bun:test';
import {
  normalizeAnswers,
  normalizeCalendar,
  normalizeCalendarPeople,
  normalizeEvent,
  normalizeGuest
} from '../../src/lib/server/luma-normalize';

describe('Luma normalization', () => {
  test('normalizes event identity, dates, and nested cover image', () => {
    const event = normalizeEvent({
      event: {
        event_api_id: 'evt_123',
        title: 'Agent Night',
        event_url: 'https://lu.ma/agent-night',
        images: {
          cover: {
            url: 'https://images.example/cover.png'
          }
        },
        startAt: '2026-05-14T18:00:00.000Z',
        endAt: '2026-05-14T20:00:00.000Z',
        tz: 'Europe/London',
        visibility: 'public'
      }
    });

    expect(event).toMatchObject({
      lumaEventId: 'evt_123',
      name: 'Agent Night',
      url: 'https://lu.ma/agent-night',
      coverUrl: 'https://images.example/cover.png',
      startAt: '2026-05-14T18:00:00.000Z',
      endAt: '2026-05-14T20:00:00.000Z',
      timezone: 'Europe/London',
      status: 'public'
    });
  });

  test('returns null for events without an id', () => {
    expect(normalizeEvent({ name: 'No ID' })).toBeNull();
  });

  test('normalizes calendar metadata and image fallback', () => {
    const calendar = normalizeCalendar({
      calendar: {
        calendar_id: 'cal_123',
        title: 'Build Club',
        handle: 'build-club',
        calendar_url: 'https://lu.ma/build-club',
        logo: {
          url: 'https://images.example/logo.png'
        },
        timezone: 'Europe/London'
      }
    });

    expect(calendar).toMatchObject({
      lumaCalendarId: 'cal_123',
      name: 'Build Club',
      slug: 'build-club',
      url: 'https://lu.ma/build-club',
      avatarUrl: 'https://images.example/logo.png',
      timezone: 'Europe/London'
    });
  });

  test('deduplicates calendar people and preserves admin role over reviewer', () => {
    const people = normalizeCalendarPeople({
      admins: [{ email: 'ALEX@example.com', name: 'Alex Admin', role: 'owner' }],
      hosts: [
        { email: 'alex@example.com', name: 'Alex Host', role: 'host' },
        { user: { email: 'sam@example.com', name: 'Sam Host', avatar_url: 'https://img/sam.png' } }
      ]
    });

    expect(people).toHaveLength(2);
    expect(people.find((person) => person.email === 'alex@example.com')).toMatchObject({
      name: 'Alex Admin',
      appRole: 'admin'
    });
    expect(people.find((person) => person.email === 'sam@example.com')).toMatchObject({
      name: 'Sam Host',
      appRole: 'reviewer',
      avatarUrl: 'https://img/sam.png'
    });
  });

  test('normalizes answer shapes and readable object/array values', () => {
    const answers = normalizeAnswers({
      registration_answers: [
        {
          id: 'q1',
          question: 'GitHub',
          answer: 'https://github.com/example'
        },
        {
          key: 'q2',
          label: 'Interests',
          value: [{ label: 'Agents' }, { value: 'Dev tools' }]
        },
        {
          question_id: 'q3',
          registration_question: { title: 'Company' },
          response: { name: 'Example Inc' }
        },
        {
          question_id: 'q4',
          registration_question: { title: 'Native company' },
          answer: '{"company":null,"job_title":"Designer"}'
        }
      ]
    });

    expect(answers).toEqual([
      {
        questionKey: 'q1',
        question: 'GitHub',
        answer: 'https://github.com/example',
        raw: expect.any(Object)
      },
      {
        questionKey: 'q2',
        question: 'Interests',
        answer: 'Agents, Dev tools',
        raw: expect.any(Object)
      },
      {
        questionKey: 'q3',
        question: 'Company',
        answer: 'Example Inc',
        raw: expect.any(Object)
      },
      {
        questionKey: 'q4',
        question: 'Native company',
        answer: 'Designer',
        raw: expect.any(Object)
      }
    ]);
  });

  test('normalizes guest identity, status, ticket, and nested user data', () => {
    const guest = normalizeGuest({
      guest: {
        guest_api_id: 'gst_123',
        user: {
          id: 'usr_123',
          email: 'PERSON@example.com',
          name: 'Person One'
        },
        approval_status: 'approved',
        checked_in_at: '2026-05-14T18:05:00.000Z',
        createdAt: '2026-05-10T10:00:00.000Z',
        ticket: {
          name: 'Builder'
        },
        answers: [{ question: 'LinkedIn', answer: 'https://linkedin.com/in/person' }]
      }
    });

    expect(guest).toMatchObject({
      lumaGuestId: 'gst_123',
      lumaUserId: 'usr_123',
      name: 'Person One',
      email: 'PERSON@example.com',
      approvalStatus: 'approved',
      checkedInAt: '2026-05-14T18:05:00.000Z',
      registeredAt: '2026-05-10T10:00:00.000Z',
      ticketName: 'Builder'
    });
    expect(guest?.answers).toHaveLength(1);
  });

  test('skips guests without id or email', () => {
    expect(normalizeGuest({ guest: { id: 'gst_123' } })).toBeNull();
    expect(normalizeGuest({ guest: { email: 'person@example.com' } })).toBeNull();
  });
});
