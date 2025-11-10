module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'app.js',
    'lib/**/*.js',
    '!node_modules/**',
    '!coverage/**',
    '!__tests__/**'
  ],
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/auth.test.js', // Ignore old test file
    '/__tests__/mocks/',
    '/__tests__/fixtures/'
  ],
  verbose: true
};
