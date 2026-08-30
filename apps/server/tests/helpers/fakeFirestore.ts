/**
 * Lightweight in-memory Firestore mock for unit tests.
 * Supports: collections, documents (get/set/update/delete/create), batch writes,
 * transactions, and simple where queries.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Deep clone that preserves Timestamp-like objects (objects with toDate method)
const isTimestampLike = (value: unknown): boolean =>
    value !== null && typeof value === 'object' && typeof (value as any).toDate === 'function';

const clone = <T>(value: T): T => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (isTimestampLike(value)) return value; // Preserve Timestamp references
    if (Array.isArray(value)) return value.map(clone) as T;
    return Object.fromEntries(
        Object.entries(value as Record<string, any>).map(([k, v]) => [k, clone(v)])
    ) as T;
};

type DocData = Record<string, any> | undefined;

interface StoredDoc {
    exists: boolean;
    data: DocData;
}

export const createFakeFirestore = () => {
    const store: Record<string, Record<string, StoredDoc>> = {};

    const ensureCollection = (name: string) => {
        store[name] ??= {};
    };

    const getDoc = (collection: string, docId: string): StoredDoc => {
        ensureCollection(collection);
        store[collection][docId] ??= { exists: false, data: undefined };
        return store[collection][docId];
    };

    const setDoc = (collection: string, docId: string, data: any): void => {
        ensureCollection(collection);
        store[collection][docId] = { exists: true, data: clone(data) };
    };

    const updateDoc = (collection: string, docId: string, data: any): void => {
        ensureCollection(collection);
        const existing = store[collection][docId];
        if (!existing || !existing.exists) {
            throw new Error(`Document ${collection}/${docId} does not exist`);
        }
        existing.data = { ...existing.data, ...clone(data) };
    };

    const deleteDoc = (collection: string, docId: string): void => {
        ensureCollection(collection);
        store[collection][docId] = { exists: false, data: undefined };
    };

    class FakeDocumentReference {
        readonly id: string;
        readonly _collection: string;

        constructor(collection: string, docId: string) {
            this._collection = collection;
            this.id = docId;
        }

        collection(name: string): FakeCollectionReference {
            return new FakeCollectionReference(`${this._collection}/${this.id}/${name}`);
        }

        async get(): Promise<FakeDocumentSnapshot> {
            return new FakeDocumentSnapshot(this);
        }

        async set(data: any): Promise<void> {
            setDoc(this._collection, this.id, data);
        }

        async create(data: any): Promise<void> {
            const doc = getDoc(this._collection, this.id);
            if (doc.exists) {
                throw new Error(`Document ${this._collection}/${this.id} already exists`);
            }
            setDoc(this._collection, this.id, data);
        }

        async update(data: any): Promise<void> {
            updateDoc(this._collection, this.id, data);
        }

        async delete(): Promise<void> {
            deleteDoc(this._collection, this.id);
        }
    }

    class FakeDocumentSnapshot {
        constructor(private readonly _ref: FakeDocumentReference) { }

        get exists(): boolean {
            return getDoc(this._ref._collection, this._ref.id).exists;
        }

        data(): any {
            return clone(getDoc(this._ref._collection, this._ref.id).data);
        }

        get(field: string): any {
            const doc = getDoc(this._ref._collection, this._ref.id);
            return doc.data ? clone(doc.data[field]) : undefined;
        }

        get ref(): FakeDocumentReference {
            return this._ref;
        }
    }

    class FakeQuerySnapshot {
        readonly docs: FakeDocumentSnapshot[];
        readonly size: number;
        readonly empty: boolean;
        constructor(docs: FakeDocumentSnapshot[]) {
            this.docs = docs;
            this.size = docs.length;
            this.empty = docs.length === 0;
        }
    }

    class FakeQuery {
        private _filters: Array<(data: DocData) => boolean> = [];
        private _limit?: number;

        constructor(readonly _collection: string) { }

        where(field: string, op: string, value: any): FakeQuery {
            const q = new FakeQuery(this._collection);
            q._filters = [...this._filters, (data: DocData) => {
                if (!data) return false;
                const fieldVal = data[field];
                // Unwrap Timestamp-like objects for comparison (Firestore does this)
                const cmp = isTimestampLike(fieldVal) ? fieldVal.toDate() : fieldVal;
                switch (op) {
                    case '==': return cmp === value;
                    case '!=': return cmp !== value;
                    case '<': return cmp < value;
                    case '<=': return cmp <= value;
                    case '>': return cmp > value;
                    case '>=': return cmp >= value;
                    default: return true;
                }
            }];
            q._limit = this._limit;
            return q;
        }

        limit(n: number): FakeQuery {
            const q = new FakeQuery(this._collection);
            q._filters = [...this._filters];
            q._limit = n;
            return q;
        }

        async get(): Promise<FakeQuerySnapshot> {
            ensureCollection(this._collection);
            const entries = Object.entries(store[this._collection]);
            const filtered = entries.filter(([, doc]) => {
                if (!doc.exists) return false;
                return this._filters.every(f => f(doc.data));
            });
            const limited = this._limit !== undefined ? filtered.slice(0, this._limit) : filtered;
            return new FakeQuerySnapshot(
                limited.map(([docId]) => new FakeDocumentSnapshot(
                    new FakeDocumentReference(this._collection, docId),
                )),
            );
        }
    }

    class FakeCollectionReference extends FakeQuery {
        doc(docId?: string): FakeDocumentReference {
            return new FakeDocumentReference(this._collection, docId ?? `auto-${++autoIdCounter}`);
        }
    }

    let autoIdCounter = 0;

    class FakeTransaction {
        private _buffer: Array<() => void> = [];

        async get(ref: FakeDocumentReference): Promise<FakeDocumentSnapshot> {
            return ref.get();
        }

        set(ref: FakeDocumentReference, data: any): void {
            this._buffer.push(() => setDoc(ref._collection, ref.id, data));
        }

        update(ref: FakeDocumentReference, data: any): void {
            this._buffer.push(() => {
                const cleaned = { ...data };
                for (const [key, val] of Object.entries(cleaned)) {
                    if (val && typeof val === 'object' && '_methodName' in (val as any) && (val as any)._methodName === 'delete') {
                        const doc = getDoc(ref._collection, ref.id);
                        if (doc.data) {
                            delete doc.data[key];
                        }
                        delete cleaned[key];
                    }
                }
                if (Object.keys(cleaned).length > 0) {
                    updateDoc(ref._collection, ref.id, cleaned);
                }
            });
        }

        delete(ref: FakeDocumentReference): void {
            this._buffer.push(() => deleteDoc(ref._collection, ref.id));
        }

        _commit(): void {
            this._buffer.forEach(fn => fn());
            this._buffer = [];
        }
    }

    class FakeWriteBatch {
        private _ops: Array<() => void> = [];

        set(ref: FakeDocumentReference, data: any): FakeWriteBatch {
            this._ops.push(() => setDoc(ref._collection, ref.id, data));
            return this;
        }

        update(ref: FakeDocumentReference, data: any): FakeWriteBatch {
            this._ops.push(() => updateDoc(ref._collection, ref.id, data));
            return this;
        }

        delete(ref: FakeDocumentReference): FakeWriteBatch {
            this._ops.push(() => deleteDoc(ref._collection, ref.id));
            return this;
        }

        async commit(): Promise<void> {
            this._ops.forEach(fn => fn());
            this._ops = [];
        }
    }

    const db = {
        collection(name: string): FakeCollectionReference {
            return new FakeCollectionReference(name);
        },
        batch(): FakeWriteBatch {
            return new FakeWriteBatch();
        },
        async getAll(
            ...args: [FakeDocumentReference, ...FakeDocumentReference[]] | [FakeDocumentReference[], { fieldMask?: string[] }]
        ): Promise<FakeDocumentSnapshot[]> {
            if (Array.isArray(args[0])) {
                const refs = args[0] as FakeDocumentReference[];
                return Promise.resolve(refs.map(ref => new FakeDocumentSnapshot(ref)));
            }
            const refs = args as FakeDocumentReference[];
            return Promise.resolve(refs.map(ref => new FakeDocumentSnapshot(ref)));
        },
        async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
            const tx = new FakeTransaction();
            const result = await fn(tx);
            tx._commit();
            return result;
        },
    };

    return {
        db,
        store,
        reset: (): void => {
            for (const key of Object.keys(store)) {
                delete store[key];
            }
            autoIdCounter = 0;
        },
    };
};
