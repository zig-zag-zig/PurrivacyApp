import { EventService } from '../../services/eventService';
import { logger } from '../../utils/logger';
import { handleHttpError } from './httpErrorHandler';
import { isJsonObject } from './errorData';
import { parseResponseBody } from './parseResponseBody';
import { validateResponse } from './responseSchema';
import type { CreateSessionFn, RequestFn, RequestOptions } from './requestOptions';

export async function processResponse(
    response: Response,
    endpoint: string,
    method: string,
    body: unknown,
    requiresAuth: boolean,
    retryOnFailure: boolean,
    options: RequestOptions | undefined,
    requestFn: RequestFn,
    createSessionFn: CreateSessionFn,
): Promise<unknown> {
    if (response.status === 204) {
        return;
    }

    const data: unknown = await parseResponseBody(response);
    const requestId = response.headers.get('x-request-id');

    if (!response.ok) {
        if (requestId && isJsonObject(data)) {
            data.requestId = data.requestId || requestId;
        }

        logger.warn('api response error body', {
            endpoint,
            method,
            status: response.status,
            requestId,
            responseBody: data,
            requestBody: (typeof __DEV__ !== 'undefined' && __DEV__) ? body : '[redacted outside dev]',
        });

        return await handleHttpError(
            response.status,
            data,
            endpoint,
            method,
            body,
            requiresAuth,
            retryOnFailure,
            options,
            requestFn,
            createSessionFn,
        );
    }

    // LANE M: every typed response is runtime-validated at the boundary before
    // feature code can read it. Missing or malformed known fields reject with
    // ApiSchemaError; unknown extra fields are allowed (logged at debug by the
    // parsers) for forward compatibility. Endpoints without a DTO contract
    // pass through unchanged.
    const validatedData = validateResponse(endpoint, method, data);

    if (requestId && isJsonObject(validatedData)) {
        validatedData.requestId = validatedData.requestId || requestId;
    }

    if (endpoint !== '/auth/session') {
        EventService.addEvent('closeMfaModal');
    }

    // The backend may attach freshly generated recovery codes to any ok
    // response; only a well-formed, non-empty string array is trusted as
    // such (consistent with the strict response parsers).
    if (isJsonObject(validatedData)) {
        const recoveryCodes = validatedData.newRecoveryCodes;
        if (
            Array.isArray(recoveryCodes)
            && recoveryCodes.length > 0
            && recoveryCodes.every((code): code is string => typeof code === 'string' && code.length > 0)
        ) {
            EventService.addEvent('newRecoveryCodes', { recoveryCodes });
        }
    }

    return validatedData;
}
