import { db } from './index';

/**
 * Firestore write batches are limited to 500 operations; we chunk below
 * that limit to leave headroom for additional per-document operations.
 */
export const SAFE_BATCH_CHUNK_SIZE = 400;
const DEFAULT_CLEANUP_PAGE_SIZE = 400;
const DEFAULT_MAX_CLEANUP_PAGES = 10;

/**
 * Delete the given document references in sequential chunks, each committed
 * as its own batch. Idempotent by construction: deleting a missing document
 * is a no-op in Firestore.
 *
 * Returns the number of references handed to the batches.
 */
export const deleteDocumentsInChunks = async (
    refs: FirebaseFirestore.DocumentReference[],
    chunkSize: number = SAFE_BATCH_CHUNK_SIZE,
): Promise<number> => {
    let deletedCount = 0;

    for (let offset = 0; offset < refs.length; offset += chunkSize) {
        const chunk = refs.slice(offset, offset + chunkSize);
        const batch = db.batch();
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
        deletedCount += chunk.length;
    }

    return deletedCount;
};

interface PagedDeleteResult {
    deletedCount: number;
    truncated: boolean;
}

/**
 * Repeatedly run `query.limit(pageSize)` and delete every returned document
 * (optionally filtered in code — used to exclude one refresh-token family
 * without a `!=` query, which would require a composite Firestore index),
 * until the query returns no documents or `maxPages` pages have been
 * processed. Deletions are committed in chunks below the Firestore batch
 * limit, so arbitrarily large result sets can be swept without hitting the
 * 500-write cap.
 *
 * Returns the total number of deleted documents and whether more records may
 * remain (the page budget was exhausted before the query returned empty).
 */
export const deletePagedQueryResults = async (
    query: FirebaseFirestore.Query,
    options: { pageSize?: number; maxPages?: number; filter?: (doc: FirebaseFirestore.DocumentSnapshot) => boolean } = {},
): Promise<PagedDeleteResult> => {
    const pageSize = options.pageSize ?? DEFAULT_CLEANUP_PAGE_SIZE;
    const maxPages = options.maxPages ?? DEFAULT_MAX_CLEANUP_PAGES;
    const { filter } = options;
    let deletedCount = 0;
    let truncated = false;

    for (let page = 0; page < maxPages; page++) {
        const snapshot = await query.limit(pageSize).get();
        if (snapshot.empty) {
            break;
        }

        const refs = (filter ? snapshot.docs.filter(filter) : snapshot.docs).map(doc => doc.ref);
        if (refs.length === 0) {
            // Every document in the window is excluded — nothing left to
            // delete (the window cannot advance past excluded records).
            break;
        }

        deletedCount += await deleteDocumentsInChunks(refs);

        if (snapshot.size < pageSize) {
            break;
        }

        if (page === maxPages - 1) {
            truncated = true;
        }
    }

    return { deletedCount, truncated };
};
