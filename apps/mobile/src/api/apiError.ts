import { isJsonObject } from './request/errorData';

export class ApiRequestError extends Error {
    status: number;
    errorData: Record<string, unknown>;
    requestId?: string;
    isNetworkError: boolean;

    /**
     * `errorData` may be anything parsed from an untrusted response body;
     * non-object values are treated as empty rather than crashing on read.
     */
    constructor(
        message: string,
        status: number,
        errorData: unknown = {},
    ) {
        super(message);
        this.name = 'ApiRequestError';
        this.status = status;
        const data = isJsonObject(errorData) ? errorData : {};
        this.errorData = data;
        this.requestId = typeof data.requestId === 'string' ? data.requestId : undefined;
        this.isNetworkError = Boolean(data.networkUnavailable);
    }
}

/**
 * Thrown when an ok response body fails runtime DTO validation (LANE M): a
 * known field is missing or has the wrong primitive, or the top-level value
 * is not the expected JSON object. Distinct from `ApiRequestError` — this is
 * a client-side trust failure, not an HTTP error, so it carries no `status`
 * and never triggers retry/sign-out classification.
 */
export class ApiSchemaError extends Error {
    readonly endpoint: string;
    readonly method: string;

    constructor(message: string, endpoint: string, method: string) {
        super(message);
        this.name = 'ApiSchemaError';
        this.endpoint = endpoint;
        this.method = method;
    }
}
