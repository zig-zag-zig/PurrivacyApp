import { afterEach, describe, expect, it, vi } from 'vitest';
import { Linking, Platform } from 'react-native';

vi.mock('expo-constants', () => ({
  default: {
    nativeAppVersion: '1.0.0',
    expoConfig: {
      version: '1.0.0',
    },
  },
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

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/');
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
    updateGithubToken: null,
  },
}));

vi.mock('../../security/services/biometricSecureStorage', () => ({
  getNonSensitiveValue: vi.fn(),
  setNonSensitiveValue: vi.fn(),
}));

vi.mock('./androidApkInstaller', () => ({
  androidApkInstaller: {
    isAvailable: vi.fn(() => false),
    canRequestPackageInstalls: vi.fn(),
    openInstallPermissionSettings: vi.fn(),
    installApk: vi.fn(),
  },
}));

import { AppUpdateNoReleaseError, appUpdateService } from './appUpdateService';

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
    assets: [
      {
        name: 'Purrivacy.apk',
        url: 'https://api.github.com/repos/zig-zag-zig/PurrivacyApp/releases/assets/431351271',
        browser_download_url: 'https://github.com/zig-zag-zig/PurrivacyApp/releases/download/v1.0.0/Purrivacy.apk',
        content_type: 'application/vnd.android.package-archive',
        size: 109354861,
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  (Platform as { OS: string }).OS = 'android';
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

    await appUpdateService.downloadAndInstallUpdate(result.release);
    await appUpdateService.openUpdate(result.release);

    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
