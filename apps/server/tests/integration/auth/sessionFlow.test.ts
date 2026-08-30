/**
 * Integration test: Session flow — creation, refresh, reuse detection, revocation.
 */
import type { Server } from 'http';
import { startServer, stopServer, requestJson, createApiUserSession } from '../helpers';

describe('Session Flow', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        ({ server, baseUrl } = await startServer());
    });

    afterAll(async () => {
        await stopServer(server);
    });

    it('rejects session-authenticated routes without a backend access token', async () => {
        const response = await fetch(`${baseUrl}/user/key-records`, {
            headers: { Authorization: 'Bearer not-a-backend-session' },
        });
        expect(response.status).toBe(401);
    });

    it('rotates refresh tokens and revokes the token family on refresh-token reuse', async () => {
        const { session } = await createApiUserSession(baseUrl);

        const refreshResponse = await requestJson(
            baseUrl, 'POST', '/auth/session/refresh',
            session.accessToken,
            { refreshToken: session.refreshToken },
        );
        expect(refreshResponse.status).toBe(200);
        const refreshed = await refreshResponse.json() as {
            accessToken: string;
            refreshToken: string;
        };
        expect(refreshed.accessToken).toEqual(expect.any(String));
        expect(refreshed.refreshToken).toEqual(expect.any(String));
        expect(refreshed.refreshToken).not.toBe(session.refreshToken);

        const reuseResponse = await requestJson(
            baseUrl, 'POST', '/auth/session/refresh',
            refreshed.accessToken,
            { refreshToken: session.refreshToken },
        );
        expect(reuseResponse.status).toBe(401);
        await expect(reuseResponse.json()).resolves.toMatchObject({
            refreshTokenReuse: true,
            refreshTokenInvalid: true,
        });

        const revokedFamilyResponse = await requestJson(
            baseUrl, 'POST', '/auth/session/refresh',
            refreshed.accessToken,
            { refreshToken: refreshed.refreshToken },
        );
        expect(revokedFamilyResponse.status).toBe(401);
    });
});
