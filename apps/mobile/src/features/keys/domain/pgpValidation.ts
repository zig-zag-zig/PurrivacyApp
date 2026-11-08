export type PgpArmorType = 'private' | 'public' | 'message' | 'unknown';

const ARMOR_MARKER = (blockType: string) =>
    `-----BEGIN\\s+PGP\\s+${blockType}\\s*-----`;

const END_MARKER = (blockType: string) =>
    `-----END\\s+PGP\\s+${blockType}\\s*-----`;

const isValidBase64 = (str: string): boolean => {
    return /^[A-Za-z0-9+/]+={0,2}$/.test(str) && str.length >= 24;
};

const ARMOR_HEADER_LINE = /^[A-Za-z0-9][A-Za-z0-9-]*:[ \t]*/;
const BASE64_RUN = /[A-Za-z0-9+/]+={0,2}/g;

/**
 * Returns the base64 body of an armor block, dropping optional RFC 4880
 * header lines (`Comment:`, `Version:`, `MessageID:`, ...). Headers are
 * terminated by a blank line, but some producers omit it, so the first
 * non-header line also ends the header section. Fully collapsed pastes (all
 * line breaks stripped) fuse headers to the body; in that case the longest
 * base64-looking run is the body.
 */
const extractArmorBody = (between: string): string => {
    const normalized = between.replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    let index = 0;

    while (index < lines.length && lines[index].trim() === '') index += 1;
    if (index >= lines.length) return '';

    if (!ARMOR_HEADER_LINE.test(lines[index])) {
        return normalized;
    }

    while (index < lines.length) {
        const line = lines[index];
        if (line.trim() === '') {
            index += 1;
            break;
        }
        if (!ARMOR_HEADER_LINE.test(line)) break;
        index += 1;
    }

    const body = lines.slice(index).join('\n');
    if (body.replace(/\s+/g, '').length >= 24) return body;

    const runs = normalized.match(BASE64_RUN) ?? [];
    return runs.reduce((longest, run) => (run.length > longest.length ? run : longest), '');
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
    const between = extractArmorBody(text.slice(start, end));

    // Separate the CRC24 checksum line (exactly '=' + 4 base64 chars at the
    // very end) from the base64 body, which may itself end with 0-2 '=' pads.
    let body = between.replace(/\s+/g, '');
    let checksum = '';
    const checksumMatch = body.match(/(=)([A-Za-z0-9+/]{4})$/);
    if (checksumMatch) {
        checksum = checksumMatch[0];
        body = body.slice(0, body.length - checksum.length);
    }

    // OpenPGP armor base64 must be unpadded: the parser treats any body line
    // containing '=' as the checksum line and rejects the armor otherwise.
    body = body.replace(/=+$/, '');

    // Wrap the base64 body at 64 columns.
    const wrapped = body.replace(/(.{64})/g, '$1\n').trim();

    // Re-emit CANONICAL markers: the matched ones may contain irregular
    // internal whitespace (e.g. "-----BEGIN  PGP MESSAGE-----") that would
    // otherwise survive normalization still unparseable.
    const canonicalBegin = `-----BEGIN PGP ${blockType}-----`;
    const canonicalEnd = `-----END PGP ${blockType}-----`;

    return `${canonicalBegin}\n\n${wrapped}${checksum ? `\n${checksum}` : ''}\n${canonicalEnd}`;
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
    const between = extractArmorBody(text.slice(start, end)).replace(/\s+/g, '');

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
