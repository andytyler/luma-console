import { describe, expect, test } from 'bun:test';
import { fetchGithubProfile } from '../../src/lib/server/github';
import { mockFetch, resetTestEnv } from '../setup';

describe('GitHub enrichment client', () => {
  test('requires a token before any network request', async () => {
    resetTestEnv({ GITHUB_TOKEN: '' });

    await expect(fetchGithubProfile('octocat')).rejects.toThrow('GITHUB_TOKEN is not configured.');
  });

  test('fetches and normalizes a GitHub profile through a mocked GraphQL call', async () => {
    resetTestEnv({ GITHUB_TOKEN: 'github_test_token' });
    const mocked = mockFetch(async () =>
      Response.json({
        data: {
          user: {
            login: 'octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
            url: 'https://github.com/octocat',
            followers: { totalCount: 10 },
            repositories: {
              totalCount: 8,
              nodes: [
                {
                  name: 'hello-world',
                  nameWithOwner: 'octocat/hello-world',
                  url: 'https://github.com/octocat/hello-world',
                  description: 'A test repo',
                  stargazerCount: 15,
                  forkCount: 2,
                  primaryLanguage: { name: 'TypeScript', color: '#3178c6' }
                },
                {
                  name: 'tools',
                  nameWithOwner: 'octocat/tools',
                  url: 'https://github.com/octocat/tools',
                  description: null,
                  stargazerCount: 4,
                  forkCount: 1,
                  primaryLanguage: null
                }
              ]
            },
            contributionsCollection: {
              contributionCalendar: {
                totalContributions: 123,
                weeks: [
                  {
                    contributionDays: [
                      { date: '2026-05-11', weekday: 1, contributionCount: 0, color: '#ebedf0' },
                      { date: '2026-05-12', weekday: 2, contributionCount: 3, color: '#40c463' },
                      { date: '2026-05-13', weekday: 3, contributionCount: 2, color: '#40c463' }
                    ]
                  }
                ]
              }
            }
          }
        }
      })
    );

    const profile = await fetchGithubProfile('octocat');

    expect(profile).toMatchObject({
      username: 'octocat',
      profileUrl: 'https://github.com/octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
      contributionTotal: 123,
      followers: 10,
      publicRepos: 8,
      totalStars: 19,
      currentStreak: 2
    });
    expect(profile.topRepositories).toEqual([
      {
        name: 'octocat/hello-world',
        url: 'https://github.com/octocat/hello-world',
        description: 'A test repo',
        stars: 15,
        forks: 2,
        language: 'TypeScript',
        languageColor: '#3178c6'
      },
      {
        name: 'octocat/tools',
        url: 'https://github.com/octocat/tools',
        description: null,
        stars: 4,
        forks: 1,
        language: null,
        languageColor: null
      }
    ]);
    expect(profile.weeks).toHaveLength(1);
    expect(mocked.calls).toHaveLength(1);
    expect(mocked.calls[0].url.href).toBe('https://api.github.com/graphql');
    expect(mocked.calls[0].method).toBe('POST');
    expect(new Headers(mocked.calls[0].init?.headers).get('authorization')).toBe(
      'Bearer github_test_token'
    );
    expect(String(mocked.calls[0].init?.body)).toContain('ContributionCalendar');
    mocked.restore();
  });

  test('surfaces GraphQL errors without live GitHub access', async () => {
    resetTestEnv({ GITHUB_TOKEN: 'github_test_token' });
    const mocked = mockFetch(async () =>
      Response.json({
        errors: [{ message: 'rate limited' }]
      })
    );

    await expect(fetchGithubProfile('octocat')).rejects.toThrow('GitHub profile lookup failed for octocat.');
    expect(mocked.calls).toHaveLength(1);
    mocked.restore();
  });
});
