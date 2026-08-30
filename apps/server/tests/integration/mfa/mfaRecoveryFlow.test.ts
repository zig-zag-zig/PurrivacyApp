/**
 * Integration test: MFA recovery code auto-regeneration at consumption threshold.
 */
import type { Server } from 'http';
import { Secret, TOTP } from 'otpauth';
import { startServer, stopServer, requestJson, createApiUserSession, sha256, db } from '../helpers';

describe('MFA Recovery Flow', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        ({ server, baseUrl } = await startServer());
    });

    afterAll(async () => {
        await stopServer(server);
    });

    it('returns regenerated recovery codes after recovery-code consumption reaches the threshold', async () => {
        const { firebaseUser, session } = await createApiUserSession(baseUrl);
        const nonceResponse = await requestJson(baseUrl, 'POST', '/auth/session/mfa-setup-nonce', session.accessToken);
        expect(nonceResponse.status).toBe(200);
        const { nonce } = await nonceResponse.json() as { nonce: string };
        const setupResponse = await requestJson(baseUrl, 'POST', '/mfa/setup', session.accessToken, { nonce });
        expect(setupResponse.status).toBe(200);
        const setup = await setupResponse.json() as { secret: string; recoveryCodes: string[] };
        const mfaCode = new TOTP({ secret: Secret.fromBase32(setup.secret) }).generate();

        const enableResponse = await requestJson(
            baseUrl, 'POST', '/mfa/enable',
            session.accessToken,
            { mfaCode, mfaTrusted: true },
        );
        const enabledSession = await enableResponse.json() as { accessToken: string };

        await db.collection('users')
            .doc(firebaseUser.localId)
            .collection('security')
            .doc('mfa')
            .update({
                mfaRecoveryCodes: setup.recoveryCodes.slice(0, 3).map(sha256),
            });

        const response = await requestJson(
            baseUrl, 'POST', '/mfa/session/trust',
            enabledSession.accessToken,
            { mfaCode: setup.recoveryCodes[0], mfaTrusted: true },
        );
        expect(response.status).toBe(200);
        const latestResponseBody = await response.json() as Record<string, unknown>;

        expect(latestResponseBody).toMatchObject({
            mfaTrusted: true,
            newRecoveryCodes: expect.arrayContaining([expect.any(String)]),
        });
        expect(latestResponseBody.newRecoveryCodes).toHaveLength(10);
    });
});
