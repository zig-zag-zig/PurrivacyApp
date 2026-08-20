import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Linking, Platform } from 'react-native';

vi.mock('expo-constants', () => ({
  default: {
    nativeAppVersion: '1.0.0',
    expoConfig: {
      version: '1.0.0',
    },
  },
}));

const fileSystemState = vi.hoisted(() => ({
  files: [] as unknown[],
}));

vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    exists = false;
    delete = vi.fn();

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/');
    }

    create = vi.fn();
  }

  class File {
    uri: string;
    exists = false;
    size = 0;
    delete = vi.fn();
    open = vi.fn(() => ({
      readBytes: vi.fn(() => new Uint8Array(0)),
      close: vi.fn(),
    }));

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/');
      fileSystemState.files.push(this);
    }

    static createDownloadTask = vi.fn();
  }

  return {
    Directory,
    File,
    Paths: {
      cache: new Directory('file:///tmp'),
    },
  };
});

vi.mock('react-native', () => ({
  Linking: {
    openURL: vi.fn(),
  },
  Platform: {
    OS: 'android',
  },
}));

vi.mock('../../../config/env', () => ({
  ENV: {
    updateGithubRepoUrl: 'https://github.com/zig-zag-zig/PurrivacyApp',
  },
}));

vi.mock('../../security/services/biometricSecureStorage', () => ({
  getNonSensitiveValue: vi.fn(),
  setNonSensitiveValue: vi.fn(),
}));

vi.mock('./androidApkInstaller', () => ({
  androidApkInstaller: {
    isAvailable: vi.fn(() => true),
    canRequestPackageInstalls: vi.fn(async () => true),
    openInstallPermissionSettings: vi.fn(),
    installApk: vi.fn(),
  },
}));

const updateSigningMock = vi.hoisted(() => ({
  verifyReleaseSignature: vi.fn(),
  createSha256Hasher: vi.fn(),
}));

vi.mock('./updateSigning', () => updateSigningMock);

import { File } from 'expo-file-system';

import type { AppRelease } from '../model/types';
import { AppUpdateNoReleaseError, UpdateVerificationError, appUpdateService } from './appUpdateService';
import { androidApkInstaller } from './androidApkInstaller';

const APK_SHA256 = 'a'.repeat(64);
const APK_SIZE = 4096;
const APK_ASSET = {
  name: 'Purrivacy.apk',
  url: 'https://api.github.com/repos/zig-zag-zig/PurrivacyApp/releases/assets/431351271',
  browser_download_url: 'https://github.com/zig-zag-zig/PurrivacyApp/releases/download/v1.0.0/Purrivacy.apk',
  content_type: 'application/vnd.android.package-archive',
  size: APK_SIZE,
};
const MANIFEST_ASSET = {
  name: 'update-manifest.json',
  url: 'https://api.github.com/repos/zig-zag-zig/PurrivacyApp/releases/assets/431351272',
  browser_download_url: 'https://github.com/zig-zag-zig/PurrivacyApp/releases/download/v1.0.0/update-manifest.json',
  content_type: 'application/json',
  size: 512,
};

function createFetchResponse(status: number, data: unknown = null): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => data),
  } as unknown as Response;
}

function createRelease(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v1.0.0',
    name: 'First release',
    body: 'First release',
    published_at: '2026-05-27T19:03:12Z',
    html_url: 'https://github.com/zig-zag-zig/PurrivacyApp/releases/tag/v1.0.0',
    draft: false,
    prerelease: false,
    assets: [APK_ASSET],
    ...overrides,
  };
}

function createManifestJson(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    tagName: 'v1.0.0',
    apkAssetName: 'Purrivacy.apk',
    apkUrl: APK_ASSET.browser_download_url,
    apkSizeBytes: APK_SIZE,
    apkSha256: APK_SHA256,
    createdAt: '2026-05-27T19:03:12Z',
    signature: 'a'.repeat(128),
    ...overrides,
  };
}

function releaseWithManifest(overrides: Record<string, unknown> = {}) {
  return createRelease({ assets: [APK_ASSET, MANIFEST_ASSET], ...overrides });
}

/** Starts an install, parks the download at the downloadAsync boundary, and returns handles. */
async function startInstall(release: AppRelease) {
  let finishDownload: (result: { uri: string; size: number } | null) => void = () => undefined;
  vi.mocked(File.createDownloadTask).mockReturnValue({
    downloadAsync: vi.fn(() => new Promise<{ uri: string; size: number } | null>((resolve) => {
      finishDownload = resolve;
    })),
  } as never);

  const done = appUpdateService.downloadAndInstallUpdate(release);
  await vi.waitFor(() => {
    expect(fileSystemState.files).toHaveLength(1);
  });

  const destination = fileSystemState.files[0] as unknown as {
    size: number;
    exists: boolean;
    delete: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
  };
  return { done, destination, finishDownload };
}

function chunkedHandle(chunk: Uint8Array) {
  return {
    readBytes: vi.fn()
      .mockReturnValueOnce(chunk)
      .mockReturnValue(new Uint8Array(0)),
    close: vi.fn(),
  };
}

beforeEach(() => {
  updateSigningMock.verifyReleaseSignature.mockReturnValue(true);
  updateSigningMock.createSha256Hasher.mockReturnValue({
    update: vi.fn(),
    digestHex: vi.fn(() => APK_SHA256),
  });
});

afterEach(() => {
  (Platform as { OS: string }).OS = 'android';
  fileSystemState.files.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('appUpdateService', () => {
  it('checks the latest release endpoint directly', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(createFetchResponse(200, createRelease()));

    vi.stubGlobal('fetch', fetchMock);

    const result = await appUpdateService.checkForUpdate();

    expect(result.currentVersion).toBe('1.0.0');
    expect(result.isAvailable).toBe(false);
    expect(result.release.tagName).toBe('v1.0.0');
    expect(result.release.assetName).toBe('Purrivacy.apk');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/zig-zag-zig/PurrivacyApp/releases/latest',
      expect.any(Object),
    );
  });

  it('uses a neutral no-release error when GitHub has no latest public release', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(createFetchResponse(404));

    vi.stubGlobal('fetch', fetchMock);

    await expect(appUpdateService.checkForUpdate())
      .rejects
      .toBeInstanceOf(AppUpdateNoReleaseError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('checks iOS releases for notes without exposing download or install actions', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const fetchMock = vi.fn().mockResolvedValueOnce(createFetchResponse(200, createRelease({
      tag_name: 'v1.0.1',
    })));

    vi.stubGlobal('fetch', fetchMock);

    const result = await appUpdateService.checkForUpdate();

    expect(appUpdateService.isInstallSupported()).toBe(false);
    expect(result.isAvailable).toBe(true);
    expect(result.release.assetName).toBeNull();
    expect(result.release.assetDownloadUrl).toBeNull();
    expect(result.release.canInstallInApp).toBe(false);
    expect(result.release.downloadLabel).toBe('Release Notes');
    expect(result.release.signedManifest).toBeNull();

    await appUpdateService.downloadAndInstallUpdate(result.release);
    await appUpdateService.openUpdate(result.release);

    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  describe('signed update manifest gating (APP-SEC-002)', () => {
    it('fetches the manifest from the release asset and enables in-app install when it verifies', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(createFetchResponse(200, releaseWithManifest()))
        .mockResolvedValueOnce(createFetchResponse(200, createManifestJson()));

      vi.stubGlobal('fetch', fetchMock);

      const result = await appUpdateService.checkForUpdate();

      expect(result.release.canInstallInApp).toBe(true);
      expect(result.release.signedManifest).not.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenLastCalledWith(
        MANIFEST_ASSET.browser_download_url,
        { headers: { Accept: 'application/json' } },
      );
    });

    it('refuses in-app install when the release has no update-manifest asset', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(createFetchResponse(200, createRelease()));

      vi.stubGlobal('fetch', fetchMock);

      const result = await appUpdateService.checkForUpdate();

      expect(result.release.canInstallInApp).toBe(false);
      expect(result.release.signedManifest).toBeNull();
      expect(fetchMock).toHaveBeenCalledOnce();

      await appUpdateService.downloadAndInstallUpdate(result.release);

      expect(androidApkInstaller.installApk).not.toHaveBeenCalled();
      expect(Linking.openURL).toHaveBeenCalledWith(result.release.downloadUrl);
    });

    it('refuses in-app install when the manifest signature does not verify', async () => {
      updateSigningMock.verifyReleaseSignature.mockReturnValue(false);

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(createFetchResponse(200, releaseWithManifest()))
        .mockResolvedValueOnce(createFetchResponse(200, createManifestJson()));

      vi.stubGlobal('fetch', fetchMock);

      const result = await appUpdateService.checkForUpdate();

      expect(result.release.canInstallInApp).toBe(false);
      expect(result.release.signedManifest).toBeNull();
      expect(updateSigningMock.verifyReleaseSignature).toHaveBeenCalled();
    });

    it('refuses in-app install when the manifest does not bind to the APK asset (size mismatch)', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(createFetchResponse(200, releaseWithManifest()))
        .mockResolvedValueOnce(createFetchResponse(200, createManifestJson({ apkSizeBytes: APK_SIZE + 1 })));

      vi.stubGlobal('fetch', fetchMock);

      const result = await appUpdateService.checkForUpdate();

      expect(result.release.canInstallInApp).toBe(false);
      expect(result.release.signedManifest).toBeNull();
    });

    it('refuses in-app install when the manifest version does not match the release tag', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(createFetchResponse(200, releaseWithManifest()))
        .mockResolvedValueOnce(createFetchResponse(200, createManifestJson({
          tagName: 'v2.0.0',
          version: '2.0.0',
        })));

      vi.stubGlobal('fetch', fetchMock);

      const result = await appUpdateService.checkForUpdate();

      expect(result.release.canInstallInApp).toBe(false);
      expect(result.release.signedManifest).toBeNull();
    });
  });

  describe('install-time verification (APP-SEC-002)', () => {
    async function setUpVerifiedRelease() {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(createFetchResponse(200, releaseWithManifest()))
        .mockResolvedValueOnce(createFetchResponse(200, createManifestJson()));

      vi.stubGlobal('fetch', fetchMock);

      const result = await appUpdateService.checkForUpdate();
      return result.release;
    }

    it('verifies size and SHA-256 before installing, then opens the installer', async () => {
      const release = await setUpVerifiedRelease();
      const { done, destination, finishDownload } = await startInstall(release);

      destination.size = APK_SIZE;
      destination.open.mockReturnValue(chunkedHandle(new Uint8Array(APK_SIZE)));
      finishDownload({ uri: 'file:///tmp/updates/Purrivacy.apk', size: APK_SIZE });

      await expect(done).resolves.toBeUndefined();

      expect(androidApkInstaller.installApk).toHaveBeenCalledWith('file:///tmp/updates/Purrivacy.apk');
      expect(destination.delete).not.toHaveBeenCalled();
    });

    it('deletes the APK and refuses to install when the digest does not match', async () => {
      updateSigningMock.createSha256Hasher.mockReturnValue({
        update: vi.fn(),
        digestHex: vi.fn(() => 'b'.repeat(64)),
      });

      const release = await setUpVerifiedRelease();
      const { done, destination, finishDownload } = await startInstall(release);

      destination.size = APK_SIZE;
      destination.exists = true;
      destination.open.mockReturnValue(chunkedHandle(new Uint8Array(APK_SIZE)));
      finishDownload({ uri: 'file:///tmp/updates/Purrivacy.apk', size: APK_SIZE });

      await expect(done).rejects.toBeInstanceOf(UpdateVerificationError);
      expect(androidApkInstaller.installApk).not.toHaveBeenCalled();
      expect(destination.delete).toHaveBeenCalled();
    });

    it('deletes the APK and refuses to install when the size does not match', async () => {
      const release = await setUpVerifiedRelease();
      const { done, destination, finishDownload } = await startInstall(release);

      destination.size = APK_SIZE - 1;
      destination.exists = true;
      finishDownload({ uri: 'file:///tmp/updates/Purrivacy.apk', size: APK_SIZE - 1 });

      await expect(done).rejects.toBeInstanceOf(UpdateVerificationError);
      expect(androidApkInstaller.installApk).not.toHaveBeenCalled();
      expect(destination.delete).toHaveBeenCalled();
    });

    it('refuses to install when the manifest re-verification fails at install time', async () => {
      // Verify succeeds at check time, then fails during the pre-install re-verification.
      updateSigningMock.verifyReleaseSignature
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const release = await setUpVerifiedRelease();
      const { done, destination, finishDownload } = await startInstall(release);

      destination.size = APK_SIZE;
      destination.exists = true;
      finishDownload({ uri: 'file:///tmp/updates/Purrivacy.apk', size: APK_SIZE });

      await expect(done).rejects.toBeInstanceOf(UpdateVerificationError);
      expect(androidApkInstaller.installApk).not.toHaveBeenCalled();
      expect(destination.delete).toHaveBeenCalled();
    });

    it('falls back to the release page in the browser when the installer is unavailable', async () => {
      vi.mocked(androidApkInstaller.isAvailable).mockReturnValue(false);

      const release = await setUpVerifiedRelease();
      await appUpdateService.downloadAndInstallUpdate(release);

      expect(androidApkInstaller.installApk).not.toHaveBeenCalled();
      expect(Linking.openURL).toHaveBeenCalledWith(release.downloadUrl);
    });
  });
});
