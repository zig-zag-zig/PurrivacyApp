/**
 * Utility to extract a display name from a PGP userId string.
 * Example: "John Doe <john@example.com>" → "John Doe"
 */

const processEmailMatch = (userId: string, email: string, matchStart: number, matchEnd: number): string => {
    const beforeEmail = userId.slice(0, matchStart).trim();
    const afterEmail = userId.slice(matchEnd).trim();

    if (beforeEmail) {
        const nameWithoutComment = beforeEmail.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (nameWithoutComment) {
            return nameWithoutComment;
        }
    }

    if (afterEmail) {
        const nameWithoutComment = afterEmail.replace(/^\s*\([^)]*\)\s*/, '').trim();
        if (nameWithoutComment) {
            return nameWithoutComment;
        }
    }

    return email;
};

export const getDisplayName = (userId: string): string => {
    const trimmed = userId.trim();
    if (!trimmed) return '';

    const angleBracketsMatch = trimmed.match(/<([^>]+)>/);
    if (angleBracketsMatch) {
        const email = angleBracketsMatch[1].trim();
        // afterEmail must start past the WHOLE "<email>" match (brackets
        // included), not past the capture group — otherwise the slice lands one
        // char early and the last email letter leaks into the result.
        const matchStart = angleBracketsMatch.index!;
        const matchEnd = matchStart + angleBracketsMatch[0].length;
        return processEmailMatch(trimmed, email, matchStart, matchEnd);
    }

    const emailRegex = /(\S+@\S+\.\S+)/;
    const emailMatch = trimmed.match(emailRegex);
    if (emailMatch) {
        const email = emailMatch[1].trim();
        const matchStart = emailMatch.index!;
        const matchEnd = matchStart + email.length;
        return processEmailMatch(trimmed, email, matchStart, matchEnd);
    }

    const withoutStartComment = trimmed.replace(/^\s*\([^)]*\)\s*/, '').trim();
    const withoutEndComment = withoutStartComment.replace(/\s*\([^)]*\)\s*$/, '').trim();

    if (!withoutEndComment) {
        const withoutParentheses = trimmed.replace(/^\((.*)\)$/, '$1').trim();
        return withoutParentheses || trimmed;
    }

    return withoutEndComment;
};