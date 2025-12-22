/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],

  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
    '**/tests/**/*.test.ts',
    '**/tests/**/*.test.tsx',
  ],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1', // Handle .js -> .ts/.tsx imports
  },

  // Transform ESM packages from node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(ink-testing-library|ink|cli-truncate|string-width|strip-ansi|ansi-regex|ansi-styles|wrap-ansi|slice-ansi|emoji-regex)/)',
  ],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          jsx: 'react',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },

  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/index.tsx',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    // Per-path thresholds for modules that meet the 85% standard
    // Global threshold will be enforced once overall coverage improves
    // Note: branches threshold lowered from 80 to 78 due to Jest 30 coverage calculation changes
    'src/model/**/*.ts': {
      branches: 78,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    'src/config/**/*.ts': {
      branches: 45, // types.ts has unavoidable V8-specific branch (Error.captureStackTrace)
      functions: 75, // provider wizards have env detection code that's hard to test in ESM
      lines: 75,
      statements: 75,
    },
    'src/tools/**/*.ts': {
      branches: 78,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },

  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  testTimeout: 10000,
  verbose: true,

  // Force exit after tests complete to avoid "worker process failed to exit" warnings
  forceExit: true,
};
