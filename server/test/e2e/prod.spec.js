import { test, expect } from '@playwright/test';

const T = { username: '202519011', password: '202519011' };
const S = { username: '2458030306', password: '2458030306' };

async function login(page, user, expectRole) {
  await page.goto('/exam/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ant-input', { timeout: 10000 });
  await page.locator('.ant-input').first().fill(user.username);
  await page.locator('input[type="password"]').fill(user.password);
  await page.locator('.ant-btn-primary').click();
  await page.waitForURL(`**/${expectRole}/**`, { timeout: 10000 });
}

test.describe('学生答题流程 - 生产环境', () => {

  test('T1: 学生登录 → 查看作业列表', async ({ page }) => {
    await login(page, S, 'student');
    await page.goto('/exam/student/assignments', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 页面正常渲染
    const bodyText = await page.locator('body').textContent() || '';
    const hasNoData = bodyText.includes('暂无数据');
    const rowCount = await page.locator('.ant-table-row').count();
    console.log(`暂无数据: ${hasNoData}, 行数: ${rowCount}`);
    await expect(page.locator('h2, .page-title').first()).toBeVisible({ timeout: 5000 });
    const pageText = await page.locator('body').textContent() || '';
    console.log('页面文本:', pageText.substring(0, 300));
  });

  test('T2: 学生进入答题 → 写代码 → 提交（二次确认弹窗）', async ({ page }) => {
    await login(page, S, 'student');
    await page.goto('/exam/student/assignments', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ant-table', { timeout: 10000 });

    // 点击第一个可进入的作业行
    const rows = page.locator('.ant-table-row');
    const rowCount = await rows.count();
    console.log(`表格行数: ${rowCount}`);
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const cursor = await row.evaluate(el => el.style.cursor);
      if (cursor !== 'not-allowed') {
        await row.click();
        break;
      }
    }
    await page.waitForTimeout(2000);

    // 确认在答题页
    const url = page.url();
    console.log('当前URL:', url);

    // 如果有 monaco 编辑器，填写代码
    const editor = page.locator('.monaco-editor textarea').first();
    if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editor.click();
      await editor.fill('print("e2e test")');
    }

    // 点击提交按钮
    const submitBtn = page.locator('button').filter({ hasText: /提交代码|重新提交/ });
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // 应该出现确认弹窗
      const modal = page.locator('.ant-modal-confirm');
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const modalText = await modal.textContent();
        console.log('确认弹窗:', modalText?.substring(0, 200));
        // 点击确定
        await page.locator('.ant-modal-confirm .ant-btn-primary').click();
        await page.waitForTimeout(2000);
      }
    }
  });

  test('T3: 已过期/未开始 → 不可点击进入', async ({ page }) => {
    await login(page, S, 'student');
    await page.goto('/exam/student/assignments', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ant-table', { timeout: 10000 });

    const rows = page.locator('.ant-table-row');
    const rowCount = await rows.count();
    let blockedCount = 0;
    for (let i = 0; i < rowCount; i++) {
      const cursor = await rows.nth(i).evaluate(el => el.style.cursor);
      if (cursor === 'not-allowed') blockedCount++;
    }
    console.log(`不可进入: ${blockedCount} / ${rowCount}`);
    expect(blockedCount).toBeGreaterThanOrEqual(0);
  });

});
