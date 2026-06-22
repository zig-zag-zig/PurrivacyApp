import { User } from 'firebase/auth';
import { ENV } from '../../../config/env';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '../../../config/inputLimits';

export { USERNAME_MAX_LENGTH };

export function sanitizeUsernameInput(username: string): string {
    const beforeEmailDomain = username.split('@')[0] ?? username;
    return beforeEmailDomain
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.\-+]/g, '')
        .slice(0, USERNAME_MAX_LENGTH);
}

export function normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
    const trimmed = username.trim();
    const normalized = normalizeUsername(username);
    if (!trimmed) {
        return 'Username is required';
    }

    if (trimmed.includes('@')) {
        return 'Enter your username, not an email address';
    }

    if (normalized.length < USERNAME_MIN_LENGTH) {
        return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
    }

    if (normalized.length > USERNAME_MAX_LENGTH) {
        return `Username must be ${USERNAME_MAX_LENGTH} characters or fewer`;
    }

    if (sanitizeUsernameInput(normalized) !== normalized) {
        return 'Use only letters, numbers, underscores, hyphens, dots, and plus signs';
    }

    return null;
}

export function usernameToAuthEmail(username: string): string {
    const error = validateUsername(username);
    if (error) {
        throw new Error(error);
    }
    return `${normalizeUsername(username)}@${ENV.authEmailDomain}`;
}

function authEmailToUsername(email: string | null | undefined): string | null {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    const suffix = `@${ENV.authEmailDomain}`;
    if (!normalized.endsWith(suffix)) {
        return null;
    }

    return normalized.slice(0, -suffix.length);
}

export function getUsernameFromUser(user: User | null | undefined): string | null {
    return authEmailToUsername(user?.email);
}
