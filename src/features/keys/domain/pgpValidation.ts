export type PgpArmorType = 'private' | 'public' | 'message' | 'unknown';

export const validateArmor = (
    text: string,
    blockType: 'MESSAGE' | 'PRIVATE KEY BLOCK' | 'PUBLIC KEY BLOCK'
): boolean => {
    if (!text || text.trim() === '') return false;

    const beginMarker = `-----BEGIN PGP ${blockType}-----`;
    const endMarker = `-----END PGP ${blockType}-----`;

    const lowerText = text.toLowerCase();
    if (
        !lowerText.includes(beginMarker.toLowerCase()) ||
        !lowerText.includes(endMarker.toLowerCase())
    ) {
        return false;
    }

    const start = lowerText.indexOf(beginMarker.toLowerCase()) + beginMarker.length;
    const end = lowerText.indexOf(endMarker.toLowerCase());
    const between = text.slice(start, end);

    return between.split('\n').some(line => {
        const cleanLine = line.trim().replace(/\s/g, '');
        return cleanLine.length > 0 && isValidBase64(cleanLine);
    });
};

const isValidBase64 = (str: string): boolean => {
    return /^[A-Za-z0-9+/]+={0,2}$/.test(str) && str.length >= 24;
}

export const identifyKeyType = (content: string): PgpArmorType => {
    const trimmed = content.trim();

    if (validateArmor(trimmed, 'PRIVATE KEY BLOCK')) {
        return 'private';
    } else if (validateArmor(trimmed, 'PUBLIC KEY BLOCK')) {
        return 'public';
    } else if (validateArmor(trimmed, 'MESSAGE')) {
        return 'message';
    }

    return 'unknown';
};
