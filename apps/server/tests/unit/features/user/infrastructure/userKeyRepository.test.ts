import { createFakeRealtimeDatabase } from '../../../../helpers/fakeRealtimeDatabase';

const mockRealtimeDatabase = createFakeRealtimeDatabase();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
  rtdb: mockRealtimeDatabase.rtdb,
}), { virtual: true });

const validEncrypted = (suffix: string) => ({
  encryptedData: Buffer.from(`payload-${suffix}`, 'utf8').toString('base64'),
  iv: 'a'.repeat(24),
  tag: 'b'.repeat(32),
});

const encodedUserId = (userId: string): string => Buffer.from(userId, 'utf8').toString('base64url');

type RepositoryModule = typeof import('../../../../../src/features/user/infrastructure/UserKeyRepository');

const loadRepository = (): RepositoryModule => (
  require('../../../../../src/features/user/infrastructure/UserKeyRepository')
);

/**
 * Re-imports the repository (and the env config it reads) with the given
 * process.env overrides so quota behavior can be tested at different limits.
 */
const withEnv = async (
  envOverrides: Record<string, string>,
  run: (repository: RepositoryModule) => Promise<void>,
): Promise<void> => {
  const previousEnv = { ...process.env };
  Object.assign(process.env, envOverrides);
  try {
    jest.resetModules();
    await run(loadRepository());
  } finally {
    process.env = previousEnv;
    jest.resetModules();
  }
};

type SeedItem = ReturnType<typeof validEncrypted> & { updatedAt?: number };

const seedRecordSet = (
  userId: string,
  items: Record<string, SeedItem>,
  updatedAt = 1,
): string => {
  const userPath = encodedUserId(userId);
  mockRealtimeDatabase.data.userKeys = {
    [userPath]: {
      count: Object.keys(items).length,
      items,
      updatedAt,
    },
  };
  return userPath;
};

const seedManyRecords = (userId: string, count: number): void => {
  const items: Record<string, SeedItem> = {};
  for (let index = 1; index <= count; index += 1) {
    const recordId = `r${String(index).padStart(4, '0')}`;
    items[recordId] = { ...validEncrypted(recordId), updatedAt: 1 };
  }
  seedRecordSet(userId, items);
};

describe('UserKeyRepository', () => {
  beforeEach(() => {
    mockRealtimeDatabase.reset();
  });

  it('initializes missing user key storage as an empty record set', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');

    await expect(repository.readUserEncryptedKeyRecordSet('user-1')).resolves.toEqual({ keys: [] });
    expect(mockRealtimeDatabase.data.userKeys[userPath]).toMatchObject({
      count: 0,
      items: {},
    });
  });

  it('adds one key record without rewriting existing items', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');
    const existing = validEncrypted('AA');
    const next = validEncrypted('BB');
    mockRealtimeDatabase.data.userKeys = {
      [userPath]: {
        count: 1,
        items: { existing },
        updatedAt: 1,
      },
    };

    const result = await repository.addUserEncryptedKeyRecord('user-1', next);

    expect(result.recordId).toBe('push-1');
    expect(mockRealtimeDatabase.data.userKeys[userPath].items).toMatchObject({
      existing,
      'push-1': next,
    });
    expect(mockRealtimeDatabase.data.userKeys[userPath].count).toBe(2);
    expect(mockRealtimeDatabase.data.userKeys[userPath].items['push-1'].updatedAt).toEqual(expect.any(Number));
  });

  it('adds a first key record to a missing record set', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');

    const result = await repository.addUserEncryptedKeyRecord('user-1', validEncrypted('first'));

    expect(result.recordId).toBe('push-1');
    expect(mockRealtimeDatabase.data.userKeys[userPath]).toMatchObject({
      count: 1,
      items: { 'push-1': validEncrypted('first') },
    });
  });

  it('rejects adding a key record once the quota is reached', async () => {
    await withEnv({ USER_MAX_KEY_RECORDS: '3' }, async (repository) => {
      const userPath = seedRecordSet('user-1', {
        k1: validEncrypted('1'),
        k2: validEncrypted('2'),
        k3: validEncrypted('3'),
      });

      await expect(
        repository.addUserEncryptedKeyRecord('user-1', validEncrypted('overflow')),
      ).rejects.toThrow('Key record quota exceeded');

      expect(mockRealtimeDatabase.data.userKeys[userPath]).toMatchObject({
        count: 3,
        items: {
          k1: validEncrypted('1'),
          k2: validEncrypted('2'),
          k3: validEncrypted('3'),
        },
      });
      expect(Object.keys(mockRealtimeDatabase.data.userKeys[userPath].items)).toHaveLength(3);
    });
  });

  it('allows adding a key record exactly at the quota boundary', async () => {
    await withEnv({ USER_MAX_KEY_RECORDS: '3' }, async (repository) => {
      const userPath = seedRecordSet('user-1', {
        k1: validEncrypted('1'),
        k2: validEncrypted('2'),
      });

      await expect(
        repository.addUserEncryptedKeyRecord('user-1', validEncrypted('third')),
      ).resolves.toMatchObject({ recordId: 'push-1' });
      expect(mockRealtimeDatabase.data.userKeys[userPath].count).toBe(3);

      await expect(
        repository.addUserEncryptedKeyRecord('user-1', validEncrypted('overflow')),
      ).rejects.toThrow('Key record quota exceeded');
    });
  });

  it('never exceeds the quota under concurrent adds', async () => {
    await withEnv({ USER_MAX_KEY_RECORDS: '5' }, async (repository) => {
      const userPath = encodedUserId('user-1');

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, index) => (
          repository.addUserEncryptedKeyRecord('user-1', validEncrypted(`add-${index}`))
        )),
      );

      const fulfilled = results.filter(result => result.status === 'fulfilled');
      const rejected = results.filter(result => result.status === 'rejected');
      expect(fulfilled).toHaveLength(5);
      expect(rejected).toHaveLength(5);
      for (const result of rejected) {
        expect((result as PromiseRejectedResult).reason).toMatchObject({ message: 'Key record quota exceeded' });
      }

      expect(mockRealtimeDatabase.data.userKeys[userPath].count).toBe(5);
      expect(Object.keys(mockRealtimeDatabase.data.userKeys[userPath].items)).toHaveLength(5);
    });
  });

  it('initializes key records with RTDB-generated record ids', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');
    const first = validEncrypted('AA');
    const second = validEncrypted('BB');

    const records = await repository.initializeUserEncryptedKeyRecords('user-1', [first, second]);

    expect(records).toEqual([
      { recordId: 'push-1', key: first },
      { recordId: 'push-2', key: second },
    ]);
    expect(mockRealtimeDatabase.data.userKeys[userPath]).toMatchObject({
      count: 2,
      items: {
        'push-1': first,
        'push-2': second,
      },
    });
  });

  it('updates exactly one existing key record', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');
    const existing = validEncrypted('AA');
    const other = validEncrypted('BB');
    const replacement = validEncrypted('CC');
    seedRecordSet('user-1', { existing, other });

    await repository.updateUserEncryptedKeyRecord('user-1', 'existing', replacement);

    expect(mockRealtimeDatabase.data.userKeys[userPath].items).toMatchObject({
      existing: replacement,
      other,
    });
    expect(mockRealtimeDatabase.data.userKeys[userPath].count).toBe(2);
  });

  it('recomputes a stale count during updates', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');
    seedRecordSet('user-1', {
      k1: validEncrypted('1'),
      k2: validEncrypted('2'),
    });
    mockRealtimeDatabase.data.userKeys[userPath].count = 99;

    await repository.updateUserEncryptedKeyRecord('user-1', 'k1', validEncrypted('updated'));

    expect(mockRealtimeDatabase.data.userKeys[userPath].count).toBe(2);
  });

  it('rejects updating a missing record and writes nothing', async () => {
    const repository = loadRepository();
    const userPath = seedRecordSet('user-1', { k1: validEncrypted('1') });

    await expect(
      repository.updateUserEncryptedKeyRecord('user-1', 'missing', validEncrypted('x')),
    ).rejects.toThrow('Key record not found');

    expect(mockRealtimeDatabase.data.userKeys[userPath]).toMatchObject({
      count: 1,
      items: { k1: validEncrypted('1') },
    });
  });

  it('rejects updating when no record set exists and does not create one', async () => {
    const repository = loadRepository();

    await expect(
      repository.updateUserEncryptedKeyRecord('user-1', 'k1', validEncrypted('x')),
    ).rejects.toThrow('Key record not found');
    expect(mockRealtimeDatabase.data.userKeys).toBeUndefined();
  });

  it('deletes one key record and decrements the count', async () => {
    const repository = loadRepository();
    const userPath = seedRecordSet('user-1', {
      existing: validEncrypted('AA'),
      other: validEncrypted('BB'),
    });

    await repository.deleteUserEncryptedKeyRecord('user-1', 'existing');

    expect(mockRealtimeDatabase.data.userKeys[userPath].items).toEqual({
      other: validEncrypted('BB'),
    });
    expect(mockRealtimeDatabase.data.userKeys[userPath].count).toBe(1);
  });

  it('rejects deleting a missing record and writes nothing', async () => {
    const repository = loadRepository();
    const userPath = seedRecordSet('user-1', { k1: validEncrypted('1') });

    await expect(
      repository.deleteUserEncryptedKeyRecord('user-1', 'missing'),
    ).rejects.toThrow('Key record not found');

    expect(mockRealtimeDatabase.data.userKeys[userPath]).toMatchObject({
      count: 1,
      items: { k1: validEncrypted('1') },
    });
  });

  it('rejects deleting when no record set exists and does not create one', async () => {
    const repository = loadRepository();

    await expect(
      repository.deleteUserEncryptedKeyRecord('user-1', 'k1'),
    ).rejects.toThrow('Key record not found');
    expect(mockRealtimeDatabase.data.userKeys).toBeUndefined();
  });

  it('paginates records with limit and cursor', async () => {
    const repository = loadRepository();
    seedManyRecords('user-1', 250);

    const firstPage = await repository.readUserEncryptedKeyRecordSet('user-1', { limit: 200 });
    expect(firstPage.keys).toHaveLength(200);
    expect(firstPage.keys[0].recordId).toBe('r0001');
    expect(firstPage.keys[199].recordId).toBe('r0200');
    expect(firstPage.nextCursor).toBe('1:r0200');

    const secondPage = await repository.readUserEncryptedKeyRecordSet('user-1', {
      limit: 200,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.keys).toHaveLength(50);
    expect(secondPage.keys[0].recordId).toBe('r0201');
    expect(secondPage.keys[49].recordId).toBe('r0250');
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it('returns every record when the page size covers the whole set', async () => {
    const repository = loadRepository();
    seedManyRecords('user-1', 3);

    const page = await repository.readUserEncryptedKeyRecordSet('user-1', { limit: 500 });

    expect(page.keys.map(record => record.recordId)).toEqual(['r0001', 'r0002', 'r0003']);
    expect(page.nextCursor).toBeUndefined();
  });

  it('filters records by the since timestamp', async () => {
    const repository = loadRepository();
    seedRecordSet('user-1', {
      old: { ...validEncrypted('old'), updatedAt: 100 },
      middle: { ...validEncrypted('middle'), updatedAt: 200 },
      recent: { ...validEncrypted('recent'), updatedAt: 300 },
    });

    const page = await repository.readUserEncryptedKeyRecordSet('user-1', { since: 200 });

    expect(page.keys.map(record => record.recordId)).toEqual(['middle', 'recent']);
  });

  it('includes legacy records (no metadata) under a since query', async () => {
    const repository = loadRepository();
    seedRecordSet('user-1', {
      legacy: validEncrypted('legacy'),
      recent: { ...validEncrypted('recent'), updatedAt: 500 },
    });

    const page = await repository.readUserEncryptedKeyRecordSet('user-1', { since: 500 });

    expect(page.keys.map(record => record.recordId)).toEqual(['legacy', 'recent']);
  });

  it('resumes after a cursor record that was deleted', async () => {
    const repository = loadRepository();
    seedManyRecords('user-1', 4);

    const firstPage = await repository.readUserEncryptedKeyRecordSet('user-1', { limit: 2 });
    expect(firstPage.keys.map(record => record.recordId)).toEqual(['r0001', 'r0002']);
    expect(firstPage.nextCursor).toBe('1:r0002');

    await repository.deleteUserEncryptedKeyRecord('user-1', 'r0002');

    const secondPage = await repository.readUserEncryptedKeyRecordSet('user-1', {
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.keys.map(record => record.recordId)).toEqual(['r0003', 'r0004']);
  });

  it('rejects an invalid cursor', async () => {
    const repository = loadRepository();
    seedManyRecords('user-1', 3);

    await expect(
      repository.readUserEncryptedKeyRecordSet('user-1', { cursor: 'not-a-cursor' }),
    ).rejects.toThrow();

    await expect(
      repository.readUserEncryptedKeyRecordSet('user-1', { cursor: 'abc:r0001' }),
    ).rejects.toThrow();
  });

  it('rejects a cursor with an invalid record id', async () => {
    const repository = loadRepository();
    seedManyRecords('user-1', 3);

    await expect(
      repository.readUserEncryptedKeyRecordSet('user-1', { cursor: '1:bad.key' }),
    ).rejects.toThrow();
  });

  it('reads all records without metadata for the user document path', async () => {
    const repository = loadRepository();
    const first = validEncrypted('AA');
    const second = validEncrypted('BB');
    seedRecordSet('user-1', {
      existing: { ...first, updatedAt: 1 },
      other: { ...second, updatedAt: 2 },
    });

    await expect(repository.readUserEncryptedKeys('user-1')).resolves.toEqual([first, second]);
  });
});
