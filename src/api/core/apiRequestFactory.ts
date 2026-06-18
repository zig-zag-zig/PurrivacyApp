import { logger } from '../../utils/logger';
import { ApiRequestError } from '../apiError';
import {
    RequestOptions,
    buildAuthHeaders,
    buildRequestBody,
    handleHttpError,
    isSensitiveAndRequiresMfa,
    processResponse,
} from '../requestHelpers';
import { buildApiUrl } from './buildApiUrl';

type CreateSessionFn = (
    retryOnFailure: boolean,
    mfaCode?: string,
    forceNewSession?: boolean,
) => Promise<any>;

export type ApiRequestFn = (
    endpoint: string,
    method: string,
    body?: any,
    requiresAuth?: boolean,
    options?: RequestOptions,
    retryOnFailure?: boolean,
) => Promise<any>;

export const createApiRequester = (createSession: CreateSessionFn): ApiRequestFn => {
    const request: ApiRequestFn = async (
        endpoint,
        method,
        body,
        requiresAuth = true,
        options,
        retryOnFailure = true,
    ) => {
        const url = buildApiUrl(endpoint);

        if (await isSensitiveAndRequiresMfa(endpoint, method) && !options?.mfaCode) {
            return await handleHttpError(
                403,
                { mfaRequiredSensitive: true },
                endpoint,
                method,
                body,
                true,
                retryOnFailure,
                options,
                request,
                createSession,
            );
        }

        const headers = await buildAuthHeaders(requiresAuth, retryOnFailure, createSession, options);
        const requestBody = buildRequestBody(body, options);
        const requestBodyKeys = Object.keys(requestBody);
        const methodCanHaveBody = !['GET', 'HEAD'].includes(method.toUpperCase());
        const contentType = headers['Content-Type'] ?? headers['content-type'];
        const shouldSendEmptyJsonBody = (
            methodCanHaveBody &&
            typeof contentType === 'string' &&
            contentType.toLowerCase().includes('application/json')
        );
        const serializedBody = requestBodyKeys.length > 0
            ? JSON.stringify(requestBody)
            : shouldSendEmptyJsonBody
                ? '{}'
                : undefined;
        const requestInit: RequestInit = {
            method,
            headers,
        };
        if (serializedBody !== undefined) {
            requestInit.body = serializedBody;
        }

        let response: Response;
        try {
            response = await fetch(url, requestInit);
        } catch (error) {
            logger.warn('api request failed before response', { endpoint, method, error });
            throw new ApiRequestError('Could not reach the server. Check your connection and try again.', 0, {
                networkUnavailable: true,
            });
        }

        return await processResponse(
            response,
            endpoint,
            method,
            body,
            requiresAuth,
            retryOnFailure,
            options,
            request,
            createSession,
        );
    };

    return request;
};
