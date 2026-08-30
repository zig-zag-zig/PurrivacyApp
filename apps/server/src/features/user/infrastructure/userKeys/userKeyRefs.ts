import { rtdb } from '../../../../infrastructure/firebase/index';
import { assertRtdbKey, encodeRtdbKeySegment } from '../../../../infrastructure/firebase/rtdbKeys';
import { BadRequestError } from '../../../../utils/errors';

export const USER_KEY_ITEMS_CHILD = 'items';

const USER_KEYS_ROOT = 'userKeys';

export const assertUserKeyRecordId = (recordId: string): void => {
    try {
        assertRtdbKey('recordId', recordId);
    } catch {
        throw new BadRequestError('recordId is not a valid key record id');
    }
};

export const getUserKeysRef = (userId: string) => {
    const encodedUserId = encodeRtdbKeySegment(userId);
    assertRtdbKey('encodedUserId', encodedUserId);
    return rtdb.ref(`${USER_KEYS_ROOT}/${encodedUserId}`);
};

