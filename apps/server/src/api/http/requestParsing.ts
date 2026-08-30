import { BadRequestError } from '../../utils/errors';

type BodyRecord = Record<string, unknown>;

const getBodyRecord = (body: unknown): BodyRecord => (
    body !== null && typeof body === 'object' && !Array.isArray(body)
        ? body as BodyRecord
        : {}
);

export const getBodyValue = (body: unknown, field: string): unknown => {
    return getBodyRecord(body)[field];
};

export const getBearerToken = (authHeader: string | undefined): string | undefined => {
    if (!authHeader?.startsWith('Bearer ')) {
        return undefined;
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    return token || undefined;
};

export const requireBodyValue = (body: unknown, field: string): unknown => {
    const value = getBodyValue(body, field);
    if (!value) {
        throw new BadRequestError(`${field} is required`);
    }

    return value;
};

export const requireBodyString = (
    body: unknown,
    field: string,
    options: { trim?: boolean } = {},
): string => {
    const value = requireBodyValue(body, field);
    if (typeof value !== 'string') {
        throw new BadRequestError(`${field} must be a string`);
    }

    return options.trim === true ? value.trim() : value;
};

export const parseOptionalTrimmedString = (
    body: unknown,
    field: string,
    maxLength: number,
): string | undefined => {
    const value = getBodyValue(body, field);
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== 'string') {
        throw new BadRequestError(`${field} must be a string`);
    }

    const normalized = value.trim();
    if (!normalized) {
        return undefined;
    }

    if (normalized.length > maxLength) {
        throw new BadRequestError(`${field} is too long`);
    }

    return normalized;
};
