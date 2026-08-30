import { createFakeFirestore } from '../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}), { virtual: true });

const loadChunked = (): typeof import('../../../../src/infrastructure/firebase/chunkedWrites') => (
    require('../../../../src/infrastructure/firebase/chunkedWrites')
);

describe('chunkedWrites', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    describe('deleteDocumentsInChunks', () => {
        it('deletes refs across multiple batch commits when above the chunk size', async () => {
            const { deleteDocumentsInChunks, SAFE_BATCH_CHUNK_SIZE } = loadChunked();

            fakeFs.store.items = {};
            const refs = Array.from({ length: SAFE_BATCH_CHUNK_SIZE + 150 }, (_, i) => {
                const id = `doc-${i}`;
                fakeFs.store.items[id] = { exists: true, data: { id } };
                return fakeFs.db.collection('items').doc(id);
            });

            const batchSpy = jest.spyOn(fakeFs.db, 'batch');

            const count = await deleteDocumentsInChunks(refs);

            expect(count).toBe(refs.length);
            // 550 refs -> 2 chunks of 400 and 150
            expect(batchSpy).toHaveBeenCalledTimes(2);
            const remaining = Object.values(fakeFs.store.items).filter(doc => doc.exists);
            expect(remaining).toHaveLength(0);
        });

        it('uses a single batch when refs fit in one chunk', async () => {
            const { deleteDocumentsInChunks } = loadChunked();

            fakeFs.store.items = {};
            const refs = Array.from({ length: 10 }, (_, i) => {
                fakeFs.store.items[`doc-${i}`] = { exists: true, data: {} };
                return fakeFs.db.collection('items').doc(`doc-${i}`);
            });

            const batchSpy = jest.spyOn(fakeFs.db, 'batch');

            const count = await deleteDocumentsInChunks(refs);

            expect(count).toBe(10);
            expect(batchSpy).toHaveBeenCalledTimes(1);
        });

        it('returns 0 and creates no batches for an empty ref list', async () => {
            const { deleteDocumentsInChunks } = loadChunked();
            const batchSpy = jest.spyOn(fakeFs.db, 'batch');

            const count = await deleteDocumentsInChunks([]);

            expect(count).toBe(0);
            expect(batchSpy).not.toHaveBeenCalled();
        });
    });

    describe('deletePagedQueryResults', () => {
        it('sweeps more documents than one page in multiple pages and chunked batches', async () => {
            const { deletePagedQueryResults } = loadChunked();

            fakeFs.store.items = {};
            for (let i = 0; i < 950; i++) {
                fakeFs.store.items[`doc-${i}`] = { exists: true, data: { group: 'g1' } };
            }

            const batchSpy = jest.spyOn(fakeFs.db, 'batch');

            const result = await deletePagedQueryResults(
                fakeFs.db.collection('items').where('group', '==', 'g1'),
                { pageSize: 400, maxPages: 10 },
            );

            expect(result.deletedCount).toBe(950);
            expect(result.truncated).toBe(false);
            // 950 docs / 400 per page = 3 pages, each one chunk of <=400
            expect(batchSpy).toHaveBeenCalledTimes(3);
            const remaining = Object.values(fakeFs.store.items).filter(doc => doc.exists);
            expect(remaining).toHaveLength(0);
        });

        it('stops at the page budget and reports truncation', async () => {
            const { deletePagedQueryResults } = loadChunked();

            fakeFs.store.items = {};
            for (let i = 0; i < 25; i++) {
                fakeFs.store.items[`doc-${i}`] = { exists: true, data: { group: 'g1' } };
            }

            const result = await deletePagedQueryResults(
                fakeFs.db.collection('items').where('group', '==', 'g1'),
                { pageSize: 10, maxPages: 2 },
            );

            expect(result.deletedCount).toBe(20);
            expect(result.truncated).toBe(true);
            const remaining = Object.values(fakeFs.store.items).filter(doc => doc.exists);
            expect(remaining).toHaveLength(5);
        });

        it('is resumable: a follow-up run deletes the remaining truncated records', async () => {
            const { deletePagedQueryResults } = loadChunked();

            fakeFs.store.items = {};
            for (let i = 0; i < 25; i++) {
                fakeFs.store.items[`doc-${i}`] = { exists: true, data: { group: 'g1' } };
            }

            const first = await deletePagedQueryResults(
                fakeFs.db.collection('items').where('group', '==', 'g1'),
                { pageSize: 10, maxPages: 2 },
            );
            expect(first.truncated).toBe(true);

            const second = await deletePagedQueryResults(
                fakeFs.db.collection('items').where('group', '==', 'g1'),
                { pageSize: 10, maxPages: 2 },
            );
            expect(second.deletedCount).toBe(5);
            expect(second.truncated).toBe(false);
            const remaining = Object.values(fakeFs.store.items).filter(doc => doc.exists);
            expect(remaining).toHaveLength(0);
        });
    });
});
