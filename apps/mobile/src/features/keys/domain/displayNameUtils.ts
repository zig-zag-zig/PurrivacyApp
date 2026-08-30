/**
 * Utility to extract a display name from a PGP userId string.
 * Example: "John Doe <john@example.com>" → "John Doe"
 */

const processEmailMatch = (userId: string, email: string, matchIndex: number): string => {
    const beforeEmail = userId.slice(0, matchIndex).trim();
    const afterEmail = userId.slice(matchIndex + email.length).trim();

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
        const matchIndex = angleBracketsMatch.index!;
        return processEmailMatch(trimmed, email, matchIndex);
    }

    const emailRegex = /(\S+@\S+\.\S+)/;
    const emailMatch = trimmed.match(emailRegex);
    if (emailMatch) {
        const email = emailMatch[1].trim();
        return processEmailMatch(trimmed, email, emailMatch.index!);
    }

    const withoutStartComment = trimmed.replace(/^\s*\([^)]*\)\s*/, '').trim();
    const withoutEndComment = withoutStartComment.replace(/\s*\([^)]*\)\s*$/, '').trim();

    if (!withoutEndComment) {
        const withoutParentheses = trimmed.replace(/^\((.*)\)$/, '$1').trim();
        return withoutParentheses || trimmed;
    }

    return withoutEndComment;
};