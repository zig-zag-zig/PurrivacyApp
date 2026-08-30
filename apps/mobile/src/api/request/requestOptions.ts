import type { SessionResponse } from '../../types/types';

export class RequestOptions {
    mfaCode?: string;
    useSessionAuth?: boolean = true;
    includeDeviceId?: boolean;
}

/**
 * The low-level request function shared by the requester, the MFA error
 * handler and the HTTP error handler. The response is an unvalidated body
 * (`unknown`); callers narrow it with runtime guards or DTO casts.
 */
export type RequestFn = (
    endpoint: string,
    method: string,
    body?: unknown,
    requiresAuth?: boolean,
    options?: RequestOptions,
    retryOnFailure?: boolean,
) => Promise<unknown>;

/** Session-creation callback used by retry paths. */
export type CreateSessionFn = (
    retryOnFailure: boolean,
    mfaCode?: string,
) => Promise<SessionResponse | null>;
