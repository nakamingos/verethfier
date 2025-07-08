module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testMatch: ['**/test/**/*.spec.(ts|js)'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  globalSetup: '<rootDir>/test/live_tests/global-setup.ts',
  globalTeardown: '<rootDir>/test/live_tests/global-teardown.ts',
  testTimeout: 30000, // 30 seconds for database operations
  
  // Clean test output configuration
  silent: false, // Keep false to see important logs, but configure reporters
  verbose: false, // Reduces individual test output
  reporters: [
    'default',
    // Only show summary unless there are failures
  ],
  
  // Suppress console output during tests (except errors)
  setupFiles: ['<rootDir>/test/jest-console-setup.js'],
};
