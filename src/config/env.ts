import Constants from 'expo-constants';
import { getFirebaseAuthEmulatorUrl } from './firebaseEmulator';

export function parseNumberEnv(value: string | undefined, defaultValue: number, min = 0): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return defaultValue;
  }

  return parsed;
}

export function parseFloatEnv(value: string | undefined, defaultValue: number, min = 0, max = 1): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return defaultValue;
  }

  return parsed;
}

function getRequiredEnv(name: string): string {
  const value = rawEnv[name as keyof typeof rawEnv];
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`[env] Missing required environment variable: ${name}`);
  }

  return trimmed;
}

export function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return defaultValue;
}

export function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

export function parseApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('[env] EXPO_PUBLIC_API_BASE_URL must start with http:// or https://');
  }

  return ensureTrailingSlash(trimmed);
}

export function parseAuthEmailDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) {
    throw new Error('[env] EXPO_PUBLIC_AUTH_EMAIL_DOMAIN must be a valid domain');
  }

  return trimmed;
}

export function parseOptionalFirebaseProjectId(value: string | undefined, appEnv: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (appEnv === 'production') {
    throw new Error('[env] EXPO_PUBLIC_FIREBASE_PROJECT_ID cannot be set for production builds');
  }

  if (!/^[a-z][a-z0-9-]{4,29}$/i.test(trimmed)) {
    throw new Error('[env] EXPO_PUBLIC_FIREBASE_PROJECT_ID must be a valid Firebase project id');
  }

  return trimmed;
}

function resolveAppVersion(): string {
  const constants = Constants as typeof Constants & { nativeAppVersion?: string | null };
  return constants.nativeAppVersion || Constants.expoConfig?.version || '1.0.0';
}

function deriveApiVersionFromAppVersion(): string {
  const appVersion = resolveAppVersion().trim();
  const major = appVersion.match(/^(\d+)\./)?.[1];
  if (!major || major === '0') {
    throw new Error(`[env] App version must start with a positive major version to derive API version, got "${appVersion}"`);
  }

  return `v${major}`;
}

export function parseApiVersion(value: string | undefined, defaultValue = 'v1'): string {
  let normalized = value?.trim() || defaultValue;
  normalized = normalized.replace(/^\/+|\/+$/g, '').toLowerCase();

  if (/^\d+$/.test(normalized)) {
    normalized = `v${normalized}`;
  }

  if (!/^v[1-9]\d*$/.test(normalized)) {
    throw new Error('[env] EXPO_PUBLIC_API_VERSION must look like v1, v2, etc.');
  }

  return normalized;
}

export function parseOptionalGitHubRepoUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('[env] EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL must be a valid GitHub repository URL');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
    throw new Error('[env] EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL must start with https://github.com/');
  }

  const [owner, rawRepo] = parsed.pathname.split('/').filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, '');
  if (!owner || !repo || parsed.pathname.split('/').filter(Boolean).length < 2) {
    throw new Error('[env] EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL must include owner and repo');
  }

  return `https://github.com/${owner}/${repo}`;
}

export function parseOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function parseOptionalUrl(value: string | undefined, name: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`[env] ${name} must be a valid URL`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`[env] ${name} must use https://`);
  }

  return parsed.toString();
}

function resolveExtraValue(name: string): string | null {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== 'object') {
    return null;
  }

  const value = (extra as Record<string, unknown>)[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const rawEnv = {
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_API_VERSION: process.env.EXPO_PUBLIC_API_VERSION,
  EXPO_PUBLIC_AUTH_EMAIL_DOMAIN: process.env.EXPO_PUBLIC_AUTH_EMAIL_DOMAIN,
  EXPO_PUBLIC_DEV_TEMP_KEY_COUNT: process.env.EXPO_PUBLIC_DEV_TEMP_KEY_COUNT,
  EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_SENTRY_ENABLED: process.env.EXPO_PUBLIC_SENTRY_ENABLED,
  EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL: process.env.EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL,
  EXPO_PUBLIC_UPDATE_GITHUB_TOKEN: process.env.EXPO_PUBLIC_UPDATE_GITHUB_TOKEN,
};

const sentryDsn = parseOptionalUrl(rawEnv.EXPO_PUBLIC_SENTRY_DSN, 'EXPO_PUBLIC_SENTRY_DSN');
const appEnv = resolveExtraValue('appEnv') ?? ((typeof __DEV__ !== 'undefined' && __DEV__) ? 'development' : 'production');

export const ENV = {
  apiBaseUrl: parseApiBaseUrl(getRequiredEnv('EXPO_PUBLIC_API_BASE_URL')),
  apiVersion: parseApiVersion(rawEnv.EXPO_PUBLIC_API_VERSION, deriveApiVersionFromAppVersion()),
  appBuildVersion: Constants.nativeBuildVersion ?? null,
  appEnv,
  appVersion: resolveAppVersion(),
  authEmailDomain: parseAuthEmailDomain(getRequiredEnv('EXPO_PUBLIC_AUTH_EMAIL_DOMAIN')),
  devTempKeyCount: parseNumberEnv(rawEnv.EXPO_PUBLIC_DEV_TEMP_KEY_COUNT, 0, 0),
  firebaseAuthEmulatorUrl: getFirebaseAuthEmulatorUrl(rawEnv.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST, appEnv),
  firebaseProjectId: parseOptionalFirebaseProjectId(rawEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID, appEnv),
  sentryDsn,
  sentryEnabled: Boolean(sentryDsn) && parseBooleanEnv(rawEnv.EXPO_PUBLIC_SENTRY_ENABLED, true),
  sentryTracesSampleRate: parseFloatEnv(rawEnv.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 0, 0, 1),
  updateGithubRepoUrl: parseOptionalGitHubRepoUrl(rawEnv.EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL),
  updateGithubToken: parseOptionalString(rawEnv.EXPO_PUBLIC_UPDATE_GITHUB_TOKEN),
};
