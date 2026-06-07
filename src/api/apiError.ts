export class ApiRequestError extends Error {
    status: number;
    errorData: Record<string, any>;
    requestId?: string;
    isNetworkError: boolean;

    constructor(
        message: string,
        status: number,
        errorData: Record<string, any> = {},
    ) {
        super(message);
        this.name = 'ApiRequestError';
        this.status = status;
        this.errorData = errorData;
        this.requestId = typeof errorData.requestId === 'string' ? errorData.requestId : undefined;
        this.isNetworkError = Boolean(errorData.networkUnavailable);
    }
}
