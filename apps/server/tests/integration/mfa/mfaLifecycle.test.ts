/**
 * Integration test: MFA lifecycle — setup, enable, trust, disable.
 *
 * MFA setup requires a fresh-auth nonce (API-SEC-006): mint it first at
 * /auth/session/mfa-setup-nonce, then pass it to /mfa/setup.
 */
import type { Server } from 'http';
import { Secret, TOTP } from 'otpauth';
import {
    startServer,
    stopServer,
    requestJson,
    createApiUserSession,
    db,
    sha256,
} from '../helpers';

describe('MFA Lifecycle', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        ({ server, baseUrl } = await startServer());
    });

    afterAll(async () => {
        await stopServer(server);
    });

    const mintSetupNonce = async (accessToken: string, body?: unknown) => {
        return requestJson(baseUrl, 'POST', '/auth/session/mfa-setup-nonce', accessToken, body);
    };

    const startMfaSetup = async (accessToken: string, body?: unknown) => {
        return requestJson(baseUrl, 'POST', '/mfa/setup', accessToken, body);
    };

    it('enables, trusts, and disables MFA with TOTP codes', async () => {
        const { session } = await createApiUserSession(baseUrl);

        const nonceResponse = await mintSetupNonce(session.accessToken);
        expect(nonceResponse.status).toBe(200);
        const { nonce } = await nonceResponse.json() as { nonce: string; expiresAt: string };
        expect(nonce).toEqual(expect.any(String));

        const setupResponse = await startMfaSetup(session.accessToken, { nonce });
        expect(setupResponse.status).toBe(200);
        const setup = await setupResponse.json() as { secret: string; recoveryCodes: string[] };
        expect(setup.recoveryCodes).toHaveLength(10);

        const mfaCode = new TOTP({ secret: Secret.fromBase32(setup.secret) }).generate();
        const enableResponse = await requestJson(
            baseUrl, 'POST', '/mfa/enable',
            session.accessToken,
            { mfaCode, mfaTrusted: true },
            { 'X-Device-ID': 'mfa-device' },
        );
        expect(enableResponse.status).toBe(200);
        const enabledSession = await enableResponse.json() as { accessToken: string; mfaEnabled: boolean; mfaTrusted: boolean };
        expect(enabledSession).toMatchObject({ mfaEnabled: true, mfaTrusted: true });

        const trustResponse = await requestJson(
            baseUrl, 'POST', '/mfa/session/trust',
            enabledSession.accessToken,
            { mfaCode, mfaTrusted: false },
        );
        expect(trustResponse.status).toBe(200);
        await expect(trustResponse.json()).resolves.toEqual({ mfaTrusted: false });

        const disableResponse = await requestJson(
            baseUrl, 'POST', '/mfa/disable',
            enabledSession.accessToken,
            { mfaCode },
        );
        expect(disableResponse.status).toBe(200);
        await expect(disableResponse.json()).resolves.toMatchObject({
            mfaEnabled: false,
            mfaTrusted: false,
        });
    });

    it('rejects /mfa/setup without a fresh-auth nonce', async () => {
        const { session } = await createApiUserSession(baseUrl);

        const setupResponse = await startMfaSetup(session.accessToken);

        expect(setupResponse.status).toBe(401);
    });

    it('rejects replaying a consumed nonce', async () => {
        const { session } = await createApiUserSession(baseUrl);
        const nonceResponse = await mintSetupNonce(session.accessToken);
        const { nonce } = await nonceResponse.json() as { nonce: string };

        const firstSetup = await startMfaSetup(session.accessToken, { nonce });
        expect(firstSetup.status).toBe(200);

        const replaySetup = await startMfaSetup(session.accessToken, { nonce });
        expect(replaySetup.status).toBe(401);
    });

    it('requires current MFA proof to mint a nonce when the session family is stale', async () => {
        const { session } = await createApiUserSession(baseUrl);

        // Enable MFA first (fresh family mints a nonce and setup issues a secret).
        const nonceResponse = await mintSetupNonce(session.accessToken);
        const { nonce } = await nonceResponse.json() as { nonce: string };
        const setup = await (await startMfaSetup(session.accessToken, { nonce })).json() as { secret: string };
        const secret = Secret.fromBase32(setup.secret);
        const enableResponse = await requestJson(
            baseUrl, 'POST', '/mfa/enable',
            session.accessToken,
            { mfaCode: new TOTP({ secret }).generate(), mfaTrusted: false },
        );
        expect(enableResponse.status).toBe(200);
        const enabledSession = await enableResponse.json() as { accessToken: string };

        // Age the session family beyond the fresh-auth window (10 minutes).
        const sessionDoc = await db.collection('sessions').doc(sha256(enabledSession.accessToken)).get();
        const familyId = sessionDoc.data()!.refreshTokenFamilyId as string;
        await db.collection('refreshTokenFamilies').doc(familyId).update({
            createdAt: new Date(Date.now() - 60 * 60 * 1000),
        });

        // No MFA code -> 403 (sensitive MFA proof required).
        const noCode = await mintSetupNonce(enabledSession.accessToken);
        expect(noCode.status).toBe(403);

        // Valid TOTP code -> 200.
        const withCode = await mintSetupNonce(enabledSession.accessToken, {
            mfaCode: new TOTP({ secret }).generate(),
        });
        expect(withCode.status).toBe(200);
    });
});
