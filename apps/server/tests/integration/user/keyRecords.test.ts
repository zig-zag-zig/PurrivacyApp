/**
 * Integration test: Key record CRUD through public API.
 */
import type { Server } from 'http';
import { startServer, stopServer, requestJson, createApiUserSession, encryptedBase } from '../helpers';

describe('Key Records API', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        ({ server, baseUrl } = await startServer());
    });

    afterAll(async () => {
        await stopServer(server);
    });

    it('creates a user and manages RTDB-generated key records through public APIs', async () => {
        const { session } = await createApiUserSession(baseUrl);

        const recordsResponse = await requestJson(baseUrl, 'GET', '/user/key-records', session.accessToken);
        expect(recordsResponse.status).toBe(200);
        const records = await recordsResponse.json() as { keys: Array<{ recordId: string }> };
        expect(records.keys).toHaveLength(2);
        expect(records.keys.map(record => record.recordId)).toEqual([
            expect.any(String),
            expect.any(String),
        ]);

        const addedKey = encryptedBase('third-key');
        const addResponse = await requestJson(baseUrl, 'POST', '/user/key-records', session.accessToken, { key: addedKey });
        expect(addResponse.status).toBe(201);
        const added = await addResponse.json() as { recordId: string };
        expect(added.recordId).toEqual(expect.any(String));
        expect(records.keys.map(record => record.recordId)).not.toContain(added.recordId);

        const replacementKey = encryptedBase('updated-third-key');
        const updateResponse = await requestJson(
            baseUrl, 'PUT',
            `/user/key-records/${encodeURIComponent(added.recordId)}`,
            session.accessToken,
            { key: replacementKey },
        );
        expect(updateResponse.status).toBe(200);
        await expect(updateResponse.json()).resolves.toMatchObject({
            recordId: added.recordId,
            encryptedData: replacementKey.encryptedData,
        });

        const deleteResponse = await requestJson(
            baseUrl, 'DELETE',
            `/user/key-records/${encodeURIComponent(added.recordId)}`,
            session.accessToken,
        );
        expect(deleteResponse.status).toBe(204);

        const finalRecordsResponse = await requestJson(baseUrl, 'GET', '/user/key-records', session.accessToken);
        expect(finalRecordsResponse.status).toBe(200);
        const finalRecords = await finalRecordsResponse.json() as { keys: Array<{ recordId: string }> };
        expect(finalRecords.keys.map(record => record.recordId)).not.toContain(added.recordId);
        expect(finalRecords.keys).toHaveLength(2);
    });

    it('paginates key records with limit and cursor', async () => {
        const { session } = await createApiUserSession(baseUrl);

        const firstPageResponse = await requestJson(baseUrl, 'GET', '/user/key-records?limit=1', session.accessToken);
        expect(firstPageResponse.status).toBe(200);
        const firstPage = await firstPageResponse.json() as {
            keys: Array<{ recordId: string }>;
            nextCursor?: string;
        };
        expect(firstPage.keys).toHaveLength(1);
        expect(firstPage.nextCursor).toEqual(expect.any(String));

        const secondPageResponse = await requestJson(
            baseUrl, 'GET',
            `/user/key-records?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
            session.accessToken,
        );
        expect(secondPageResponse.status).toBe(200);
        const secondPage = await secondPageResponse.json() as {
            keys: Array<{ recordId: string }>;
            nextCursor?: string;
        };
        expect(secondPage.keys).toHaveLength(1);
        expect(secondPage.keys[0].recordId).not.toBe(firstPage.keys[0].recordId);
        expect(secondPage.nextCursor).toBeUndefined();
    });

    it('rejects an invalid pagination limit', async () => {
        const { session } = await createApiUserSession(baseUrl);

        const response = await requestJson(baseUrl, 'GET', '/user/key-records?limit=0', session.accessToken);
        expect(response.status).toBe(400);
    });
});
