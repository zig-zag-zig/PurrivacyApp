/**
 * Integration test: Error handling middleware — invalid JSON, missing auth.
 * Tests that don't require the Firebase Auth emulator to be running.
 */
import type { Server } from 'http';
import { startServer, stopServer, requestJson } from '../helpers';

describe('Error Handling', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        ({ server, baseUrl } = await startServer());
    }, 15000);

    afterAll(async () => {
        await stopServer(server);
    }, 15000);

    it('returns 400 for invalid JSON request body', async () => {
        const response = await fetch(`${baseUrl}/user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not valid json',
        });
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: 'Invalid JSON request body',
        });
    }, 10000);

    it('returns 401 for missing auth header on protected routes', async () => {
        const response = await requestJson(baseUrl, 'GET', '/user/key-records', undefined);
        expect(response.status).toBe(401);
    }, 10000);
});
