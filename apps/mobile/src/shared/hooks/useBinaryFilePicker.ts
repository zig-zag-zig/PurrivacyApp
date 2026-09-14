import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

export interface PickedBinaryFile {
    /** file:// (or content:// copied to cache) URI of the picked file. */
    uri: string;
    name: string;
    /** Byte size, when the picker reports it. */
    size?: number;
    mimeType?: string;
}

/**
 * Pick a file of any type and return its URI + metadata — for binary
 * encrypt/decrypt, which streams the file rather than reading it as text.
 * Does not read contents; the caller streams from `uri`.
 */
export function useBinaryFilePicker() {
    const pickFile = useCallback(async (): Promise<PickedBinaryFile | null> => {
        const result = await DocumentPicker.getDocumentAsync({
            type: '*/*',
            copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.length) return null;

        const asset = result.assets[0];
        // Copy to cache gives a stable file:// path the stream API can read.
        const file = new File(asset.uri);
        return {
            uri: file.uri,
            name: asset.name ?? 'file',
            size: asset.size,
            mimeType: asset.mimeType,
        };
    }, []);

    return { pickFile };
}
