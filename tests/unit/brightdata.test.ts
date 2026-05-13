import { describe, expect, test } from 'bun:test';
import {
  fetchBrightDataLinkedinProfile,
  normalizeLinkedinProfileUrl
} from '../../src/lib/server/brightdata';
import { mockFetch, resetTestEnv } from '../setup';

describe('BrightData LinkedIn client', () => {
  test('normalizes native Luma LinkedIn profile answers', () => {
    expect(normalizeLinkedinProfileUrl('/in/person')).toBe('https://www.linkedin.com/in/person');
    expect(normalizeLinkedinProfileUrl('in/person')).toBe('https://www.linkedin.com/in/person');
    expect(normalizeLinkedinProfileUrl('linkedin.com/in/person')).toBe('https://linkedin.com/in/person');
    expect(normalizeLinkedinProfileUrl('N/A')).toBeNull();
  });

  test('requires an API key before any network request', async () => {
    resetTestEnv({ BRIGHTDATA_API_KEY: '' });

    await expect(fetchBrightDataLinkedinProfile('https://linkedin.com/in/person')).rejects.toThrow(
      'BRIGHTDATA_API_KEY is not configured.'
    );
  });

  test('posts to BrightData through a mocked dataset request', async () => {
    resetTestEnv({
      BRIGHTDATA_API_KEY: 'brightdata_test_key',
      BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID: 'dataset_test'
    });
    const mocked = mockFetch(async () =>
      Response.json([
        {
          name: 'Person One',
          position: 'AI Engineer',
          current_company: {
            name: 'Example',
            domain: 'example.com'
          }
        }
      ])
    );

    const profile = await fetchBrightDataLinkedinProfile('https://linkedin.com/in/person');

    expect(profile).toMatchObject({
      name: 'Person One',
      position: 'AI Engineer',
      current_company: {
        name: 'Example',
        domain: 'example.com'
      }
    });
    expect(mocked.calls).toHaveLength(1);
    expect(mocked.calls[0].url.href).toBe(
      'https://api.brightdata.com/datasets/v3/scrape?dataset_id=dataset_test&format=json'
    );
    expect(mocked.calls[0].method).toBe('POST');
    expect(new Headers(mocked.calls[0].init?.headers).get('authorization')).toBe(
      'Bearer brightdata_test_key'
    );
    expect(mocked.calls[0].init?.body).toBe(
      JSON.stringify({ input: [{ url: 'https://linkedin.com/in/person' }] })
    );
    mocked.restore();
  });

  test('surfaces BrightData HTTP failures without live access', async () => {
    resetTestEnv({ BRIGHTDATA_API_KEY: 'brightdata_test_key' });
    const mocked = mockFetch(async () =>
      Response.json({ error: 'rate limited' }, { status: 429 })
    );

    await expect(fetchBrightDataLinkedinProfile('https://linkedin.com/in/person')).rejects.toThrow(
      'BrightData LinkedIn scrape failed for https://linkedin.com/in/person.'
    );
    expect(mocked.calls).toHaveLength(1);
    mocked.restore();
  });
});
