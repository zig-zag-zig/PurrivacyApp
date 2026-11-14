import { describe, expect, it, vi } from 'vitest';

import { runFileBatch } from './fileBatch';

describe('runFileBatch', () => {
    it('runs files sequentially and keeps result order', async () => {
        const events: string[] = [];
        const files = ['a', 'b', 'c'];

        const result = await runFileBatch(files, async (file, index) => {
            events.push(`start:${file}:${index}`);
            await Promise.resolve();
            events.push(`end:${file}`);
            return file.toUpperCase();
        });

        expect(events).toEqual([
            'start:a:0', 'end:a',
            'start:b:1', 'end:b',
            'start:c:2', 'end:c',
        ]);
        expect(result.results).toEqual(['A', 'B', 'C']);
        expect(result.failures).toEqual([]);
    });

    it('continues after a failure and records the file, index, and error', async () => {
        const files = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
        const boom = new Error('boom');

        const result = await runFileBatch(files, async file => {
            if (file.name === 'b') throw boom;
            return file.name;
        });

        expect(result.results).toEqual(['a', 'c']);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]).toMatchObject({ index: 1, error: boom });
        expect(result.failures[0].file).toBe(files[1]);
    });

    it('does not invoke the job for an empty selection', async () => {
        const run = vi.fn();

        const result = await runFileBatch([], run);

        expect(run).not.toHaveBeenCalled();
        expect(result).toEqual({ results: [], failures: [] });
    });
});