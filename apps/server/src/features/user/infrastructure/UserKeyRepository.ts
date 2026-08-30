import {
    EncryptedPayload,
    EncryptedKeyRecordWithId,
    KeyRecordListOptions,
} from '../../../core/types';
import {
    DEFAULT_KEY_RECORDS_PAGE_SIZE,
} from '../../../core/constants';
import { env } from '../../../config/env';
import { KeyQuotaExceededError, NotFoundError } from '../../../utils/errors';
import { EncryptedUserDataValidator } from '../domain/EncryptedUserDataValidator';
import {
    assertUserKeyRecordId,
    getUserKeysRef,
    USER_KEY_ITEMS_CHILD,
} from './userKeys/userKeyRefs';
import {
    createEmptyUserEncryptedKeyRecordSet,
    paginateUserEncryptedKeyRecords,
    sanitizeUserEncryptedKeyRecordSet,
    toEncryptedKeyRecords,
    toUserEncryptedKeyRecordEntries,
    UserEncryptedKeysRecordSet,
} from './userKeys/userKeyRecordSet';

const readUserEncryptedKeyRecordSetFromDb = async (
    userId: string,
): Promise<UserEncryptedKeysRecordSet> => {
    const ref = getUserKeysRef(userId);
    const snapshot = await ref.get();
    const value = snapshot.val();

    if (value === null) {
        const empty = createEmptyUserEncryptedKeyRecordSet();
        await ref.set(empty);
        return empty;
    }

    return sanitizeUserEncryptedKeyRecordSet(value);
};

const readUserEncryptedKeyRecords = async (
    userId: string,
): Promise<EncryptedKeyRecordWithId[]> => {
    const value = await readUserEncryptedKeyRecordSetFromDb(userId);

    return toEncryptedKeyRecords(value.items);
};

export const readUserEncryptedKeyRecordSet = async (
    userId: string,
    options: KeyRecordListOptions = {},
): Promise<{ keys: EncryptedKeyRecordWithId[]; nextCursor?: string }> => {
    const value = await readUserEncryptedKeyRecordSetFromDb(userId);
    const limit = options.limit ?? DEFAULT_KEY_RECORDS_PAGE_SIZE;

    const { records, nextCursor } = paginateUserEncryptedKeyRecords(
        toUserEncryptedKeyRecordEntries(value.items),
        { limit, cursor: options.cursor, since: options.since },
    );

    return {
        keys: records.map(({ recordId, key }) => ({ recordId, key })),
        nextCursor,
    };
};

export const readUserEncryptedKeys = async (
    userId: string,
): Promise<EncryptedPayload[]> => {
    const records = await readUserEncryptedKeyRecords(userId);
    return records.map(record => record.key);
};

export const initializeUserEncryptedKeyRecords = async (
    userId: string,
    keys: EncryptedPayload[] = [],
): Promise<EncryptedKeyRecordWithId[]> => {
    const ref = getUserKeysRef(userId);
    const sanitizedKeys = EncryptedUserDataValidator.sanitizeEncryptedKeys(keys, env.userMaxKeyRecords);
    const itemsRef = ref.child(USER_KEY_ITEMS_CHILD);
    const items: UserEncryptedKeysRecordSet['items'] = {};
    const updatedAt = Date.now();

    for (const key of sanitizedKeys) {
        const recordId = itemsRef.push().key;
        if (!recordId) {
            throw new Error('Failed to generate key record id');
        }
        assertUserKeyRecordId(recordId);
        items[recordId] = { ...key, updatedAt };
    }

    await ref.set({
        count: sanitizedKeys.length,
        items,
        updatedAt,
    } satisfies UserEncryptedKeysRecordSet);

    return Object.entries(items).map(([recordId, item]) => ({
        recordId,
        key: { encryptedData: item.encryptedData, iv: item.iv, tag: item.tag },
    }));
};

/**
 * Adds a key record atomically: the item write and the count/quota guard live
 * inside one RTDB transaction, so concurrent adds can never exceed the
 * configured per-user quota and `count` cannot drift from the items.
 */
export const addUserEncryptedKeyRecord = async (
    userId: string,
    key: EncryptedPayload,
): Promise<EncryptedKeyRecordWithId> => {
    const sanitized = EncryptedUserDataValidator.sanitizeEncryptedKeyRecord(key, 'key');
    const ref = getUserKeysRef(userId);
    const recordRef = ref.child(USER_KEY_ITEMS_CHILD).push();
    const recordId = recordRef.key;
    if (!recordId) {
        throw new Error('Failed to generate key record id');
    }
    assertUserKeyRecordId(recordId);

    const maxKeys = env.userMaxKeyRecords;
    const updatedAt = Date.now();

    const result = await ref.transaction((current: unknown) => {
        if (current === null || current === undefined) {
            return {
                count: 1,
                items: { [recordId]: { ...sanitized, updatedAt } },
                updatedAt,
            } satisfies UserEncryptedKeysRecordSet;
        }

        const recordSet = sanitizeUserEncryptedKeyRecordSet(current);
        if (Object.keys(recordSet.items).length >= maxKeys) {
            // Abort the transaction: quota exceeded (committed === false).
            return undefined;
        }

        return {
            count: Object.keys(recordSet.items).length + 1,
            items: { ...recordSet.items, [recordId]: { ...sanitized, updatedAt } },
            updatedAt,
        } satisfies UserEncryptedKeysRecordSet;
    });

    if (!result.committed) {
        throw new KeyQuotaExceededError({ maxKeys });
    }

    return { recordId, key: sanitized };
};

export const updateUserEncryptedKeyRecord = async (
    userId: string,
    recordId: string,
    key: EncryptedPayload,
): Promise<EncryptedKeyRecordWithId> => {
    assertUserKeyRecordId(recordId);

    const sanitized = EncryptedUserDataValidator.sanitizeEncryptedKeyRecord(key, 'key');
    const ref = getUserKeysRef(userId);

    // Authoritative existence pre-check: a genuinely missing record set must
    // 404 without creating anything. Inside the transaction the SDK can hand
    // the callback a stale `null` on its first invocation, so the callback
    // treats null as "retry" (placeholder value) instead of "missing".
    const preSnapshot = await ref.get();
    if (!preSnapshot.exists()) {
        throw new NotFoundError('Key record not found');
    }

    const updatedAt = Date.now();

    const result = await ref.transaction((current: unknown) => {
        if (current === null || current === undefined) {
            return createEmptyUserEncryptedKeyRecordSet();
        }

        const recordSet = sanitizeUserEncryptedKeyRecordSet(current);
        if (!recordSet.items[recordId]) {
            return undefined;
        }

        return {
            count: Object.keys(recordSet.items).length,
            items: { ...recordSet.items, [recordId]: { ...sanitized, updatedAt } },
            updatedAt,
        } satisfies UserEncryptedKeysRecordSet;
    });

    if (!result.committed) {
        throw new NotFoundError('Key record not found');
    }

    // Guard (oracle review NEW-4): if the whole record set was deleted
    // concurrently, the transaction's null-branch may have committed an empty
    // set. Verify the record actually exists so we never report success for a
    // write that did not land.
    const stored = await ref.child(`${USER_KEY_ITEMS_CHILD}/${recordId}`).get();
    if (!stored.exists()) {
        throw new NotFoundError('Key record not found');
    }

    return { recordId, key: sanitized };
};

export const deleteUserEncryptedKeyRecord = async (
    userId: string,
    recordId: string,
): Promise<void> => {
    assertUserKeyRecordId(recordId);
    const ref = getUserKeysRef(userId);

    // See updateUserEncryptedKeyRecord: pre-check existence so a genuinely
    // missing record set 404s without creating an empty stub via the
    // transaction retry placeholder.
    const preSnapshot = await ref.get();
    if (!preSnapshot.exists()) {
        throw new NotFoundError('Key record not found');
    }

    const result = await ref.transaction((current: unknown) => {
        if (current === null || current === undefined) {
            return createEmptyUserEncryptedKeyRecordSet();
        }

        const recordSet = sanitizeUserEncryptedKeyRecordSet(current);
        if (!recordSet.items[recordId]) {
            return undefined;
        }

        const remainingItems = { ...recordSet.items };
        delete remainingItems[recordId];

        return {
            count: Object.keys(remainingItems).length,
            items: remainingItems,
            updatedAt: Date.now(),
        } satisfies UserEncryptedKeysRecordSet;
    });

    if (!result.committed) {
        throw new NotFoundError('Key record not found');
    }
};

export const deleteUserEncryptedKeys = async (userId: string): Promise<void> => {
    await getUserKeysRef(userId).remove();
};
