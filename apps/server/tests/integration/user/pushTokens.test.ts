/**
 * Integration test: Push token save and delete through public API.
 */
import type { Server } from 'http';
import { startServer, stopServer, requestJson, createApiUserSession, encodedRtdbSegment, rtdb } from '../helpers';

describe('Push Tokens', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        ({ server, baseUrl } = await startServer());
    });

    afterAll(async () => {
        await stopServer(server);
    });

    it('saves and deletes Expo push-token assignments through public APIs', async () => {
        const { firebaseUser, session } = await createApiUserSession(baseUrl);
        const deviceId = `device-${Date.now()}`;
        const pushToken = `ExponentPushToken[${Date.now()}]`;

        const saveResponse = await requestJson(
            baseUrl, 'POST', '/user/save-push-token',
            session.accessToken,
            { pushToken },
            { 'X-Device-ID': deviceId },
        );
        expect(saveResponse.status).toBe(204);

        const encodedDeviceId = encodedRtdbSegment(deviceId);
        const encodedPushToken = encodedRtdbSegment(pushToken);
        expect((await rtdb.ref(`userPushDevices/${firebaseUser.localId}/${encodedDeviceId}`).get()).val()).toBe(encodedPushToken);

        const deleteResponse = await requestJson(
            baseUrl, 'POST', '/user/delete-push-token',
            firebaseUser.idToken,
            { pushToken },
        );
        expect(deleteResponse.status).toBe(204);
        expect((await rtdb.ref(`userPushDevices/${firebaseUser.localId}/${encodedDeviceId}`).get()).val()).toBeNull();
    });
});
