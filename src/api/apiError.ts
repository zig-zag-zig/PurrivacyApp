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
