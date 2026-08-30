import { env } from '../../../config/env';
import { BadRequestError } from '../../../utils/errors';

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export class UsernameIdentity {
    static normalizeUsername(username: unknown): string {
        if (typeof username !== 'string') {
            throw new BadRequestError('username is required');
        }

        const normalized = username.trim().toLowerCase();
        if (!USERNAME_RE.test(normalized)) {
            throw new BadRequestError('username must be 3-32 characters and contain only letters, numbers, and underscores');
        }

        return normalized;
    }

    static toFirebaseEmail(username: unknown): string {
        return `${UsernameIdentity.normalizeUsername(username)}@${env.authEmailDomain}`;
    }

    static fromFirebaseEmail(email: string | null | undefined): string | null {
        const normalized = email?.trim().toLowerCase();
        if (!normalized) {
            return null;
        }

        const suffix = `@${env.authEmailDomain}`;
        if (!normalized.endsWith(suffix)) {
            return null;
        }

        return normalized.slice(0, -suffix.length);
    }
}
