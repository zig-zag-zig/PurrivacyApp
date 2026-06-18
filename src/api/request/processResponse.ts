import { EventService } from '../../services/eventService';
import { logger } from '../../utils/logger';
import { handleHttpError } from './httpErrorHandler';
import { parseResponseBody } from './parseResponseBody';
import type { CreateSessionFn, RequestFn, RequestOptions } from './requestOptions';

export async function processResponse(
    response: Response,
    endpoint: string,
    method: string,
    body: any,
    requiresAuth: boolean,
    retryOnFailure: boolean,
    options: RequestOptions | undefined,
    requestFn: RequestFn,
    createSessionFn: CreateSessionFn,
): Promise<any> {
    if (response.status === 204) {
        return;
    }

    const data = await parseResponseBody(response);
    const requestId = response.headers.get('x-request-id');
    if (requestId && typeof data === 'object' && data !== null) {
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
    if (data.newRecoveryCodes) {
        EventService.addEvent('newRecoveryCodes', { recoveryCodes: data.newRecoveryCodes });
    }

    return data;
}
