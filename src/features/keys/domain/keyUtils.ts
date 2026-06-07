/**
 * Common key utility functions
 */

import { KeyPair } from '../../../types/types';

/**
 * Determines if a key is a complete pair (has both public and private key)
 */
export const isCompletePair = (key: KeyPair): boolean => {
    return Boolean(key.privateKey && key.publicKey);
};

/**
 * Gets the key type description
 */
export const getKeyTypeDescription = (key: KeyPair): string => {
    const types = ['Public'];
    if (key.privateKey) {
        types.push('Private');
    }
    return types.join(' + ');
};

/**
 * Checks if a key is selected in a selection object
 */
export const isKeySelected = (fingerprint: string, selectedKeys: { [fingerprint: string]: string } | { [fingerprint: string]: string }[]): boolean => {
    if (Array.isArray(selectedKeys)) {
        return selectedKeys.some(selection => fingerprint in selection);
    }
    return fingerprint in selectedKeys;
};

/**
 * Finds the default key from a list of keys
 */
export const findDefaultKey = (keys: KeyPair[]): KeyPair | null => {
    return keys.find(key => key.isDefault && key.privateKey) || null;
};

/**
 * Gets all complete key pairs from a list
 */
export const getCompleteKeyPairs = (keys: KeyPair[]): KeyPair[] => {
    return keys.filter(isCompletePair);
};

// Returns an object { [fingerprint]: privateKey } for the default or first private key, or undefined if none
export function getDefaultSelectedPrivateKey(keys: KeyPair[] | undefined): { [key: string]: string } | undefined {
    if (!keys) return undefined;
    const defaultKey = keys.find(k => k.isDefault && k.privateKey);
    if (defaultKey) {
        return { [defaultKey.fingerprint]: defaultKey.privateKey! };
    }
    const firstPrivateKey = keys.find(k => k.privateKey);
    if (firstPrivateKey) {
        return { [firstPrivateKey.fingerprint]: firstPrivateKey.privateKey! };
    }
    return undefined;
}