import { db } from '../../../infrastructure/firebase';

const mfaSetupCollection = db.collection('mfaSetup');
const mfaSetupNonceCollection = db.collection('mfaSetupNonces');
const mfaTransitionCollection = db.collection('mfaTransitions');

export const getMfaSecurityRef = (userId: string) => {
    return db.collection('users').doc(userId).collection('security').doc('mfa');
};

export const getMfaSetupRef = (userId: string) => {
    return mfaSetupCollection.doc(userId);
};

export const getMfaSetupCollection = () => {
    return mfaSetupCollection;
};

export const getMfaSetupNonceRef = (nonceHash: string) => {
    return mfaSetupNonceCollection.doc(nonceHash);
};

export const getMfaSetupNonceCollection = () => {
    return mfaSetupNonceCollection;
};

export const getMfaTransitionCollection = () => {
    return mfaTransitionCollection;
};
