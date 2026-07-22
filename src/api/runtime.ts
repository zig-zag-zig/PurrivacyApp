import type { StoredSession, SessionResponse } from '../types/types';

// Re-export types for convenience in tests
export type { StoredSession, SessionResponse };

// ─── Identity Port ───────────────────────────────────────────────────────────

export type ApiIdentityPort = {
  getUserId: () => string;
  getUser: () => import('firebase/auth').User | null;
};

// ─── Session-store Port ──────────────────────────────────────────────────────

export type ApiSessionStorePort = {
  getStoredSession: (userId: string) => Promise<StoredSession | null>;
  storeSession: (session: SessionResponse, userId: string) => Promise<void>;
  clearStoredSession: (userId: string) => Promise<void>;
  updateStoredSessionMfaState: (
    userId: string,
    mfaEnabled: boolean,
    mfaTrusted: boolean,
  ) => Promise<void>;
  updateStoredSessionMfaTrust: (
    userId: string,
    mfaTrusted: boolean,
  ) => Promise<void>;
};

// ─── MFA Error-handler Port ─────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
// Loose function-signature type matching the MfaErrorHandler static methods
type MfaApiRequestFn = (
  endpoint: string,
  method: string,
  body?: any,
  requiresAuth?: boolean,
  options?: any,
  retryOnFailure?: boolean,
) => Promise<any>;

export type ApiMfaErrorPort = {
  getIsInMfaHandler: () => boolean;
  handleRateLimitError: (errorData: any) => Promise<never>;
  handleSensitiveMfaError: (
    endpoint: string,
    method: string,
    body: any,
    requiresAuth: boolean,
    retryOnFailure: boolean,
    options: any,
    requestFn: MfaApiRequestFn,
  ) => Promise<any>;
  handleSessionMfaError: (
    endpoint: string,
    method: string,
    body: any,
    requiresAuth: boolean,
    retryOnFailure: boolean,
    options: any,
    isSession: boolean,
    requestFn: MfaApiRequestFn,
    createSessionFn: (retryOnFailure: boolean, mfaCode?: string) => Promise<any>,
  ) => Promise<any>;
  handleMissingHeadersError: (
    endpoint: string,
    method: string,
    body: any,
    requiresAuth: boolean,
    retryOnFailure: boolean,
    options: any,
    errorData: any,
    requestFn: MfaApiRequestFn,
    createSessionFn: (retryOnFailure: boolean, mfaCode?: string) => Promise<any>,
  ) => Promise<any>;
};

// ─── Runtime aggregate ──────────────────────────────────────────────────────

export type ApiRuntime = {
  identity: ApiIdentityPort;
  sessionStore: ApiSessionStorePort;
  mfa: ApiMfaErrorPort;
};

let runtime: ApiRuntime | null = null;

export function configureApiRuntime(next: ApiRuntime): void {
  runtime = next;
}

export function getApiRuntime(): ApiRuntime {
  if (!runtime) {
    throw new Error(
      'ApiRuntime not configured. Call configureApiRuntime() at app bootstrap.',
    );
  }
  return runtime;
}
