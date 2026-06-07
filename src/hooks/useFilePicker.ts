import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { validateArmor } from '../features/keys/domain/pgpValidation';

const isUserFacingFilePickerError = (message: string): boolean => (
    /^Only .+ files are allowed$/.test(message) ||
    /^Invalid PGP (key|message) format\./.test(message)
);

export const useFilePicker = (
    allowedExtensions: string[] = ['.txt', '.asc', '.pgp', '.gpg'],
    validatePGP?: 'key' | 'message'
) => {
    const pickFile = async (onFilePicked: (content: string) => void, onError?: (msg: string) => void) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    'text/plain',
                    'text/x-asc',
                    'application/pgp',
                    'application/octet-stream',
                ],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];
            const fileExt = file.name?.split('.').pop()?.toLowerCase();

            if (fileExt && !allowedExtensions.includes(`.${fileExt}`)) {
                throw new Error(`Only ${allowedExtensions.join(', ')} files are allowed`);
            }

            const fileContent = await new File(file.uri).text();

            if (validatePGP === 'key') {
                const isValidKey = validateArmor(fileContent, 'PUBLIC KEY BLOCK') ||
                    validateArmor(fileContent, 'PRIVATE KEY BLOCK');
                if (!isValidKey) {
                    throw new Error('Invalid PGP key format. Must include proper armor headers and base64 content');
                }
            }
            else if (validatePGP === 'message') {
                if (!validateArmor(fileContent, 'MESSAGE')) {
                    throw new Error('Invalid PGP message format. Must include armor headers and base64 content');
                }
            }

            onFilePicked(fileContent);
        } catch (error: any) {
            const message = typeof error?.message === 'string' && isUserFacingFilePickerError(error.message)
                ? error.message
                : 'Failed to pick file';
            onError?.(message);
        }
    };

    return pickFile;
};
