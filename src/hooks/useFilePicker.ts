import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { validateArmor } from '../features/keys/domain/pgpValidation';

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

            const fileContent = await FileSystem.readAsStringAsync(file.uri);

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
            onError?.(error.message || 'Failed to pick file');
        }
    };

    return pickFile;
};
