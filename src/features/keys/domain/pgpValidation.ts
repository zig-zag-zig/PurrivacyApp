export type PgpArmorType = 'private' | 'public' | 'message' | 'unknown';

const ARMOR_MARKER = (blockType: string) =>
    `-----BEGIN\\s+PGP\\s+${blockType}\\s*-----`;

const END_MARKER = (blockType: string) =>
    `-----END\\s+PGP\\s+${blockType}\\s*-----`;

const isValidBase64 = (str: string): boolean => {
    return /^[A-Za-z0-9+/]+={0,2}$/.test(str) && str.length >= 24;
};

/**
 * Rebuilds collapsed PGP armor (line breaks removed — common when pasting
 * from mail/SMS clients or via automation) into canonical multi-line armor.
 * Returns null when the input is not the requested armor type.
 */
export const normalizeArmor = (
    text: string,
    blockType: 'MESSAGE' | 'PRIVATE KEY BLOCK' | 'PUBLIC KEY BLOCK',
): string | null => {
    if (!text || text.trim() === '') return null;

    const beginRegex = new RegExp(ARMOR_MARKER(blockType), 'i');
    const endRegex = new RegExp(END_MARKER(blockType), 'i');
    const beginMatch = text.match(beginRegex);
    const endMatch = text.match(endRegex);
    if (!beginMatch || !endMatch) return null;

    const begin = beginMatch[0];
    const start = (beginMatch.index ?? 0) + begin.length;
    const end = endMatch.index ?? text.length;
    const between = text.slice(start, end);

    // Separate the CRC24 checksum line (exactly '=' + 4 base64 chars at the
    // very end) from the base64 body, which may itself end with 0-2 '=' pads.
    let body = between.replace(/\s+/g, '');
    let checksum = '';
    const checksumMatch = body.match(/(=)([A-Za-z0-9+/]{4})$/);
    if (checksumMatch) {
        checksum = checksumMatch[0];
        body = body.slice(0, body.length - checksum.length);
    }

    // Wrap the base64 body at 64 columns.
    const wrapped = body.replace(/(.{64})/g, '$1\n').trim();

    return `${begin}\n\n${wrapped}${checksum ? `\n${checksum}` : ''}\n${endMatch[0]}`;
};

export const validateArmor = (
    text: string,
    blockType: 'MESSAGE' | 'PRIVATE KEY BLOCK' | 'PUBLIC KEY BLOCK'
): boolean => {
    if (!text || text.trim() === '') return false;

    const beginRegex = new RegExp(ARMOR_MARKER(blockType), 'i');
    const endRegex = new RegExp(END_MARKER(blockType), 'i');

    const beginMatch = text.match(beginRegex);
    const endMatch = text.match(endRegex);
    if (!beginMatch || !endMatch) return false;

    const start = (beginMatch.index ?? 0) + beginMatch[0].length;
    const end = endMatch.index ?? text.length;
    const between = text.slice(start, end).replace(/\s+/g, '');

    // Drop a trailing CRC24 checksum segment (e.g. "=eWzB") before validating.
    const body = between.replace(/=+[A-Za-z0-9+/]+$/, '');

    return body.length >= 24 && isValidBase64(body);
};

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
