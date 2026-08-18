import { EventService } from '../../services/eventService';
import { logger } from '../../utils/logger';
import { handleHttpError } from './httpErrorHandler';
import { isJsonObject } from './errorData';
import { parseResponseBody } from './parseResponseBody';
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
    if (requestId && isJsonObject(data)) {
        data.requestId = data.requestId || requestId;
    }

    if (!response.ok) {
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

    if (endpoint !== '/auth/session') {
        EventService.addEvent('closeMfaModal');
    }

    // The backend may attach freshly generated recovery codes to any ok
    // response; only a well-formed string array is trusted as such.
    if (isJsonObject(data)) {
        const recoveryCodes = data.newRecoveryCodes;
        if (Array.isArray(recoveryCodes) && recoveryCodes.every((code): code is string => typeof code === 'string')) {
            EventService.addEvent('newRecoveryCodes', { recoveryCodes });
        }
    }

    return data;
}
