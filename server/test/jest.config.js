export default {
  rootDir: '..',
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // setup-env.js 必须排在 setup.js 之前：prisma 客户端在模块求值时读取 DATABASE_URL（连接池上限）
  setupFiles: ['./test/setup-env.js', './test/setup.js'],
  setupFilesAfterEnv: ['./test/setup-after-env.js'],
  testTimeout: 30000,
  testMatch: ['<rootDir>/test/**/*.test.js'],
};
