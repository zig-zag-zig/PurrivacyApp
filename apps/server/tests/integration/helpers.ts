/**
 * Shared helpers for Firebase emulator integration tests.
 */
import type { Server } from 'http';
import { createHash } from 'crypto';
import * as admin from 'firebase-admin';

// ── Firebase emulator setup ──────────────────────────────────────────────

jest.mock('../../src/infrastructure/firebase', () => require('../helpers/firebaseEmulator'));

export const app = require('../../src/app').default as typeof import('../../src/app').default;
export const { db, rtdb } = require('../../src/infrastructure/firebase') as typeof import('../../src/infrastructure/firebase');
export const AUTH_EMULATOR_ORIGIN = 'http://127.0.0.1:9099';

// ── Test data helpers ────────────────────────────────────────────────────

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
export const encodedRtdbSegment = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

export const encryptedBase = (suffix: string) => ({
    encryptedData: Buffer.from(`payload-${suffix}`, 'utf8').toString('base64'),
    iv: 'a'.repeat(24),
    tag: 'b'.repeat(32),
});

export const encrypted = (suffix: string) => ({
    ...encryptedBase(suffix),
    salt: 'c'.repeat(32),
});

export const createUserPayloadBase = () => ({
    dekPassword: encrypted('dek-password'),
    dekSeed: encrypted('dek-seed'),
    keys: [encryptedBase('first-key'), encryptedBase('second-key')],
    recoveryVerifierSalt: '1'.repeat(32),
    recoveryVerifierHash: '2'.repeat(64),
});

export const createUserPayload = (overrides: Partial<ReturnType<typeof createUserPayloadBase>> = {}) => ({
    ...createUserPayloadBase(),
    ...overrides,
});

// ── Server lifecycle ─────────────────────────────────────────────────────

export const startServer = (): Promise<{ server: Server; baseUrl: string }> => {
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                throw new Error('Expected HTTP server to listen on a TCP port');
            }
            resolve({ server, baseUrl: `http://127.0.0.1:${address.port}/v1` });
        });
    });
};

export const stopServer = async (server: Server): Promise<void> => {
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
    try { rtdb.goOffline(); } catch { /* emulator not connected */ }
    try { await db.terminate(); } catch { /* emulator not connected */ }
    try { await Promise.all(admin.apps.map(firebaseApp => firebaseApp?.delete())); } catch { /* already cleaned up */ }
};

// ── API helpers ──────────────────────────────────────────────────────────

export const requestJson = async (
    baseUrl: string,
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
): Promise<Response> => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
});

// ── User & session factories ─────────────────────────────────────────────

export const createFirebaseUser = async (email: string, password: string): Promise<{ idToken: string; localId: string }> => {
    const response = await fetch(
        `${AUTH_EMULATOR_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
        },
    );
    if (!response.ok) {
        throw new Error(`Failed to create auth emulator user: ${response.status} ${await response.text()}`);
    }
    return await response.json() as { idToken: string; localId: string };
};

export const createApiUser = async (
    baseUrl: string,
    username = `purrivacy-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    payload = createUserPayload(),
) => {
    const firebaseUser = await createFirebaseUser(`${username}@purrivacy.test`, 'test-password-123');
    const createUserResponse = await requestJson(baseUrl, 'POST', '/user', firebaseUser.idToken, { userData: payload });
    expect(createUserResponse.status).toBe(201);
    return { firebaseUser, username };
};

export const createApiUserSession = async (baseUrl: string) => {
    const { firebaseUser, username } = await createApiUser(baseUrl);
    const sessionResponse = await requestJson(
        baseUrl, 'POST', '/auth/session',
        firebaseUser.idToken,
        { label: 'Jest emulator', platform: 'node-test' },
    );
    expect(sessionResponse.status).toBe(200);
    const session = await sessionResponse.json() as { accessToken: string; refreshToken: string };
    expect(session.accessToken).toEqual(expect.any(String));
    expect(session.refreshToken).toEqual(expect.any(String));
    return { firebaseUser, session, username };
};
