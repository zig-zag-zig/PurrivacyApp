import { describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => {
    const entries = new Set<string>();
    const directories = new Set<string>();

    class MockFile {
        readonly uri: string;

        constructor(...parts: Array<string | { uri: string }>) {
            this.uri = parts.map(part => (typeof part === 'string' ? part : part.uri)).join('/');
        }

        get name(): string {
            return this.uri.split('/').pop() ?? '';
        }

        get exists(): boolean {
            return entries.has(this.uri);
        }

        delete(): void {
            entries.delete(this.uri);
        }
    }

    class MockDirectory {
        readonly uri: string;

        constructor(...parts: Array<string | { uri: string }>) {
            this.uri = parts.map(part => (typeof part === 'string' ? part : part.uri)).join('/');
        }

        get name(): string {
            return this.uri.split('/').pop() ?? '';
        }

        get exists(): boolean {
            return entries.has(this.uri);
        }

        list(): Array<MockFile | MockDirectory> {
            const prefix = `${this.uri.replace(/\/$/, '')}/`;
            return Array.from(entries.keys())
                .filter(uri => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/'))
                .map(uri => (directories.has(uri) ? new MockDirectory(uri) : new MockFile(uri)));
        }

        delete(): void {
            for (const uri of Array.from(entries)) {
                if (uri === this.uri || uri.startsWith(`${this.uri}/`)) {
                    entries.delete(uri);
                    directories.delete(uri);
                }
            }
        }
    }

    const seed = (uri: string, isDirectory = false) => {
        entries.add(uri);
        if (isDirectory) directories.add(uri);
    };

    const reset = () => {
        entries.clear();
        directories.clear();
        seed('file:///cache/', true);
    };

    return { entries, directories, MockFile, MockDirectory, seed, reset };
});

vi.mock('expo-file-system', () => ({
    Paths: { cache: new fsMock.MockDirectory('file:///cache/') },
    File: fsMock.MockFile,
    Directory: fsMock.MockDirectory,
}));

import { deleteCachedFile, isCacheUri, purgeFileCryptoCaches } from './fileCacheCleanup';

describe('fileCacheCleanup', () => {
    it('recognizes only app-cache URIs', () => {
        expect(isCacheUri('file:///cache/purrivacy-op-test.pgp')).toBe(true);
        expect(isCacheUri('file:///cache/DocumentPicker/picked.txt')).toBe(true);
        expect(isCacheUri('file:///cache/../secrets.txt')).toBe(false);
        expect(isCacheUri('content://downloads/purrivacy-op-test.pgp')).toBe(false);
        expect(isCacheUri('file:///storage/emulated/0/Download/purrivacy-op-test.pgp')).toBe(false);
    });

    it('deletes a cached file but never a Downloads/content URI', () => {
        fsMock.reset();
        fsMock.seed('file:///cache/purrivacy-op-test.pgp');
        fsMock.seed('content://downloads/purrivacy-op-test.pgp');

        deleteCachedFile('file:///cache/purrivacy-op-test.pgp');
        deleteCachedFile('content://downloads/purrivacy-op-test.pgp');

        expect(fsMock.entries.has('file:///cache/purrivacy-op-test.pgp')).toBe(false);
        expect(fsMock.entries.has('content://downloads/purrivacy-op-test.pgp')).toBe(true);
    });

    it('purges picker copies, file-crypto outputs, and e2e files only', () => {
        fsMock.reset();
        fsMock.seed('file:///cache/DocumentPicker', true);
        fsMock.seed('file:///cache/DocumentPicker/picked.txt');
        fsMock.seed('file:///cache/purrivacy-op-out.pgp');
        fsMock.seed('file:///cache/e2e-test-1024.bin');
        fsMock.seed('file:///cache/unrelated.bin');

        purgeFileCryptoCaches();

        expect(fsMock.entries.has('file:///cache/DocumentPicker')).toBe(false);
        expect(fsMock.entries.has('file:///cache/DocumentPicker/picked.txt')).toBe(false);
        expect(fsMock.entries.has('file:///cache/purrivacy-op-out.pgp')).toBe(false);
        expect(fsMock.entries.has('file:///cache/e2e-test-1024.bin')).toBe(false);
        expect(fsMock.entries.has('file:///cache/unrelated.bin')).toBe(true);
    });
});