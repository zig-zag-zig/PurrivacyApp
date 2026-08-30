import {
    EncryptedKeyRecordWithId,
    EncryptedPayload,
} from '../../../../core/types';
import { isPlainObject } from '../../../../infrastructure/firebase/utils';
import { BadRequestError } from '../../../../utils/errors';
import { EncryptedUserDataValidator } from '../../domain/EncryptedUserDataValidator';
import {
    assertUserKeyRecordId,
    USER_KEY_ITEMS_CHILD,
} from './userKeyRefs';

/**
 * A stored key item is the encrypted payload plus server-side bookkeeping.
 * The `updatedAt` metadata is never exposed through the API; it powers `since`
 * delta queries and cursor pagination. Records written before this metadata
 * existed have no `updatedAt` and are treated as always-included legacy
 * records (see paginateUserEncryptedKeyRecords).
 */
export type UserEncryptedKeyItem = EncryptedPayload & { updatedAt?: number };

export type UserEncryptedKeysRecordSet = {
    count: number;
    items: Record<string, UserEncryptedKeyItem>;
    updatedAt: number;
};

type UserEncryptedKeyRecordEntry = {
    recordId: string;
    key: EncryptedPayload;
    updatedAt?: number;
};

export const createEmptyUserEncryptedKeyRecordSet = (): UserEncryptedKeysRecordSet => ({
    count: 0,
    items: {},
    updatedAt: Date.now(),
});

const sanitizeUserEncryptedKeyItem = (value: unknown, name: string): UserEncryptedKeyItem => {
    const payload = EncryptedUserDataValidator.sanitizeEncryptedKeyRecord(value, name);
    const updatedAt = (value as Record<string, unknown>).updatedAt;
    return typeof updatedAt === 'number'
        ? { ...payload, updatedAt }
        : payload;
};

export const sanitizeUserEncryptedKeyItems = (
    value: unknown,
): Record<string, UserEncryptedKeyItem> => {
    if (value === undefined || value === null) {
        return {};
    }

    if (!isPlainObject(value)) {
        throw new BadRequestError('User encrypted key items are invalid');
    }

    const items: Record<string, UserEncryptedKeyItem> = {};
    for (const [recordId, key] of Object.entries(value)) {
        assertUserKeyRecordId(recordId);
        items[recordId] = sanitizeUserEncryptedKeyItem(key, `keys.${recordId}`);
    }

    return items;
};

export const sanitizeUserEncryptedKeyRecordSet = (
    value: unknown,
): UserEncryptedKeysRecordSet => {
    if (!isPlainObject(value)) {
        throw new BadRequestError('User encrypted keys are invalid');
    }

    const items = sanitizeUserEncryptedKeyItems(value[USER_KEY_ITEMS_CHILD]);

    return {
        count: Object.keys(items).length,
        items,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    };
};

export const toEncryptedKeyRecords = (
    items: Record<string, UserEncryptedKeyItem>,
): EncryptedKeyRecordWithId[] => (
    Object.entries(items).map(([recordId, item]) => ({
        recordId,
        key: {
            encryptedData: item.encryptedData,
            iv: item.iv,
            tag: item.tag,
        },
    }))
);

export const toUserEncryptedKeyRecordEntries = (
    items: Record<string, UserEncryptedKeyItem>,
): UserEncryptedKeyRecordEntry[] => (
    Object.entries(items).map(([recordId, item]) => ({
        recordId,
        key: {
            encryptedData: item.encryptedData,
            iv: item.iv,
            tag: item.tag,
        },
        updatedAt: item.updatedAt,
    }))
);

/**
 * Opaque cursor: `${updatedAt}:${recordId}`. Push-generated record ids only
 * contain `[A-Za-z0-9_-]`, so `:` is a safe separator. Legacy records sort with
 * an effective updatedAt of 0.
 */
export const encodeKeyRecordCursor = (entry: Pick<UserEncryptedKeyRecordEntry, 'recordId' | 'updatedAt'>): string => (
    `${entry.updatedAt ?? 0}:${entry.recordId}`
);

export const decodeKeyRecordCursor = (
    cursor: string,
): { updatedAt: number; recordId: string } | null => {
    const separatorIndex = cursor.indexOf(':');
    if (separatorIndex <= 0) {
        return null;
    }

    const updatedAtRaw = cursor.slice(0, separatorIndex);
    const recordId = cursor.slice(separatorIndex + 1);
    if (!/^\d+$/.test(updatedAtRaw) || !recordId) {
        return null;
    }

    return {
        updatedAt: Number.parseInt(updatedAtRaw, 10),
        recordId,
    };
};

/**
 * Order records by (updatedAt, recordId) — deterministic and stable for push
 * ids. Legacy records (no metadata) sort first with effective updatedAt 0 and
 * are ALWAYS included, even under a `since` filter, so a client performing its
 * first delta sync can never silently miss pre-metadata records. The cursor is
 * honored as a skip-boundary (>=), so a deleted cursor record does not break
 * the next page.
 */
export const paginateUserEncryptedKeyRecords = (
    entries: UserEncryptedKeyRecordEntry[],
    options: { limit: number; cursor?: string; since?: number },
): { records: UserEncryptedKeyRecordEntry[]; nextCursor?: string } => {
    const since = options.since ?? 0;

    const filtered = entries
        .filter(entry => entry.updatedAt === undefined || entry.updatedAt >= since)
        .sort((a, b) => {
            const aTime = a.updatedAt ?? 0;
            const bTime = b.updatedAt ?? 0;
            if (aTime !== bTime) {
                return aTime - bTime;
            }
            return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
        });

    let startIndex = 0;
    if (options.cursor !== undefined) {
        const decoded = decodeKeyRecordCursor(options.cursor);
        if (!decoded) {
            throw new BadRequestError('cursor is invalid');
        }
        assertUserKeyRecordId(decoded.recordId);

        const boundaryIndex = filtered.findIndex(entry => (
            (entry.updatedAt ?? 0) > decoded.updatedAt
            || ((entry.updatedAt ?? 0) === decoded.updatedAt && entry.recordId > decoded.recordId)
        ));
        if (boundaryIndex !== -1) {
            startIndex = boundaryIndex;
        }
    }

    const records = filtered.slice(startIndex, startIndex + options.limit);
    const hasMore = startIndex + records.length < filtered.length;
    const lastRecord = records[records.length - 1];

    return {
        records,
        nextCursor: hasMore && lastRecord ? encodeKeyRecordCursor(lastRecord) : undefined,
    };
};
