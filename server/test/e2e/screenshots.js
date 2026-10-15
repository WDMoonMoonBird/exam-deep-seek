import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { E2E_CLIENT_BASE } from './e2e-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../../client/public/doc-img');

const BASE = E2E_CLIENT_BASE + '/exam';   // ★W1-C6：端口可配置（默认 5173 不变）
// ★W2-C15：口令唯一事实源（setup-test-data.js 建号后经 H6 首登改密得到的已知口令）
import { E2E_SEED_TEACHER as T } from './e2e-accounts.js';

async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage });
  console.log(`  ✅ ${name}.png`);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu', '--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // ====== 1. 登录页 ======
  console.log('\n📷 截图开始...\n');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '01-login');

  // ====== 登录 ======
  await page.locator('.ant-input').first().fill(T.username);
  await page.locator('input[type="password"]').fill(T.password);
  await page.locator('.ant-btn-primary').click();
  await page.waitForURL('**/teacher/**', { timeout: 10000 });
  await page.waitForTimeout(800);

  // ====== 2. 班级管理 ======
  await page.goto(`${BASE}/teacher/classes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '02-classes');

  // ====== 3. 新增班级模态框 ======
  await page.locator('button').filter({ hasText: '新增班级' }).click();
  await page.waitForSelector('.ant-modal', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('.ant-modal input').first().fill('测试班级');
  await shot(page, '03-class-add');

  // 关闭模态框
  await page.locator('.ant-modal .ant-modal-close').click();
  await page.waitForTimeout(300);

  // ====== 4. 学生管理 ======
  await page.goto(`${BASE}/teacher/students`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // 选择班级
  const classSelect = page.locator('.ant-select').first();
  await classSelect.click();
  await page.waitForTimeout(500);
  const firstOption = page.locator('.ant-select-item-option').first();
  if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstOption.click();
    await page.waitForTimeout(1500);
  }
  await shot(page, '04-students');

  // ====== 5. 批量导入模态框 ======
  const importBtn = page.locator('button').filter({ hasText: '批量导入' });
  if (await importBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await importBtn.click();
    await page.waitForSelector('.ant-modal', { timeout: 3000 });
    await page.waitForTimeout(500);
    await shot(page, '05-import-modal');
    await page.locator('.ant-modal .ant-modal-close').click();
    await page.waitForTimeout(300);
  }

  // ====== 6. 教学团队列表 ======
  await page.goto(`${BASE}/teacher/teams`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '06-teams');

  // ====== 7. 团队详情（教师管理） ======
  const mgmtBtn = page.locator('button').filter({ hasText: '管理' }).first();
  if (await mgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await mgmtBtn.click();
    await page.waitForTimeout(2000);
    await shot(page, '07-team-detail');

    // 切到班级管理标签
    await page.locator('.ant-tabs-tab').filter({ hasText: '班级管理' }).click();
    await page.waitForTimeout(1000);
    await shot(page, '07-team-classes');
  }

  // ====== 8. 题库管理 ======
  await page.goto(`${BASE}/teacher/questions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '08-questions');

  // ====== 9. 题目编辑 ======
  await page.goto(`${BASE}/teacher/questions/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('input[placeholder="大题标题"]').fill('测试题目 1');
  await shot(page, '09-question-edit');

  // ====== 10. 作业管理 ======
  await page.goto(`${BASE}/teacher/assignments`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '10-assignments');

  // ====== 11. 布置作业 — 选班步骤 ======
  const createBtn = page.locator('button').filter({ hasText: '布置作业' });
  if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createBtn.click();
    await page.waitForTimeout(1000);
    // 下一步到选班
    await page.locator('button').filter({ hasText: '下一步' }).click();
    await page.waitForTimeout(1000);
    await shot(page, '11-assign-classes');

    // 下一步到时间设置
    const nextBtn = page.locator('button').filter({ hasText: '下一步' });
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
      // 填写标题
      const titleInput = page.locator('.ant-modal input').first();
      if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await titleInput.fill('测试作业 1');
      }
      await shot(page, '12-assign-time');
    }
  }

  // ====== 13. 评分审核列表 ======
  await page.goto(`${BASE}/teacher/review`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, '13-review');

  // ====== 14. 审核详情页 ======
  // 从审核页选择一个班级进入班级审核，再进入审核详情
  const auditBtn = page.locator('button').filter({ hasText: '审核' }).first();
  if (await auditBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await auditBtn.click();
    await page.waitForTimeout(2000);
    // 如果有已提交的学生，点击审核
    const detailBtn = page.locator('button').filter({ hasText: '审核' }).first();
    if (await detailBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await detailBtn.click();
      await page.waitForTimeout(2000);
      await shot(page, '15-review-detail');
    }
  }

  // ====== 13. 个人信息 ======
  await page.goto(`${BASE}/teacher/classes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  // 点击用户头像下拉
  await page.locator('.user-area').click();
  await page.waitForTimeout(500);
  const profileItem = page.locator('.ant-dropdown-menu-item').filter({ hasText: '我的信息' });
  if (await profileItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    await profileItem.click();
    await page.waitForSelector('.ant-modal', { timeout: 3000 });
    await page.waitForTimeout(500);
    await shot(page, '14-profile');
  }

  console.log('\n✅ 全部截图完成！保存在 client/public/doc-img/');
  await browser.close();
})();
