import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

describe('SQL safety checks', () => {
  test('event guest sync qualifies event id after joining calendars', () => {
    const source = readFileSync('src/lib/server/imports.ts', 'utf8');

    expect(source).toContain('left join luma_calendars on luma_calendars.id = events.calendar_id');
    expect(source).toContain('where events.id = ${eventId}');
    expect(source).not.toMatch(
      /left join luma_calendars on luma_calendars\.id = events\.calendar_id\s+where id = \$\{eventId\}/
    );
  });
});
