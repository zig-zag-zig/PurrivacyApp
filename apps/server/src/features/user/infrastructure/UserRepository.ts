import { db } from '../../../infrastructure/firebase';
import { NotFoundError } from '../../../utils/errors';

const usersCollection = db.collection('users');

export const getUserRef = (userId: string) => {
    return usersCollection.doc(userId);
};

export const getUserDoc = async (userId: string) => {
    const doc = await getUserRef(userId).get();
    if (!doc.exists) {
        throw new NotFoundError('User not found');
    }
    return doc;
};

export const getUserWithFieldMask = async (
    userId: string,
    fieldMask: string[],
) => {
    const [doc] = await db.getAll(getUserRef(userId), { fieldMask });
    if (!doc.exists) {
        throw new NotFoundError('User not found');
    }

    return doc;
};

