module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }] },
  collectCoverageFrom: ['lib/**/*.ts', 'lambda/**/*.ts'],
  coverageThreshold: { global: { lines: 70, statements: 70 } },
};
