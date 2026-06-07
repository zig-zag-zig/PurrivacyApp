export class RequestOptions {
    mfaCode?: string;
    useSessionAuth?: boolean = true;
    includeDeviceId?: boolean;
}

export type RequestFn = (
    endpoint: string,
    method: string,
    body?: any,
    requiresAuth?: boolean,
    options?: RequestOptions,
    retryOnFailure?: boolean,
) => Promise<any>;

export type CreateSessionFn = (
    retryOnFailure: boolean,
    mfaCode?: string,
) => Promise<any>;
