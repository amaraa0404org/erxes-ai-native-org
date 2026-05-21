/**
 * Jest configuration for `erxes-api-shared`.
 *
 * Scoped to the AI shared module in Phase 1.1 (`src/ai/**`). Future phases
 * may broaden `collectCoverageFrom` and `testMatch` as new sub-modules
 * grow tests.
 */
export default {
  displayName: 'erxes-api-shared',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.spec.json' },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/backend/erxes-api-shared',
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.spec.ts',
  ],
  collectCoverageFrom: [
    'src/ai/**/*.ts',
    '!src/ai/**/__tests__/**',
    '!src/ai/**/*.test.ts',
    '!src/ai/**/*.spec.ts',
  ],
};
