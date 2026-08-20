import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { getApiRuntime } from '../runtime';
import { ApiRequestError } from '../apiError';
import type { CreateSessionFn, RequestOptions } from './requestOptions';

async function getDeviceId(): Promise<string> {
    if (Platform.OS === 'android') {
        return Application.getAndroidId();
    }

    if (Platform.OS === 'ios') {
        return await Application.getIosIdForVendorAsync() ?? 'ios-device';
    }

    return Application.applicationId ?? 'purrivacy-device';
}

export async function buildAuthHeaders(
    requiresAuth: boolean,
    retryOnFailure: boolean,
    createSessionFn: CreateSessionFn,
    options?: RequestOptions,
): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (options?.includeDeviceId) {
        headers['X-Device-Id'] = await getDeviceId();
    }

    if (!requiresAuth) {
        return headers;
    }

    const useSessionAuth = options?.useSessionAuth !== false;
    if (useSessionAuth) {
        const session = await createSessionFn(retryOnFailure);
        if (!session?.accessToken) {
            throw new ApiRequestError('Authentication session could not be created', 401, { sessionInvalid: true });
        }

        headers.Authorization = `Bearer ${session.accessToken}`;
        return headers;
    }

    const currentUser = getApiRuntime().identity.getUser();
    const token = await currentUser?.getIdToken();
    if (!token) {
        throw new ApiRequestError('User is not authenticated', 401, { bearerHeaderMissing: true });
    }

    headers.Authorization = `Bearer ${token}`;
    return headers;
}

export function buildRequestBody(body?: unknown, options?: RequestOptions): Record<string, unknown> {
    // Callers pass plain objects; the spread mirrors the historic `{ ...body }`
    // behavior (including its handling of non-object truthy values).
    const requestBody = body ? { ...(body as Record<string, unknown>) } : {};
    if (options?.mfaCode) {
        requestBody.mfaCode = options.mfaCode;
    }
    return requestBody;
}
