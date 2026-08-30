import type { StoredSession, SessionResponse } from '../types/types';
import type { CreateSessionFn, RequestFn, RequestOptions } from './request/requestOptions';
import type { ApiErrorData } from './request/errorData';

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

/**
 * Request function shape accepted by the MFA error handlers. Bodies and
 * responses are `unknown`: they cross the boundary between the API layer and
 * the MFA flow and are narrowed by runtime guards at each use.
 */
export type MfaApiRequestFn = RequestFn;

export type ApiMfaErrorPort = {
  getIsInMfaHandler: () => boolean;
  handleRateLimitError: (errorData: ApiErrorData) => Promise<never>;
  handleSensitiveMfaError: (
    endpoint: string,
    method: string,
    body: unknown,
    requiresAuth: boolean,
    retryOnFailure: boolean,
    options: RequestOptions,
    requestFn: MfaApiRequestFn,
  ) => Promise<unknown>;
  handleSessionMfaError: (
    endpoint: string,
    method: string,
    body: unknown,
    requiresAuth: boolean,
    retryOnFailure: boolean,
    options: RequestOptions,
    isSession: boolean,
    requestFn: MfaApiRequestFn,
    createSessionFn: CreateSessionFn,
  ) => Promise<unknown>;
  handleMissingHeadersError: (
    endpoint: string,
    method: string,
    body: unknown,
    requiresAuth: boolean,
    retryOnFailure: boolean,
    options: RequestOptions,
    errorData: ApiErrorData,
    requestFn: MfaApiRequestFn,
    createSessionFn: CreateSessionFn,
  ) => Promise<unknown>;
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
