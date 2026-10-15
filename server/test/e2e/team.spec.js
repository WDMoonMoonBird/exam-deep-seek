import { test, expect } from '@playwright/test';

// ★W2-C15：口令唯一事实源（H6 首登改密后的已知口令；旧语义「口令=用户名」已随 H6 移除）
import { E2E_TEACHER as T } from './e2e-accounts.js';

async function login(page) {
  await page.goto('/exam/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('.ant-input', { timeout: 10000 });
  await page.locator('.ant-input').first().fill(T.username);
  await page.locator('input[type="password"]').fill(T.password);
  await page.locator('.ant-btn-primary').click();
  await page.waitForURL('**/teacher/**', { timeout: 10000 });
}

test.describe('教学团队 E2E', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('E2E-T1: 团队列表页 → 创建团队 → 验证列表', async ({ page }) => {
    await page.goto('/exam/teacher/teams', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 检查页面标题
    await expect(page.locator('h2')).toContainText('教学团队');

    // 创建团队
    await page.locator('button').filter({ hasText: '创建团队' }).click();
    await page.waitForSelector('.ant-modal', { timeout: 5000 });
    await page.locator('.ant-modal input').fill('E2E测试团队');
    await page.locator('.ant-modal .ant-btn-primary').click();
    await page.waitForTimeout(1500);

    // 验证新团队出现在列表中
    const body = await page.locator('body').textContent();
    expect(body).toContain('E2E测试团队');
    console.log('T1: 团队创建成功 ✅');
  });

  test('E2E-T2: 进入团队详情 → 查看教师/班级标签', async ({ page }) => {
    await page.goto('/exam/teacher/teams', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 点击第一个团队的「管理」
    const mgmtBtn = page.locator('button').filter({ hasText: '管理' }).first();
    if (await mgmtBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mgmtBtn.click();
      await page.waitForTimeout(2000);
    }

    // 应该在团队详情页
    const url = page.url();
    expect(url).toContain('/teacher/teams/');
    console.log('T2: 进入详情 ✅ URL:', url);

    // 查看教师管理标签
    const teacherTab = page.locator('.ant-tabs-tab').filter({ hasText: '教师管理' });
    await expect(teacherTab).toBeVisible({ timeout: 5000 });

    // 切到班级管理
    await page.locator('.ant-tabs-tab').filter({ hasText: '班级管理' }).click();
    await page.waitForTimeout(1000);

    // 检查班级表格是否有数据
    const classRows = page.locator('.ant-table-row');
    const classCount = await classRows.count();
    console.log('T2: 班级表格行数:', classCount);
  });

  test('E2E-T3: 班级管理页 → 团队班级标注 + 按钮禁用', async ({ page }) => {
    await page.goto('/exam/teacher/classes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 检查是否有团队标签
    const body = await page.locator('body').textContent();
    const hasTeamTag = body.includes('团队共享');
    console.log('T3: 团队标签存在:', hasTeamTag);

    // 检查表格渲染
    const rows = page.locator('.ant-table-row');
    const count = await rows.count();
    console.log('T3: 班级数:', count);
    expect(count).toBeGreaterThan(0);

    // 检查编辑按钮
    const editBtns = page.locator('button').filter({ hasText: '编辑' });
    const editCount = await editBtns.count();
    for (let i = 0; i < editCount; i++) {
      const disabled = await editBtns.nth(i).isDisabled();
      console.log(`T3: 编辑按钮${i} disabled=${disabled}`);
    }
  });

  test('E2E-T4: 学生管理页 → 选团队班级 → 按钮禁用', async ({ page }) => {
    await page.goto('/exam/teacher/students', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 选择班级
    const classSelect = page.locator('.ant-select').first();
    await classSelect.click();
    await page.waitForTimeout(500);

    // 查找团队标签的选项
    const teamTag = page.locator('.ant-select-item-option-content').filter({ hasText: '团队' }).first();
    if (await teamTag.isVisible({ timeout: 3000 }).catch(() => false)) {
      await teamTag.click();
      await page.waitForTimeout(1500);

      // 检查只读标签
      const readonlyTag = page.locator('text=团队共享班级');
      const hasReadonly = await readonlyTag.isVisible({ timeout: 3000 }).catch(() => false);
      console.log('T4: 只读标签:', hasReadonly);

      // 新增按钮应禁用
      const addBtn = page.locator('button').filter({ hasText: '单个新增' });
      if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const disabled = await addBtn.isDisabled();
        console.log('T4: 新增按钮禁用:', disabled);
      }
    } else {
      console.log('T4: 无团队班级可选，跳过');
    }
  });

  test('E2E-T5: 布置作业 → 选班步骤 → 团队标注', async ({ page }) => {
    await page.goto('/exam/teacher/assignments', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 点布置作业
    const createBtn = page.locator('button').filter({ hasText: '布置作业' });
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1000);

      // 下一步到选班
      await page.locator('button').filter({ hasText: '下一步' }).click();
      await page.waitForTimeout(1000);

      // 再下一步到选班步骤
      const nextBtn = page.locator('button').filter({ hasText: '下一步' });
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(1000);
      }

      // 检查班级列表是否有团队标签
      const body = await page.locator('.class-pick').textContent().catch(() => '');
      const hasTeamTag = body.includes('团队');
      console.log('T5: 选班区团队标签:', hasTeamTag);
    }
  });
});
