import { Response } from 'express';
import { ResponseUtils } from '../../../src/utils/responseUtils';

describe('ResponseUtils', () => {
    let res: Response;

    beforeEach(() => {
        const state: Record<string, unknown> = {};
        res = {
            locals: {},
            status(code: number) {
                state.statusCode = code;
                return this;
            },
            json(body: unknown) {
                state.body = body;
                return this;
            },
            send() {
                state.sent = true;
                return this;
            },
        } as unknown as Response;

        Object.defineProperty(res, 'statusCode', {
            get: () => state.statusCode as number,
            set: (v: number) => { state.statusCode = v; },
        });
    });

    describe('success', () => {
        it('sends 200 by default', () => {
            ResponseUtils.success(res, { ok: true });
            expect(res.statusCode).toBe(200);
        });

        it('sends custom status code', () => {
            ResponseUtils.success(res, { created: true }, 201);
            expect(res.statusCode).toBe(201);
        });

        it('calls json with the data', () => {
            const jsonSpy = jest.spyOn(res, 'json');
            ResponseUtils.success(res, { foo: 'bar' });
            expect(jsonSpy).toHaveBeenCalledWith({ foo: 'bar' });
        });

        it('does not include recovery codes', () => {
            res.locals.newRecoveryCodes = ['CODE-A'];
            const jsonSpy = jest.spyOn(res, 'json');
            ResponseUtils.success(res, { ok: true });
            expect(jsonSpy).toHaveBeenCalledWith({ ok: true });
        });
    });

    describe('successWithRecoveryCodes', () => {
        it('appends recovery codes when present', () => {
            res.locals.newRecoveryCodes = ['CODE-A'];
            const jsonSpy = jest.spyOn(res, 'json');
            ResponseUtils.successWithRecoveryCodes(res, { ok: true });
            expect(jsonSpy).toHaveBeenCalledWith({ ok: true, newRecoveryCodes: ['CODE-A'] });
        });

        it('does not append recovery codes when absent', () => {
            const jsonSpy = jest.spyOn(res, 'json');
            ResponseUtils.successWithRecoveryCodes(res, { ok: true });
            expect(jsonSpy).toHaveBeenCalledWith({ ok: true });
        });
    });

    describe('error', () => {
        it('sends 500 by default', () => {
            const jsonSpy = jest.spyOn(res, 'json');
            ResponseUtils.error(res, 'Something broke');
            expect(res.statusCode).toBe(500);
            expect(jsonSpy).toHaveBeenCalledWith({ error: 'Something broke' });
        });

        it('sends custom status code', () => {
            ResponseUtils.error(res, 'Not Found', 404);
            expect(res.statusCode).toBe(404);
        });

        it('includes details in response', () => {
            const jsonSpy = jest.spyOn(res, 'json');
            ResponseUtils.error(res, 'Validation failed', 400, { field: 'email' });
            expect(jsonSpy).toHaveBeenCalledWith({
                field: 'email',
                error: 'Validation failed',
            });
        });
    });

    describe('badRequest', () => {
        it('sends 400 with message', () => {
            ResponseUtils.badRequest(res, 'Invalid input');
            expect(res.statusCode).toBe(400);
        });
    });

    describe('noContent', () => {
        it('sends 204', () => {
            const sendSpy = jest.spyOn(res, 'send');
            ResponseUtils.noContent(res);
            expect(res.statusCode).toBe(204);
            expect(sendSpy).toHaveBeenCalled();
        });
    });
});
