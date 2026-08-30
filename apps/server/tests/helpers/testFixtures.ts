import { Request, Response } from 'express';
import { EncryptedPayload, SaltedEncryptedPayload, RefreshTokenFamily, RefreshToken, Session } from '../../src/core/types';

/**
 * Shared test fixture factories.
 * Import these in tests instead of duplicating mock object creation.
 */

// ── Encrypted payload factories ──────────────────────────────────────────

export const createEncryptedPayload = (suffix = ''): EncryptedPayload => ({
    encryptedData: Buffer.from(`payload-${suffix}`, 'utf8').toString('base64'),
    iv: 'a'.repeat(24),  // 12 bytes hex = 24 chars
    tag: 'b'.repeat(32), // 16 bytes hex = 32 chars
});

export const createSaltedEncryptedPayload = (suffix = ''): SaltedEncryptedPayload => ({
    ...createEncryptedPayload(suffix),
    salt: 'c'.repeat(32), // 16 bytes hex = 32 chars
});

// ── Express mock factories ───────────────────────────────────────────────

export const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
    headers: {},
    method: 'GET',
    path: '/test',
    body: {},
    ...overrides,
} as Request);

export interface MockResponse extends Response {
    headers: Record<string, string | number | readonly string[]>;
    body?: unknown;
    statusCodeValue?: number;
    ended?: boolean;
    locals: Record<string, unknown>;
}

export const createMockResponse = (): MockResponse => {
    const headers: Record<string, string | number | readonly string[]> = {};
    const locals: Record<string, unknown> = {};

    const res = {
        headers,
        locals,
        headersSent: false,
        setHeader(name: string, value: string | number | readonly string[]) {
            headers[name] = value;
            return res;
        },
        status(statusCode: number) {
            (res as Record<string, unknown>).statusCodeValue = statusCode;
            return res;
        },
        json(body: unknown) {
            (res as Record<string, unknown>).body = body;
            return res;
        },
        end() {
            (res as Record<string, unknown>).ended = true;
            return res;
        },
        send() {
            (res as Record<string, unknown>).ended = true;
            return res;
        },
        once() {
            return res;
        },
        writeHead(statusCode: number) {
            (res as Record<string, unknown>).statusCodeValue = statusCode;
            return res;
        },
    };

    return res as unknown as MockResponse;
};

// ── Session domain factories ─────────────────────────────────────────────

export const createRefreshTokenFamily = (overrides: Partial<RefreshTokenFamily> = {}): RefreshTokenFamily => ({
    familyId: 'family-1',
    userId: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    lastUsedAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-04-01T00:00:00.000Z'),
    userHasMfa: false,
    mfaTrusted: false,
    ...overrides,
});

export const createRefreshToken = (overrides: Partial<RefreshToken> = {}): RefreshToken => ({
    tokenId: 'token-id-1',
    familyId: 'family-1',
    userId: 'user-1',
    tokenHash: 'hash-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
});

export const createSession = (overrides: Partial<Session> = {}): Session => ({
    accessTokenHash: 'access-hash',
    userId: 'user-1',
    refreshTokenFamilyId: 'family-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-01-01T00:15:00.000Z'),
    ...overrides,
});

// ── Firestore Timestamp-like helper ──────────────────────────────────────

/** Creates an object with toDate() that survives JSON.stringify/parse (for fake firestore). */
export const ts = (date: Date): { toDate: () => Date } => ({
    toDate: () => date,
});
