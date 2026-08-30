import { Request, Response, NextFunction } from 'express';

/**
 * Async handler wrapper for Express routes
 * Eliminates need for try-catch blocks in route handlers
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
