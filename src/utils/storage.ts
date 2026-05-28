import * as FileSystem from 'expo-file-system/legacy';

const path = FileSystem.cacheDirectory + 'app-cache.json';
let memoryCache: Record<string, any> = {};
let loadCachePromise: Promise<void> | null = null;

async function loadCache() {
    try {
        const data = await FileSystem.readAsStringAsync(path);
        memoryCache = JSON.parse(data);
    } catch {
        memoryCache = {};
    }
}

async function persist() {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(memoryCache));
}

async function ensureCacheLoaded() {
    if (!loadCachePromise) {
        loadCachePromise = loadCache();
    }
    await loadCachePromise;
}

export const storage = {
    async getItem(key: string) {
        await ensureCacheLoaded();
        return memoryCache[key] ?? null;
    },
    async setItem(key: string, value: any) {
        await ensureCacheLoaded();
        memoryCache[key] = value;
        await persist();
    },
    async removeItem(key: string) {
        await ensureCacheLoaded();
        delete memoryCache[key];
        await persist();
    },
    async getAllKeys(): Promise<string[]> {
        await ensureCacheLoaded();
        return Object.keys(memoryCache);
    },
    async getItemsByPrefix(prefix: string): Promise<Record<string, any>> {
        await ensureCacheLoaded();
        const result: Record<string, any> = {};
        for (const key of Object.keys(memoryCache)) {
            if (key.startsWith(prefix)) {
                result[key] = memoryCache[key];
            }
        }
        return result;
    },
};

void ensureCacheLoaded();
