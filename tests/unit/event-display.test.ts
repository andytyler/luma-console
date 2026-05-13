import { describe, expect, test } from 'bun:test';
import {
  eventCapacity,
  eventDescription,
  eventHosts,
  eventLocation,
  eventVisibility,
  isLiveEvent,
  isPastEvent,
  rawFieldNames,
  relativeEventTime
} from '../../src/lib/event-display';

const now = new Date('2026-05-13T12:00:00.000Z');

describe('event display helpers', () => {
  test('detects live, past, and future events', () => {
    expect(
      isLiveEvent(
        {
          name: 'Live',
          start_at: '2026-05-13T11:00:00.000Z',
          end_at: '2026-05-13T13:00:00.000Z'
        },
        now
      )
    ).toBe(true);

    expect(
      isPastEvent(
        {
          name: 'Past',
          start_at: '2026-05-12T11:00:00.000Z',
          end_at: '2026-05-12T13:00:00.000Z'
        },
        now
      )
    ).toBe(true);

    expect(
      isPastEvent(
        {
          name: 'Future',
          start_at: '2026-05-14T11:00:00.000Z',
          end_at: '2026-05-14T13:00:00.000Z'
        },
        now
      )
    ).toBe(false);
  });

  test('formats relative event countdowns', () => {
    expect(
      relativeEventTime(
        {
          name: 'Future',
          start_at: '2026-05-14T14:00:00.000Z',
          end_at: '2026-05-14T16:00:00.000Z'
        },
        now
      )
    ).toBe('Starts in 1 day, 2 hours');

    expect(
      relativeEventTime(
        {
          name: 'Live',
          start_at: '2026-05-13T11:00:00.000Z',
          end_at: '2026-05-13T12:45:00.000Z'
        },
        now
      )
    ).toBe('Live now, ends in 45 minutes');

    expect(
      relativeEventTime(
        {
          name: 'Past',
          start_at: '2026-05-13T08:00:00.000Z',
          end_at: '2026-05-13T10:30:00.000Z'
        },
        now
      )
    ).toBe('Ended 1 hour, 30 minutes ago');
  });

  test('extracts event context from raw Luma payloads', () => {
    const raw = {
      description_md: 'A focused builder event.',
      venue: { name: 'Studio 12' },
      ticket: { max_capacity: 80 },
      hosts: [{ name: 'Ada' }, { email: 'host@example.com' }],
      calendar_submission_status: 'approved',
      _luma: 'hidden'
    };

    expect(eventDescription(raw)).toBe('A focused builder event.');
    expect(eventLocation(raw)).toBe('Studio 12');
    expect(eventCapacity(raw)).toBe('80');
    expect(eventHosts(raw)).toEqual(['Ada', 'host@example.com']);
    expect(eventVisibility(raw, 'fallback')).toBe('approved');
    expect(rawFieldNames(raw)).toEqual([
      'calendar_submission_status',
      'description_md',
      'hosts',
      'ticket',
      'venue'
    ]);
  });
});
