const GITHUB_API_VERSION = '2022-11-28';

export type GitHubReleaseAsset = {
  name?: string;
  url?: string;
  browser_download_url?: string;
  content_type?: string;
  size?: number;
};

export type GitHubRelease = {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  published_at?: string | null;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubReleaseAsset[];
};

type ParsedRepo = {
  owner: string;
  repo: string;
};

export function parseRepoUrl(repoUrl: string | null): ParsedRepo | null {
  if (!repoUrl) return null;

  const parsed = new URL(repoUrl);
  const [owner, rawRepo] = parsed.pathname.split('/').filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, '');

  if (!owner || !repo) return null;

  return { owner, repo };
}

export function getGitHubHeaders(
  accept = 'application/vnd.github+json',
): Record<string, string> {
  return {
    Accept: accept,
    'Cache-Control': 'no-cache',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

export function getGitHubApiUrl(repo: ParsedRepo, path: string): string {
  const owner = encodeURIComponent(repo.owner);
  const repoName = encodeURIComponent(repo.repo);

  return `https://api.github.com/repos/${owner}/${repoName}${path}`;
}

export async function fetchGitHubJson<T>(
  url: string,
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number }> {
  const response = await fetch(url, { headers: getGitHubHeaders() });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  return {
    ok: true,
    status: response.status,
    data: await response.json() as T,
  };
}
