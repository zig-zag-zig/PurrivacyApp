import { BadRequestError } from '../../../utils/errors';
import { MAX_KEY_RECORDS_PAGE_SIZE } from '../../../core/constants';
import {
    requireBodyString,
    requireBodyValue,
} from '../../../api/http/requestParsing';

export const parseCreateUserRequest = (body: unknown): unknown => {
    return requireBodyValue(body, 'userData');
};

export const parseKeyRecordRequest = (body: unknown): unknown => {
    return requireBodyValue(body, 'key');
};

export const parseKeyRecordIdParam = (recordId: unknown): string => {
    if (typeof recordId !== 'string' || recordId.trim().length === 0) {
        throw new BadRequestError('recordId is required');
    }

    return recordId;
};

export const parseChangePasswordRequest = (body: unknown): unknown => {
    return requireBodyValue(body, 'dekPassword');
};

export const parseSavePushTokenRequest = (
    body: unknown,
    deviceId?: string,
): { pushToken: string; deviceId: string } => {
    const pushToken = requireBodyString(body, 'pushToken');

    if (typeof deviceId !== 'string' || !deviceId.trim()) {
        throw new BadRequestError('X-Device-ID header is required');
    }

    return { pushToken, deviceId };
};

export const parseDeletePushTokenRequest = (body: unknown): string => {
    return requireBodyString(body, 'pushToken');
};

export const parseKeyRecordListQuery = (
    query: unknown,
): { limit?: number; cursor?: string; since?: number } => {
    const record = query !== null && typeof query === 'object' && !Array.isArray(query)
        ? query as Record<string, unknown>
        : {};
    const result: { limit?: number; cursor?: string; since?: number } = {};

    const limit = record.limit;
    if (limit !== undefined) {
        if (typeof limit !== 'string' || !/^\d+$/.test(limit.trim())) {
            throw new BadRequestError('limit must be a positive integer');
        }
        const parsedLimit = Number.parseInt(limit.trim(), 10);
        if (parsedLimit < 1 || parsedLimit > MAX_KEY_RECORDS_PAGE_SIZE) {
            throw new BadRequestError(`limit must be between 1 and ${MAX_KEY_RECORDS_PAGE_SIZE}`);
        }
        result.limit = parsedLimit;
    }

    const cursor = record.cursor;
    if (cursor !== undefined) {
        if (typeof cursor !== 'string' || cursor.trim().length === 0) {
            throw new BadRequestError('cursor is invalid');
        }
        result.cursor = cursor.trim();
    }

    const since = record.since;
    if (since !== undefined) {
        if (typeof since !== 'string' || !/^\d+$/.test(since.trim())) {
            throw new BadRequestError('since must be a non-negative integer');
        }
        const parsedSince = Number.parseInt(since.trim(), 10);
        if (!Number.isSafeInteger(parsedSince)) {
            throw new BadRequestError('since is invalid');
        }
        result.since = parsedSince;
    }

    return result;
};

export const parseSetPassphraseStorageRequest = (body: unknown): { enabled: boolean } => {
    const value = (body as Record<string, unknown>)?.enabled;
    if (typeof value !== 'boolean') {
        throw new BadRequestError('enabled must be a boolean');
    }
    return { enabled: value };
};

