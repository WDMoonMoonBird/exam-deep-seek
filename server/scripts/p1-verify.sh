#!/usr/bin/env bash
# P1 验证：依赖守卫 + 串行测试（unit → 聚焦 suites）
set -e
export PATH=/usr/local/bin:$PATH
export NODE_OPTIONS=--experimental-vm-modules
DB_URL='mysql://root:${DB_PW}@localhost:3306/exam_system_test'
cd server
echo '===== 1. check-layers ====='
node scripts/check-layers.mjs || true
echo '===== 2. unit 全量 ====='
DATABASE_URL="$DB_URL" npm run test:unit 2>&1 | tail -25
echo '===== 3. question + student 聚焦 ====='
DATABASE_URL="$DB_URL" npx jest --config test/jest.config.js --runInBand --forceExit test/integration/question.test.js test/integration/student.test.js 2>&1 | tail -20