import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../../../src/utils/asyncHandler';

const mockReq = {} as Request;
const mockRes = {} as Response;

describe('asyncHandler', () => {
    it('calls the handler and passes through successful result', async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const next = jest.fn() as NextFunction;

        const wrapped = asyncHandler(handler);
        await wrapped(mockReq, mockRes, next);

        expect(handler).toHaveBeenCalledWith(mockReq, mockRes, next);
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards errors to next() when handler rejects', async () => {
        const error = new Error('handler failed');
        const handler = jest.fn().mockRejectedValue(error);
        const next = jest.fn() as NextFunction;

        const wrapped = asyncHandler(handler);
        await wrapped(mockReq, mockRes, next);

        expect(next).toHaveBeenCalledWith(error);
    });

    it('does not call next() on successful handler', async () => {
        const handler = jest.fn().mockResolvedValue({ success: true });
        const next = jest.fn() as NextFunction;

        const wrapped = asyncHandler(handler);
        await wrapped(mockReq, mockRes, next);

        expect(next).not.toHaveBeenCalled();
    });
});
