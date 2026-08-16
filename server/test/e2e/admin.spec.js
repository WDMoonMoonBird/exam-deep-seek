// ============================================================================
// 管理端 E2E（正式基线补强）— agent-e2e 2026-08-16
// 覆盖：班级管理（新增/编辑/删除）、学生管理（新增）、教师管理（新增/重置密码）
// 定位器铁律：仅使用现有可见文本 / role / class，禁止 data-testid；
//             client/** 只读，本文件不改任何 UI。
// 依赖：global.setup.js 已就绪（admin/***REDACTED***、学校 E2E测试大学）
// 数据：仅写 exam_system_test（由主控以 DATABASE_URL=测试库 串行执行）
// ============================================================================
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(fs.readFileSync(path.join(__dirname, '.e2e-state.json'), 'utf-8'));

const ADMIN = state.admin; // { username: 'admin', password: '***REDACTED***' }
// 学校名动态取自 global.setup 写入的 state（admin 不可创建学校，复用库中第一个）
const SCHOOL_NAME = state.schoolName || 'E2E测试大学';

/** 管理员登录：/exam/login → 跳 /admin */
async function loginAsAdmin(page) {
  await page.goto('/exam/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('.ant-input', { timeout: 10000 });
  await page.locator('.ant-input').first().fill(ADMIN.username);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('.ant-btn-primary').click();
  await page.waitForURL('**/admin/**', { timeout: 10000 });
}

/** 在打开的 antd modal 中选择学校（第一个下拉 = 所属学校） */
async function pickSchoolInModal(page, schoolName = SCHOOL_NAME) {
  await page.locator('.ant-modal .ant-select').first().click();
  const opt = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: schoolName }).first();
  await opt.waitFor({ timeout: 5000 });
  await opt.click();
}

test.describe('管理端 E2E（班级/学生/教师）', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // A1: 班级管理 — 新增 → 列表出现 → 编辑 → 删除
  test('A1: 班级管理 新增/编辑/删除', async ({ page }) => {
    const ts = Date.now();
    const className = `E2E班级${ts}`;
    const editedName = `E2E班级改${ts}`;

    // 进入班级管理
    await page.goto('/exam/admin/classes', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: '班级管理' })).toBeVisible({ timeout: 5000 });

    // 新增班级
    await page.locator('button').filter({ hasText: '新增班级' }).click();
    await page.waitForSelector('.ant-modal', { timeout: 5000 });
    await page.locator('.ant-modal .ant-input').fill(className);
    await pickSchoolInModal(page);
    await page.locator('.ant-modal .ant-btn-primary').click();
    await page.waitForTimeout(1200);

    // 列表出现（getClasses 按 createdAt desc，新班级在首页）
    const newRow = page.locator('.ant-table-row').filter({ hasText: className }).first();
    await expect(newRow).toBeVisible({ timeout: 5000 });
    await expect(newRow).toContainText(SCHOOL_NAME);

    // 编辑名称
    await newRow.locator('button').filter({ hasText: '编辑' }).click();
    await page.waitForSelector('.ant-modal', { timeout: 5000 });
    await page.locator('.ant-modal .ant-input').fill(editedName);
    await page.locator('.ant-modal .ant-btn-primary').click();
    await page.waitForTimeout(1200);
    await expect(page.locator('.ant-table-row').filter({ hasText: editedName }).first()).toBeVisible({ timeout: 5000 });

    // 删除（popconfirm 确定）
    await page.locator('.ant-table-row').filter({ hasText: editedName }).first()
      .locator('button').filter({ hasText: '删除' }).click();
    await page.locator('.ant-popconfirm .ant-btn-primary').click();
    await page.waitForTimeout(1200);
    expect(await page.locator('.ant-table-row').filter({ hasText: editedName }).count()).toBe(0);
  });

  // A2: 学生管理 — 新增学生（学号/姓名），列表出现
  test('A2: 学生管理 新增学生', async ({ page }) => {
    const ts = Date.now();
    const stuNo = `e2e_admin_stu_${ts}`;
    const stuName = `E2E管理端学生${ts}`;

    await page.goto('/exam/admin/students', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: '学生管理' })).toBeVisible({ timeout: 5000 });

    await page.locator('button').filter({ hasText: '新增学生' }).click();
    await page.waitForSelector('.ant-modal', { timeout: 5000 });
    await page.locator('.ant-modal .ant-input').nth(0).fill(stuNo);
    await page.locator('.ant-modal .ant-input').nth(1).fill(stuName);
    await page.locator('.ant-modal .ant-btn-primary').click();
    await page.waitForTimeout(1200);

    const row = page.locator('.ant-table-row').filter({ hasText: stuNo }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await expect(row).toContainText(stuName);
  });

  // A3: 教师管理 — 新增教师（工号/姓名/隶属学校）→ 重置密码
  test('A3: 教师管理 新增教师 + 重置密码', async ({ page }) => {
    const ts = Date.now();
    const tchNo = `e2e_admin_tch_${ts}`;
    const tchName = `E2E管理端教师${ts}`;

    await page.goto('/exam/admin/teachers', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: '教师管理' })).toBeVisible({ timeout: 5000 });

    // 新增教师
    await page.locator('button').filter({ hasText: '新增教师' }).click();
    await page.waitForSelector('.ant-modal', { timeout: 5000 });
    await page.locator('.ant-modal .ant-input').nth(0).fill(tchNo);
    await page.locator('.ant-modal .ant-input').nth(1).fill(tchName);
    await pickSchoolInModal(page); // 隶属学校（placeholder 搜索学校添加）
    await page.locator('.ant-modal .ant-btn-primary').click();
    await page.waitForTimeout(1200);

    const row = page.locator('.ant-table-row').filter({ hasText: tchNo }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await expect(row).toContainText(tchName);

    // 重置密码（popconfirm 确定 → 成功 message）
    await row.locator('button').filter({ hasText: '重置密码' }).click();
    await page.locator('.ant-popconfirm .ant-btn-primary').click();
    await expect(page.locator('.ant-message-success').first()).toBeVisible({ timeout: 5000 });
  });
});
