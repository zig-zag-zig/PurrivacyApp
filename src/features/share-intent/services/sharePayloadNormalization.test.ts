import { describe, expect, it } from 'vitest';
import type { SharePayload } from 'expo-sharing';

import { normalizeSharePayloads } from './sharePayloadNormalization';

const payload = (value: string, shareType: SharePayload['shareType'], mimeType = 'text/plain'): SharePayload => ({
    value,
    shareType,
    mimeType,
});

describe('normalizeSharePayloads', () => {
    it('preserves incoming text while accepting it based on trimmed content', () => {
        expect(normalizeSharePayloads([payload('  hello  ', 'text')])).toEqual({
            text: '  hello  ',
            mimeType: 'text/plain',
            shareType: 'text',
        });
    });

    it('accepts shared urls as text input for app routing', () => {
        expect(normalizeSharePayloads([payload('https://example.com', 'url', 'text/uri-list')])).toEqual({
            text: 'https://example.com',
            mimeType: 'text/uri-list',
            shareType: 'url',
        });
    });

    it('ignores blank and non-text payloads', () => {
        expect(normalizeSharePayloads([
            payload('   ', 'text'),
            payload('file:///tmp/image.png', 'image', 'image/png'),
        ])).toEqual({});
    });
});
