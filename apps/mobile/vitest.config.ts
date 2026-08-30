import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts', 'src/**/*.tsx'],
            exclude: [
                'src/**/*.test.*',
                'src/**/types.ts',
                'src/**/*Types.ts',
                'src/types/types.ts',
                'src/styles/**',
                'src/app/**',
                'src/native/**',
                'src/features/*/pages/**',
                'src/features/*/components/**',
                'src/features/*/hooks/**',
                'src/features/*/state/*Context*',
                'src/hooks/**',
                'src/components/**',
            ],
            thresholds: {
                branches: 46,
                functions: 46,
                lines: 45,
                statements: 45,
            },
        },
    },
});
