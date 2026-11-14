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

interface PickFilesOptions {
    /** Let the system picker select more than one file at a time. */
    multiple?: boolean;
}

const toPickedFile = (asset: DocumentPicker.DocumentPickerAsset): PickedBinaryFile => {
    // Copy to cache gives a stable file:// path the stream API can read.
    const file = new File(asset.uri);
    return {
        uri: file.uri,
        name: asset.name ?? 'file',
        size: asset.size,
        mimeType: asset.mimeType,
    };
};

/**
 * Pick files of any type and return their URIs + metadata — for binary
 * encrypt/decrypt, which streams the files rather than reading them as text.
 * Does not read contents; the caller streams from each `uri`.
 */
export function useBinaryFilePicker() {
    const pickFiles = useCallback(async ({ multiple = false }: PickFilesOptions = {}): Promise<PickedBinaryFile[]> => {
        const result = await DocumentPicker.getDocumentAsync({
            type: '*/*',
            copyToCacheDirectory: true,
            multiple,
        });

        if (result.canceled || !result.assets?.length) return [];

        return result.assets.map(toPickedFile);
    }, []);

    const pickFile = useCallback(async (): Promise<PickedBinaryFile | null> => {
        const files = await pickFiles();
        return files[0] ?? null;
    }, [pickFiles]);

    return { pickFile, pickFiles };
}
