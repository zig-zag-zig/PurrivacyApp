import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIPBOARD_SENSITIVITY_TTL_MS, ClipboardSensitivity } from './clipboardSensitivity';
import {
    createSecureClipboardController,
} from './secureClipboardController';

const makeNativeModule = () => ({
    copySecure: vi.fn<(text: string) => void>(),
    clearClipboardIfMatches: vi.fn<(text: string) => void>(),
});

const makeClipboard = () => ({
    setStringAsync: vi.fn<(text: string) => Promise<unknown>>(),
    getStringAsync: vi.fn<() => Promise<string>>(),
});

describe('secure clipboard controller (APP-SEC-005)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('TTL per sensitivity class', () => {
        it.each<[ClipboardSensitivity, number]>([
            ['high', 20_000],
            ['medium', 60_000],
            ['low', 180_000],
        ])('schedules the wipe after %s TTL (%d ms)', async (sensitivity, expectedTtl) => {
            const nativeModule = makeNativeModule();
            const scheduledDelays: number[] = [];
            const controller = createSecureClipboardController({
                platformOS: 'android',
                nativeModule,
                clipboard: makeClipboard(),
                setTimeoutFn: (_handler, timeout) => {
                    scheduledDelays.push(timeout);
                    return 1;
                },
            });

            await controller.secureCopy('material', { sensitivity });

            expect(nativeModule.copySecure).toHaveBeenCalledWith('material');
            expect(scheduledDelays).toEqual([expectedTtl]);
        });

        it('defaults to the high class when sensitivity is unspecified', async () => {
            const nativeModule = makeNativeModule();
            const scheduledDelays: number[] = [];
            const controller = createSecureClipboardController({
                platformOS: 'android',
                nativeModule,
                clipboard: makeClipboard(),
                setTimeoutFn: (_handler, timeout) => {
                    scheduledDelays.push(timeout);
                    return 1;
                },
            });

            await controller.secureCopy('root-secret');

            expect(scheduledDelays).toEqual([CLIPBOARD_SENSITIVITY_TTL_MS.high]);
        });

        it('does not copy empty text', async () => {
            const nativeModule = makeNativeModule();
            const controller = createSecureClipboardController({
                platformOS: 'android',
                nativeModule,
                clipboard: makeClipboard(),
            });

            await controller.secureCopy('');

            expect(nativeModule.copySecure).not.toHaveBeenCalled();
        });
    });

    describe('conditional wipe on Android (native equality check)', () => {
        it('clears via the native module only when the TTL expires', async () => {
            const nativeModule = makeNativeModule();
            const controller = createSecureClipboardController({
                platformOS: 'android',
                nativeModule,
                clipboard: makeClipboard(),
            });

            await controller.secureCopy('seed words', { sensitivity: 'high' });
            vi.advanceTimersByTime(19_999);
            expect(nativeModule.clearClipboardIfMatches).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1);
            expect(nativeModule.clearClipboardIfMatches).toHaveBeenCalledTimes(1);
            expect(nativeModule.clearClipboardIfMatches).toHaveBeenCalledWith('seed words');
        });

        it('passes the exact copied value so the native side never clobbers a newer user copy', async () => {
            const nativeModule = makeNativeModule();
            const controller = createSecureClipboardController({
                platformOS: 'android',
                nativeModule,
                clipboard: makeClipboard(),
            });

            await controller.secureCopy('private-key-material');
            // User copies something else into the clipboard before the TTL fires.
            vi.advanceTimersByTime(20_000);

            expect(nativeModule.clearClipboardIfMatches).toHaveBeenCalledWith('private-key-material');
        });

        it('wipes nothing when no value was copied through the controller', async () => {
            const nativeModule = makeNativeModule();
            const controller = createSecureClipboardController({
                platformOS: 'android',
                nativeModule,
                clipboard: makeClipboard(),
            });

            await controller.wipeClipboard();

            expect(nativeModule.clearClipboardIfMatches).not.toHaveBeenCalled();
        });
    });

    describe('conditional wipe on iOS (read-back comparison)', () => {
        it('clears when the clipboard still holds our value', async () => {
            const clipboard = makeClipboard();
            clipboard.getStringAsync.mockResolvedValue('decrypted message');
            const controller = createSecureClipboardController({
                platformOS: 'ios',
                nativeModule: undefined,
                clipboard,
            });

            await controller.secureCopy('decrypted message', { sensitivity: 'medium' });
            await vi.advanceTimersByTimeAsync(60_000);

            expect(clipboard.getStringAsync).toHaveBeenCalledTimes(1);
            expect(clipboard.setStringAsync).toHaveBeenCalledWith('');
        });

        it('never clobbers a different value the user copied afterwards', async () => {
            const clipboard = makeClipboard();
            clipboard.getStringAsync.mockResolvedValue('something the user copied later');
            const controller = createSecureClipboardController({
                platformOS: 'ios',
                nativeModule: undefined,
                clipboard,
            });

            await controller.secureCopy('decrypted message', { sensitivity: 'medium' });
            clipboard.setStringAsync.mockClear();
            await vi.advanceTimersByTimeAsync(60_000);

            expect(clipboard.setStringAsync).not.toHaveBeenCalled();
        });

        it('does not wipe when the clipboard is unreadable (permission denied)', async () => {
            const clipboard = makeClipboard();
            clipboard.getStringAsync.mockResolvedValue('');
            const controller = createSecureClipboardController({
                platformOS: 'ios',
                nativeModule: undefined,
                clipboard,
            });

            await controller.secureCopy('value', { sensitivity: 'high' });
            clipboard.setStringAsync.mockClear();
            await vi.advanceTimersByTimeAsync(20_000);

            expect(clipboard.setStringAsync).not.toHaveBeenCalled();
        });
    });

    describe('timer management', () => {
        it('resets the TTL when a newer copy replaces an older one', async () => {
            const nativeModule = makeNativeModule();
            const controller = createSecureClipboardController({
                platformOS: 'android',
                nativeModule,
                clipboard: makeClipboard(),
            });

            await controller.secureCopy('first', { sensitivity: 'high' });
            await controller.secureCopy('second', { sensitivity: 'low' });

            // Old high TTL elapsed: the first wipe must not run (timer was reset).
            vi.advanceTimersByTime(20_000);
            expect(nativeModule.clearClipboardIfMatches).not.toHaveBeenCalled();

            // New low TTL elapsed: wipe targets the latest value only.
            vi.advanceTimersByTime(160_000);
            expect(nativeModule.clearClipboardIfMatches).toHaveBeenCalledTimes(1);
            expect(nativeModule.clearClipboardIfMatches).toHaveBeenCalledWith('second');
        });

        it('wipes when returning active after the TTL expired while backgrounded', async () => {
            const nativeModule = makeNativeModule();
            let currentTime = 1_000_000;
            const controller = createSecureClipboardController({
                platformOS: 'android',
                nativeModule,
                clipboard: makeClipboard(),
                now: () => currentTime,
            });

            await controller.secureCopy('secret', { sensitivity: 'high' });

            // Timer suspended in background; TTL passes.
            currentTime += 25_000;
            controller.onAppStateChange('background');
            expect(nativeModule.clearClipboardIfMatches).not.toHaveBeenCalled();

            controller.onAppStateChange('active');
            expect(nativeModule.clearClipboardIfMatches).toHaveBeenCalledWith('secret');

            // A second foreground event must not wipe again (state already cleared).
            controller.onAppStateChange('active');
            expect(nativeModule.clearClipboardIfMatches).toHaveBeenCalledTimes(1);
        });
    });
});
