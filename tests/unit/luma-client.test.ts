import { describe, expect, test } from 'bun:test';
import { getEventGuest, listCalendarEvents, listEventGuests } from '../../src/lib/server/luma';
import { mockFetch, resetTestEnv } from '../setup';

function nestedGuestId(value: Record<string, unknown>) {
  const guest = value.guest as Record<string, unknown> | undefined;
  return String(guest?.id ?? value.id);
}

function nestedEventId(value: Record<string, unknown>) {
  const event = value.event as Record<string, unknown> | undefined;
  return String(event?.id ?? value.id);
}

describe('Luma read client', () => {
  test('lists approved and pending calendar events through mocked GET requests', async () => {
    resetTestEnv({ LUMA_API_KEY: 'test_luma_key' });
    const mocked = mockFetch(async (input) => {
      const url = new URL(String(input));
      const status = url.searchParams.get('status');

      return Response.json({
        entries: [
          {
            event: {
              id: status === 'approved' ? 'evt_approved' : 'evt_pending',
              name: status === 'approved' ? 'Approved Event' : 'Pending Event'
            }
          }
        ],
        has_more: false
      });
    });

    const events = await listCalendarEvents();

    expect(events).toHaveLength(2);
    expect(events.map(nestedEventId).sort()).toEqual(['evt_approved', 'evt_pending']);
    expect(mocked.calls).toHaveLength(2);
    expect(mocked.calls.every((call) => call.method === 'GET')).toBe(true);
    expect(mocked.calls.map((call) => call.url.searchParams.get('status')).sort()).toEqual([
      'approved',
      'pending'
    ]);
    mocked.restore();
  });

  test('deduplicates events returned by multiple Luma statuses', async () => {
    resetTestEnv({ LUMA_API_KEY: 'test_luma_key' });
    const mocked = mockFetch(async (input) => {
      const url = new URL(String(input));
      return Response.json({
        entries: [
          {
            event: {
              id: 'evt_same',
              name: `${url.searchParams.get('status')} copy`
            }
          }
        ],
        has_more: false
      });
    });

    const events = await listCalendarEvents();

    expect(events).toHaveLength(1);
    expect(nestedEventId(events[0] ?? {})).toBe('evt_same');
    mocked.restore();
  });

  test('paginates event guests with cursors through mocked GET requests', async () => {
    resetTestEnv({ LUMA_API_KEY: 'test_luma_key' });
    const mocked = mockFetch(async (input) => {
      const url = new URL(String(input));
      const cursor = url.searchParams.get('pagination_cursor');

      if (!cursor) {
        return Response.json({
          entries: [{ guest: { id: 'gst_1', email: 'one@example.com' } }],
          has_more: true,
          next_cursor: 'cursor_2'
        });
      }

      return Response.json({
        entries: [{ guest: { id: 'gst_2', email: 'two@example.com' } }],
        has_more: false
      });
    });

    const guests = await listEventGuests('evt_123');

    expect(guests).toHaveLength(2);
    expect(guests.map(nestedGuestId)).toEqual(['gst_1', 'gst_2']);
    expect(mocked.calls).toHaveLength(2);
    expect(mocked.calls[0].url.searchParams.get('event_id')).toBe('evt_123');
    expect(mocked.calls[1].url.searchParams.get('pagination_cursor')).toBe('cursor_2');
    mocked.restore();
  });

  test('gets one event guest with a per-calendar API key', async () => {
    const mocked = mockFetch(async () =>
      Response.json({
        guest: {
          id: 'gst_123',
          email: 'person@example.com'
        }
      })
    );

    const guest = await getEventGuest('evt_123', 'gst_123', { apiKey: 'calendar_key' });

    expect(guest).toEqual({
      guest: {
        id: 'gst_123',
        email: 'person@example.com'
      }
    });
    expect(mocked.calls).toHaveLength(1);
    expect(mocked.calls[0].url.searchParams.get('event_id')).toBe('evt_123');
    expect(mocked.calls[0].url.searchParams.get('id')).toBe('gst_123');
    expect(new Headers(mocked.calls[0].init?.headers).get('x-luma-api-key')).toBe('calendar_key');
    mocked.restore();
  });
});
