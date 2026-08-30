import { describe, expect, it } from 'vitest';

import { parseRepoUrl, getGitHubHeaders, getGitHubApiUrl } from './githubReleaseClient';

describe('parseRepoUrl', () => {
    it('parses a valid GitHub URL', () => {
        expect(parseRepoUrl('https://github.com/owner/repo')).toEqual({
            owner: 'owner',
            repo: 'repo',
        });
    });

    it('strips .git suffix', () => {
        expect(parseRepoUrl('https://github.com/owner/repo.git')).toEqual({
            owner: 'owner',
            repo: 'repo',
        });
    });

    it('returns null for null input', () => {
        expect(parseRepoUrl(null)).toBeNull();
    });

    it('returns null for URL without owner/repo', () => {
        expect(parseRepoUrl('https://github.com/')).toBeNull();
    });

    it('returns null for URL with only owner', () => {
        expect(parseRepoUrl('https://github.com/owner')).toBeNull();
    });
});

describe('getGitHubHeaders', () => {
    it('includes Accept and Cache-Control headers', () => {
        const headers = getGitHubHeaders();
        expect(headers.Accept).toBe('application/vnd.github+json');
        expect(headers['Cache-Control']).toBe('no-cache');
        expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    });

    it('omits Authorization header (release fetches are unauthenticated)', () => {
        const headers = getGitHubHeaders();
        expect(headers.Authorization).toBeUndefined();
    });

    it('allows custom Accept header', () => {
        const headers = getGitHubHeaders('text/plain');
        expect(headers.Accept).toBe('text/plain');
    });
});

describe('getGitHubApiUrl', () => {
    it('builds correct API URL', () => {
        expect(
            getGitHubApiUrl({ owner: 'user', repo: 'my-app' }, '/releases/latest'),
        ).toBe('https://api.github.com/repos/user/my-app/releases/latest');
    });

    it('encodes special characters in owner and repo', () => {
        expect(
            getGitHubApiUrl({ owner: 'us er', repo: 'my app' }, '/releases'),
        ).toBe('https://api.github.com/repos/us%20er/my%20app/releases');
    });
});
