import { File, Paths } from 'expo-file-system';

const cacheFile = new File(Paths.cache, 'app-cache.json');
let memoryCache: Record<string, any> = {};
let loadCachePromise: Promise<void> | null = null;

async function loadCache() {
    try {
        if (!cacheFile.exists) {
            memoryCache = {};
            return;
        }

        const data = await cacheFile.text();
        memoryCache = JSON.parse(data);
    } catch {
        memoryCache = {};
    }
}

async function persist() {
    if (!cacheFile.exists) {
        cacheFile.create({ intermediates: true, overwrite: true });
    }

    cacheFile.write(JSON.stringify(memoryCache));
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
