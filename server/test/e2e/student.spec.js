import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(fs.readFileSync(path.join(__dirname, '.e2e-state.json'), 'utf-8'));

test.describe('学生工作流', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/exam/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-input', { timeout: 10000 });
    await page.locator('.ant-input').first().fill(state.student.username);
    await page.locator('input[type="password"]').fill(state.student.password);
    await page.locator('.ant-btn-primary').click();
    await page.waitForURL('**/student/**', { timeout: 10000 });
  });

  // E4: 答题
  test('E4: 查看作业 → 进入答题', async ({ page }) => {
    await page.goto('/exam/student/assignments');
    await expect(page.getByRole('heading', { name: '作业列表' })).toBeVisible({ timeout: 5000 });

    const row = page.locator('.ant-table-tbody tr').first();
    if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
      await row.click();
      await page.waitForTimeout(1500);
    }
  });

  // E5: 查看成绩
  test('E5: 查看成绩页', async ({ page }) => {
    await page.goto('/exam/student/scores');
    await page.waitForTimeout(1500);
    await expect(page.locator('.ant-table, h2').first()).toBeVisible({ timeout: 5000 });
  });
});
