import { Linking, Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

import { ENV } from '../../../config/env';
import {
  getNonSensitiveValue,
  setNonSensitiveValue,
} from '../../security/services/biometricSecureStorage';
import type { AppRelease, UpdateCheckResult, UpdateDownloadProgress } from '../model/types';
import { androidApkInstaller } from './androidApkInstaller';
import {
  fetchGitHubJson,
  getGitHubApiUrl,
  getGitHubHeaders,
  parseRepoUrl,
} from './githubReleaseClient';
import type { GitHubRelease, GitHubReleaseAsset } from './githubReleaseClient';
import { compareVersions, getCurrentVersion, normalizeVersion } from './updateVersion';

const GITHUB_RELEASES_NOT_FOUND_MESSAGE = 'No public GitHub release found for this app.';
const SKIPPED_RELEASE_TAG_KEY = 'app-update-skipped-release-tag';
const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const supportsInstallActions = (): boolean => Platform.OS === 'android';

export class AppUpdateNoReleaseError extends Error {
  constructor(message = GITHUB_RELEASES_NOT_FOUND_MESSAGE) {
    super(message);
    this.name = 'AppUpdateNoReleaseError';
  }
}

function getPreferredAsset(assets: GitHubReleaseAsset[] | undefined): GitHubReleaseAsset | null {
  if (!assets?.length) return null;

  if (supportsInstallActions()) {
    const apkAsset = assets.find(asset => asset.name?.toLowerCase().endsWith('.apk'));
    if (apkAsset) return apkAsset;
  }

  return supportsInstallActions()
    ? assets.find(asset => Boolean(asset.browser_download_url)) ?? null
    : null;
}

function sanitizeAssetFileName(release: AppRelease): string {
  const defaultFileName = `purrivacy-${release.version}.apk`;
  const fileName = release.assetName || defaultFileName;
  const sanitized = fileName.replace(/[^a-z0-9._-]/gi, '-');

  return sanitized.toLowerCase().endsWith('.apk') ? sanitized : `${sanitized}.apk`;
}

function getDownloadDirectory(): Directory {
  return new Directory(Paths.cache, 'updates');
}

function getDownloadHeaders(release: AppRelease): Record<string, string> {
  if (release.assetDownloadUrl?.startsWith('https://api.github.com/')) {
    return getGitHubHeaders(ENV.updateGithubToken, 'application/octet-stream');
  }

  const headers: Record<string, string> = {
    Accept: APK_MIME_TYPE,
  };

  if (ENV.updateGithubToken) {
    headers.Authorization = `Bearer ${ENV.updateGithubToken}`;
  }

  return headers;
}

function createProgress(
  stage: UpdateDownloadProgress['stage'],
  progress: number | null = null,
  bytesWritten: number | null = null,
  contentLength: number | null = null,
): UpdateDownloadProgress {
  return {
    stage,
    progress,
    bytesWritten,
    contentLength,
  };
}

function toAppRelease(release: GitHubRelease): AppRelease {
  const tagName = release.tag_name?.trim();
  const htmlUrl = release.html_url?.trim();
  if (!tagName || !htmlUrl) {
    throw new Error('Latest GitHub release is missing required metadata');
  }

  const preferredAsset = getPreferredAsset(release.assets);
  const downloadUrl = preferredAsset?.browser_download_url?.trim() || htmlUrl;
  const assetName = preferredAsset?.name?.trim() || null;
  const assetDownloadUrl = preferredAsset?.url?.trim() || preferredAsset?.browser_download_url?.trim() || null;
  const isAndroidApk = supportsInstallActions() && Boolean(assetName?.toLowerCase().endsWith('.apk'));
  const canInstallInApp = isAndroidApk && Boolean(assetDownloadUrl);

  return {
    tagName,
    version: normalizeVersion(tagName),
    name: release.name?.trim() || tagName,
    body: release.body?.trim() || 'No release notes were provided.',
    publishedAt: release.published_at || null,
    htmlUrl,
    downloadUrl,
    downloadLabel: canInstallInApp ? 'Install Update' : preferredAsset ? 'Update' : 'Release Notes',
    assetName,
    assetDownloadUrl,
    assetSizeBytes: typeof preferredAsset?.size === 'number' ? preferredAsset.size : null,
    canInstallInApp,
  };
}

async function fetchLatestRelease(): Promise<AppRelease> {
  const repo = parseRepoUrl(ENV.updateGithubRepoUrl);
  if (!repo) {
    throw new Error('Update repository is not configured');
  }

  const latestResponse = await fetchGitHubJson<GitHubRelease>(
    getGitHubApiUrl(repo, '/releases/latest'),
    ENV.updateGithubToken,
  );

  if (latestResponse.ok) {
    return toAppRelease(latestResponse.data);
  }

  if (latestResponse.status === 404) {
    throw new AppUpdateNoReleaseError();
  }

  throw new Error(`GitHub update check failed (${latestResponse.status})`);
}

async function downloadAndInstallApk(
  release: AppRelease,
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<void> {
  if (!supportsInstallActions()) {
    return;
  }

  if (!release.canInstallInApp || !release.assetDownloadUrl) {
    await Linking.openURL(release.downloadUrl || release.htmlUrl);
    return;
  }

  if (!androidApkInstaller.isAvailable()) {
    await Linking.openURL(release.downloadUrl || release.htmlUrl);
    return;
  }

  onProgress?.(createProgress('checking-permission'));
  const canInstallPackages = await androidApkInstaller.canRequestPackageInstalls();
  if (!canInstallPackages) {
    await androidApkInstaller.openInstallPermissionSettings();
    throw new Error('Allow app installs for Purrivacy, then tap Install Update again.');
  }

  const downloadDirectory = getDownloadDirectory();
  downloadDirectory.create({ intermediates: true, idempotent: true });

  const destinationFile = new File(downloadDirectory, sanitizeAssetFileName(release));
  if (destinationFile.exists) {
    destinationFile.delete();
  }

  const download = File.createDownloadTask(
    release.assetDownloadUrl,
    destinationFile,
    {
      headers: getDownloadHeaders(release),
      onProgress: (event) => {
        const expectedBytes = event.totalBytes > 0
          ? event.totalBytes
          : release.assetSizeBytes;
        const progress = expectedBytes
          ? Math.min(event.bytesWritten / expectedBytes, 1)
          : null;

        onProgress?.(createProgress(
          'downloading',
          progress,
          event.bytesWritten,
          expectedBytes,
        ));
      },
    },
  );

  onProgress?.(createProgress('downloading', 0, 0, release.assetSizeBytes));

  const result = await download.downloadAsync();
  if (!result) {
    throw new Error('Update download was cancelled');
  }

  onProgress?.(createProgress('opening-installer', 1, release.assetSizeBytes, release.assetSizeBytes));
  await androidApkInstaller.installApk(result.uri);
}

export const appUpdateService = {
  isConfigured: () => Boolean(parseRepoUrl(ENV.updateGithubRepoUrl)),
  isInstallSupported: supportsInstallActions,
  getCurrentVersion,
  getSkippedReleaseTag: async (): Promise<string | null> => {
    return getNonSensitiveValue(SKIPPED_RELEASE_TAG_KEY);
  },
  skipRelease: async (release: AppRelease): Promise<void> => {
    await setNonSensitiveValue(SKIPPED_RELEASE_TAG_KEY, release.tagName);
  },

  checkForUpdate: async (): Promise<UpdateCheckResult> => {
    const release = await fetchLatestRelease();
    const currentVersion = getCurrentVersion();

    return {
      currentVersion,
      isAvailable: compareVersions(release.version, currentVersion) > 0,
      release,
      checkedAt: Date.now(),
    };
  },

  openUpdate: async (release: AppRelease): Promise<void> => {
    if (!supportsInstallActions()) {
      return;
    }

    await Linking.openURL(release.downloadUrl || release.htmlUrl);
  },

  downloadAndInstallUpdate: downloadAndInstallApk,
};
