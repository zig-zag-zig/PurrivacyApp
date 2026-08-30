/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  roots: ['<rootDir>/tests/integration'],
  setupFiles: ['<rootDir>/tests/setup.emulator.ts'],
  testEnvironment: 'node',
  testTimeout: 30000,
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
};
