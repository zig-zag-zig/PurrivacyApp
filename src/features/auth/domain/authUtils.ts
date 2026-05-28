import { auth } from '../../../config/firebase';
import { getUsernameFromUser } from './usernameIdentity';

/**
 * Utility functions for authentication operations
 */

/**
 * Gets the current user's UID or throws an error if not signed in
 */
export const getUserId = (): string => {
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) {
        throw new Error('User not signed in');
    }
    return currentUser.uid;
};

/**
 * Gets the current username or throws an error if not signed in
 */
export const getUsername = (): string => {
    const currentUser = auth.currentUser;
    const username = getUsernameFromUser(currentUser);
    if (!username) {
        throw new Error('User not signed in');
    }
    return username;
};

/**
 * Validates that a user is signed in and returns the user object
 */
export const getUser = () => {
    return auth.currentUser;
};
