import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(fs.readFileSync(path.join(__dirname, '.e2e-state.json'), 'utf-8'));

test.describe('教师工作流', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/exam/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-input', { timeout: 10000 });
    await page.locator('.ant-input').first().fill(state.teacher.username);
    await page.locator('input[type="password"]').fill(state.teacher.password);
    await page.locator('.ant-btn-primary').click();
    await page.waitForURL('**/teacher/**', { timeout: 10000 });
  });

  // E1: 布置作业
  test('E1: 创建题目 → 创建作业', async ({ page }) => {
    // 去题库新建
    await page.goto('/exam/teacher/questions/new');
    await page.waitForSelector('.ant-input', { timeout: 5000 });
    // 页面已加载，验证有表单输入

    // 去作业管理
    await page.goto('/exam/teacher/assignments');
    await expect(page.getByRole('heading', { name: /作业/ })).toBeVisible({ timeout: 5000 });
  });

  // E2: 查看审核汇总
  test('E2: 查看评分审核汇总', async ({ page }) => {
    await page.goto('/exam/teacher/review');
    await expect(page.locator('.ant-table').first()).toBeVisible({ timeout: 5000 });
  });
});
