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
import { createSha256Hasher } from './updateSigning';
import {
  UPDATE_MANIFEST_ASSET_NAME,
  parseUpdateManifest,
  verifyUpdateManifestSignature,
} from './updateManifest';
import type { UpdateManifest } from './updateManifest';
import { compareVersions, getCurrentVersion, normalizeVersion } from './updateVersion';

const GITHUB_RELEASES_NOT_FOUND_MESSAGE = 'No public GitHub release found for this app.';
const SKIPPED_RELEASE_TAG_KEY = 'app-update-skipped-release-tag';
const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const APK_HASH_CHUNK_SIZE = 1024 * 1024;
const supportsInstallActions = (): boolean => Platform.OS === 'android';

export class AppUpdateNoReleaseError extends Error {
  constructor(message = GITHUB_RELEASES_NOT_FOUND_MESSAGE) {
    super(message);
    this.name = 'AppUpdateNoReleaseError';
  }
}

export class UpdateVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpdateVerificationError';
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
  // GitHub release assets are public; downloads are unauthenticated. Never
  // attach an EXPO_PUBLIC token here — it would be recoverable from the APK.
  if (release.assetDownloadUrl?.startsWith('https://api.github.com/')) {
    return getGitHubHeaders('application/octet-stream');
  }

  return {
    Accept: APK_MIME_TYPE,
  };
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

/**
 * Fetches and verifies the signed update manifest for the release, and binds it
 * to the APK asset. Returns null on ANY failure (missing asset, unparseable
 * JSON, invalid signature, version mismatch, or asset mismatch) — callers must
 * treat null as "in-app install unavailable" (fail-closed, browser fallback).
 */
async function fetchVerifiedUpdateManifest(
  manifestAsset: GitHubReleaseAsset,
  release: GitHubRelease,
  apkAsset: GitHubReleaseAsset,
): Promise<UpdateManifest | null> {
  const manifestUrl = manifestAsset.browser_download_url?.trim();
  const apkDownloadUrl = apkAsset.browser_download_url?.trim();
  if (!manifestUrl || !apkDownloadUrl) {
    return null;
  }

  try {
    const response = await fetch(manifestUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }

    const raw: unknown = await response.json();
    const manifest = parseUpdateManifest(raw, release.tag_name?.trim() ?? null);
    const bindsToAsset =
      manifest.apkUrl === apkDownloadUrl
      && manifest.apkAssetName === (apkAsset.name ?? '').trim()
      && manifest.apkSizeBytes === apkAsset.size;
    return bindsToAsset ? manifest : null;
  } catch {
    return null;
  }
}

async function toAppRelease(release: GitHubRelease): Promise<AppRelease> {
  const tagName = release.tag_name?.trim();
  const htmlUrl = release.html_url?.trim();
  if (!tagName || !htmlUrl) {
    throw new Error('Latest GitHub release is missing required metadata');
  }

  const preferredAsset = getPreferredAsset(release.assets);
  const apkAsset = supportsInstallActions()
    ? (release.assets ?? []).find(asset => asset.name?.toLowerCase().endsWith('.apk')) ?? null
    : null;
  const manifestAsset = supportsInstallActions()
    ? (release.assets ?? []).find(asset => asset.name?.toLowerCase() === UPDATE_MANIFEST_ASSET_NAME) ?? null
    : null;
  const signedManifest = apkAsset && manifestAsset
    ? await fetchVerifiedUpdateManifest(manifestAsset, release, apkAsset)
    : null;

  const downloadUrl = preferredAsset?.browser_download_url?.trim() || htmlUrl;
  const assetName = preferredAsset?.name?.trim() || null;
  const assetDownloadUrl = preferredAsset?.url?.trim() || preferredAsset?.browser_download_url?.trim() || null;
  const isAndroidApk = supportsInstallActions() && Boolean(apkAsset);
  const canInstallInApp = isAndroidApk && Boolean(assetDownloadUrl) && signedManifest !== null;

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
    signedManifest,
  };
}

async function fetchLatestRelease(): Promise<AppRelease> {
  const repo = parseRepoUrl(ENV.updateGithubRepoUrl);
  if (!repo) {
    throw new Error('Update repository is not configured');
  }

  const latestResponse = await fetchGitHubJson<GitHubRelease>(
    getGitHubApiUrl(repo, '/releases/latest'),
  );

  if (latestResponse.ok) {
    return toAppRelease(latestResponse.data);
  }

  if (latestResponse.status === 404) {
    throw new AppUpdateNoReleaseError();
  }

  throw new Error(`GitHub update check failed (${latestResponse.status})`);
}

async function hashFileSha256(file: File): Promise<string> {
  const hasher = createSha256Hasher();
  const handle = file.open();
  let total = 0;
  try {
    for (;;) {
      const chunk = handle.readBytes(APK_HASH_CHUNK_SIZE);
      if (chunk.byteLength === 0) {
        break;
      }
      hasher.update(chunk);
      total += chunk.byteLength;
      if (chunk.byteLength < APK_HASH_CHUNK_SIZE) {
        break;
      }
    }
  } finally {
    handle.close();
  }

  if (total !== file.size) {
    throw new UpdateVerificationError(
      `Downloaded APK is incomplete (read ${total} of ${file.size} bytes)`,
    );
  }
  return hasher.digestHex();
}

/**
 * Fail-closed verification before installation: exact size and SHA-256 must
 * match the signed manifest. Throws UpdateVerificationError on any mismatch.
 */
async function verifyDownloadedApk(file: File, manifest: UpdateManifest): Promise<void> {
  if (file.size !== manifest.apkSizeBytes) {
    throw new UpdateVerificationError(
      `Downloaded APK size mismatch (expected ${manifest.apkSizeBytes} bytes, got ${file.size})`,
    );
  }

  const sha256 = await hashFileSha256(file);
  if (sha256.toLowerCase() !== manifest.apkSha256.toLowerCase()) {
    throw new UpdateVerificationError('Downloaded APK checksum does not match the signed update manifest');
  }
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
  await cleanDownloadedUpdates();
  downloadDirectory.create({ intermediates: true, idempotent: true });

  const destinationFile = new File(downloadDirectory, sanitizeAssetFileName(release));

  try {
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

    // Re-verify the manifest signature right before install (defense in depth)
    // and then verify the downloaded bytes against the manifest. Never install
    // anything that does not match; the catch block deletes the file.
    const manifest = release.signedManifest;
    if (!manifest || !verifyUpdateManifestSignature(manifest)) {
      throw new UpdateVerificationError('Update manifest could not be verified; refusing to install');
    }

    await verifyDownloadedApk(destinationFile, manifest);

    const downloadedSize = result.size > 0 ? result.size : manifest.apkSizeBytes;
    onProgress?.(createProgress('opening-installer', 1, downloadedSize, manifest.apkSizeBytes));
    await androidApkInstaller.installApk(result.uri);
  } catch (error) {
    if (destinationFile.exists) {
      destinationFile.delete();
    }
    throw error;
  }
}

async function cleanDownloadedUpdates(): Promise<void> {
  const downloadDirectory = getDownloadDirectory();
  if (downloadDirectory.exists) {
    downloadDirectory.delete();
  }
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
  cleanDownloadedUpdates,
};
