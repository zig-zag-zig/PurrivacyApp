/**
 * Integration test: Recovery flow — challenge and token creation.
 */
import type { Server } from 'http';
import { startServer, stopServer, requestJson, createApiUser, createUserPayload, sha256 } from '../helpers';

describe('Recovery Flow', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        ({ server, baseUrl } = await startServer());
    });

    afterAll(async () => {
        await stopServer(server);
    });

    it('creates recovery challenge data and recovery access tokens', async () => {
        const recoveryVerifier = 'a'.repeat(64);
        const recoveryVerifierSalt = '9'.repeat(32);
        const { username } = await createApiUser(
            baseUrl,
            `recover_${Date.now().toString(36)}`,
            createUserPayload({
                recoveryVerifierSalt,
                recoveryVerifierHash: sha256(recoveryVerifier),
            }),
        );

        const challengeResponse = await requestJson(
            baseUrl, 'POST', '/auth/recovery/challenge',
            undefined,
            { username },
        );
        expect(challengeResponse.status).toBe(200);
        await expect(challengeResponse.json()).resolves.toEqual({ recoveryVerifierSalt });

        const tokenResponse = await requestJson(
            baseUrl, 'POST', '/auth/recovery/token',
            undefined,
            { username, recoveryVerifier },
        );
        expect(tokenResponse.status).toBe(200);
        await expect(tokenResponse.json()).resolves.toMatchObject({
            tempToken: expect.any(String),
            userEncrypted: {
                dekSeed: expect.objectContaining({
                    encryptedData: expect.any(String),
                }),
            },
        });
    });
});
