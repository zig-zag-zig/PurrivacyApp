type FirestoreDateLike = {
    toDate: () => Date;
};

const hasToDate = (value: unknown): value is FirestoreDateLike => (
    value !== null
    && typeof value === 'object'
    && 'toDate' in value
    && typeof value.toDate === 'function'
);

export const toDate = (value: unknown): Date => {
    return hasToDate(value) ? value.toDate() : value as Date;
};

export const isValidDate = (value: Date | null | undefined): value is Date => {
    return value instanceof Date && !Number.isNaN(value.getTime());
};
