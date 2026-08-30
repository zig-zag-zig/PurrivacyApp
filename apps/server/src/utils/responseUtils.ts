import { Response } from 'express';

/**
 * Standardized response utility for consistent API responses
 */
export class ResponseUtils {
    /**
     * Send a successful JSON response
     */
    static success(res: Response, data: unknown, statusCode: number = 200): void {
        res.status(statusCode).json(data);
    }

    static successWithRecoveryCodes(
        res: Response,
        data: object,
        statusCode: number = 200,
    ): void {
        ResponseUtils.success(res, {
            ...data,
            ...(res.locals.newRecoveryCodes ? { newRecoveryCodes: res.locals.newRecoveryCodes } : {}),
        }, statusCode);
    }

    /**
     * Send an error response
     */
    static error(
        res: Response,
        message: string,
        statusCode: number = 500,
        details?: Record<string, unknown>,
    ): void {
        res.status(statusCode).json({
            ...details,
            error: message,
        });
    }

    /**
     * Send a bad request (400) response
     */
    static badRequest(res: Response, message: string, details?: Record<string, unknown>): void {
        ResponseUtils.error(res, message, 400, details);
    }

    /**
     * Send a 204 No Content response
     */
    static noContent(res: Response): void {
        res.status(204).send();
    }
}
