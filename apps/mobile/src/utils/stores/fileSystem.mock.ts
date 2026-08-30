/**
 * In-memory expo-file-system mock shared by the store tests.
 *
 * Knip is configured to ignore `*.mock.ts` files, so this helper does not
 * pollute the dead-code report. Each test file that mocks expo-file-system
 * with `vi.mock('expo-file-system', () => import('./fileSystem.mock'))` gets
 * its own instance of this module (per test-file module graph), and store
 * tests reset the filesystem with `resetFileSystem()` before each test.
 */

const files = new Map<string, string>();

class Directory {
    uri: string;

    constructor(...parts: Array<string | { uri: string }>) {
        this.uri = parts.map(part => (typeof part === 'string' ? part : part.uri)).join('/');
    }
}

class File {
    uri: string;

    constructor(...parts: Array<string | { uri: string }>) {
        this.uri = parts.map(part => (typeof part === 'string' ? part : part.uri)).join('/');
    }

    get name(): string {
        return this.uri.split('/').pop() ?? '';
    }

    get exists(): boolean {
        return files.has(this.uri);
    }

    async text(): Promise<string> {
        return files.get(this.uri) ?? '';
    }

    create(): void {
        if (!files.has(this.uri)) {
            files.set(this.uri, '');
        }
    }

    write(content: string): void {
        files.set(this.uri, content);
    }

    delete(): void {
        files.delete(this.uri);
    }
}

export const Paths = { cache: new Directory('file:///cache') };
export { Directory, File };

/** Wipe all in-memory files (call between tests). */
export function resetFileSystem(): void {
    files.clear();
}

/** Seed a cache file (name relative to Paths.cache) with raw content. */
export function seedFile(name: string, content: string): void {
    files.set(`file:///cache/${name}`, content);
}

/** Read a cache file's raw content, if present. */
export function readFile(name: string): string | undefined {
    return files.get(`file:///cache/${name}`);
}

/** Whether a cache file exists. */
export function hasFile(name: string): boolean {
    return files.has(`file:///cache/${name}`);
}
