import { db } from '../../../infrastructure/firebase';

export const sessionCollections = {
    sessions: db.collection('sessions'),
    refreshTokenFamilies: db.collection('refreshTokenFamilies'),
    refreshTokens: db.collection('refreshTokens'),
};

