import { describe, expect, test } from 'bun:test';
import { adminEmails, requireEnv } from '../../src/lib/server/env';
import { decryptSecret, encryptSecret, secretHint } from '../../src/lib/server/crypto';
import { lumaGet, lumaPost, updateGuestStatus } from '../../src/lib/server/luma';
import { mockFetch, resetTestEnv } from '../setup';

describe('test safety and environment helpers', () => {
  test('blocks unstubbed external fetches by default', async () => {
    await expect(fetch('https://api.lu.ma/v1/calendar/get')).rejects.toThrow(
      'Unstubbed external fetch blocked in tests'
    );
  });

  test('reads admin emails from controlled test env', () => {
    resetTestEnv({
      ADMIN_EMAILS: 'OWNER@example.com, reviewer@example.com '
    });

    expect(adminEmails()).toEqual(['owner@example.com', 'reviewer@example.com']);
  });

  test('requireEnv throws for missing values without reading real provider keys', () => {
    resetTestEnv({ LUMA_API_KEY: '' });

    expect(() => requireEnv('LUMA_API_KEY')).toThrow('Missing required environment variable: LUMA_API_KEY');
  });

  test('encrypts, hints, and decrypts secrets with controlled local key', () => {
    resetTestEnv({ APP_ENCRYPTION_KEY: 'local-test-key-that-is-long-enough' });

    const encrypted = encryptSecret('luma_test_secret');

    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(encrypted).not.toContain('luma_test_secret');
    expect(decryptSecret(encrypted)).toBe('luma_test_secret');
    expect(secretHint('luma_test_secret')).toBe('luma...cret');
  });

  test('rejects encryption when app key is missing or too short', () => {
    resetTestEnv({ APP_ENCRYPTION_KEY: 'short' });

    expect(() => encryptSecret('secret')).toThrow(
      'The app encryption key must be a long random secret before storing Luma API keys.'
    );
  });

  test('lumaPost returns dry-run without fetch unless confirmed and app writes are enabled', async () => {
    resetTestEnv({ LUMA_API_KEY: 'test_luma_key' });

    const result = await lumaPost('/v1/event/update-guest-status', {
      event_id: 'evt_123',
      guest_id: 'gst_123',
      approval_status: 'approved'
    });

    expect(result).toEqual({
      dryRun: true,
      writesEnabled: false,
      path: '/v1/event/update-guest-status',
      body: {
        event_id: 'evt_123',
        guest_id: 'gst_123',
        approval_status: 'approved'
      }
    });
  });

  test('updateGuestStatus dry-run never reaches Luma', async () => {
    resetTestEnv({ LUMA_API_KEY: 'test_luma_key' });

    const result = await updateGuestStatus({
      eventId: 'evt_123',
      guestId: 'gst_123',
      approvalStatus: 'declined',
      dryRun: true,
      confirmed: true
    });

    expect(result).toMatchObject({
      dryRun: true,
      writesEnabled: false,
      path: '/v1/event/update-guest-status',
      body: {
        guest: {
          type: 'api_id',
          api_id: 'gst_123'
        },
        event_id: 'evt_123',
        status: 'declined',
        should_refund: false
      }
    });
  });

  test('confirmed Luma write without app write toggle remains dry-run', async () => {
    resetTestEnv({ LUMA_API_KEY: 'test_luma_key' });

    const result = await updateGuestStatus({
      eventId: 'evt_123',
      guestId: 'gst_123',
      approvalStatus: 'approved',
      confirmed: true
    });

    expect(result).toMatchObject({
      dryRun: true,
      writesEnabled: false,
      path: '/v1/event/update-guest-status'
    });
  });

  test('confirmed Luma write with app toggle but no explicit mock is blocked by the tripwire', async () => {
    resetTestEnv({ LUMA_API_KEY: 'test_luma_key' });

    await expect(
      updateGuestStatus({
        eventId: 'evt_123',
        guestId: 'gst_123',
        approvalStatus: 'approved',
        confirmed: true,
        writesEnabled: true
      })
    ).rejects.toThrow('Unstubbed external fetch blocked in tests');
  });

  test('confirmed Luma writes are mockable and never need a live POST', async () => {
    resetTestEnv({ LUMA_API_KEY: 'test_luma_key' });
    const mocked = mockFetch(async () => Response.json({ ok: true }));

    const result = await updateGuestStatus({
      eventId: 'evt_123',
      guestId: 'gst_123',
      approvalStatus: 'approved',
      message: 'See you there',
      confirmed: true,
      writesEnabled: true
    });

    expect(result).toEqual({ ok: true });
    expect(mocked.calls).toHaveLength(1);
    expect(mocked.calls[0].url.href).toBe('https://public-api.luma.com/v1/event/update-guest-status');
    expect(mocked.calls[0].method).toBe('POST');
    expect(mocked.calls[0].init?.body).toBe(
      JSON.stringify({
        guest: {
          type: 'api_id',
          api_id: 'gst_123'
        },
        event_id: 'evt_123',
        status: 'approved',
        should_refund: false
      })
    );
    mocked.restore();
  });

  test('lumaGet uses mocked GET requests and sends the provided API key', async () => {
    const mocked = mockFetch(async () => Response.json({ name: 'Calendar' }));

    const result = await lumaGet('/v1/calendar/get', {}, { apiKey: 'per_calendar_key' });

    expect(result).toEqual({ name: 'Calendar' });
    expect(mocked.calls).toHaveLength(1);
    expect(mocked.calls[0].method).toBe('GET');
    expect(mocked.calls[0].url.href).toBe('https://public-api.luma.com/v1/calendar/get');
    expect(new Headers(mocked.calls[0].init?.headers).get('x-luma-api-key')).toBe('per_calendar_key');
    mocked.restore();
  });
});
