export default {
  rootDir: '..',
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFiles: ['./test/setup.js'],
  testTimeout: 30000,
  testMatch: ['<rootDir>/test/**/*.test.js'],
};
