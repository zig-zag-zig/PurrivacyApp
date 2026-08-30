import type { AuthErrorResponse } from '../../types/types';

/**
 * Expected shape of backend error bodies.
 *
 * The field types document the contract; values are not validated here.
 * Classification code treats presence/truthiness of the flags as the
 * signal (matching historic `errorData?.flag` checks).
 */
export type ApiErrorData = Partial<AuthErrorResponse> & {
    error?: string;
    retryAfter?: string | number;
    rateLimited?: boolean;
    requestId?: string;
};

/** A JSON object as parsed from a response body. */
export type JsonObject = Record<string, unknown>;

/**
 * True for any non-null object (arrays included) — mirrors the historic
 * `typeof data === 'object' && data !== null` checks in the request path.
 */
export const isJsonObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null;

/**
 * Narrow runtime guard for backend error bodies: a non-null, non-array object.
 * Arrays and primitives carry no error flags and fall through to the generic
 * `Request failed with status N` path instead of being trusted as error data.
 */
export const isApiErrorData = (value: unknown): value is ApiErrorData =>
    isJsonObject(value) && !Array.isArray(value);
