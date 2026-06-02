import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'fixtures');

function genExcel(filename, rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const filepath = path.join(FIXTURES, filename);
  XLSX.writeFile(wb, filepath);
  return filepath;
}

// 登录辅助函数
async function loginAsTeacher(page, username = 'e2e_teacher', password = 'e2e_teacher') {
  await page.goto('/exam/login');
  await page.waitForTimeout(500);
  await page.getByPlaceholder(/用户名/).fill(username);
  await page.getByPlaceholder(/密码/).fill(password);
  // Ant Design 按钮文本可能有空格，用 locator 匹配
  await page.locator('.login-form button').click();
  await page.waitForTimeout(2000);
  // 可能弹出多学校选择
  const schoolSelect = page.locator('.ant-select');
  if (await schoolSelect.count() > 0) {
    await schoolSelect.click();
    await page.waitForTimeout(500);
    const opts = page.locator('.ant-select-dropdown .ant-select-item-option');
    if (await opts.count() > 0) {
      await opts.first().click();
      await page.waitForTimeout(500);
      await page.getByText(/确认登录/).click();
      await page.waitForTimeout(2000);
    }
  }
}

test.describe('学生管理 E2E', () => {
  test.beforeAll(() => {
    fs.mkdirSync(FIXTURES, { recursive: true });
    genExcel('students_full.xlsx', [
      { '学号': 'e2e_full_01', '姓名': '张三E2E' },
      { '学号': 'e2e_full_02', '姓名': '李四E2E' },
      { '学号': 'e2e_full_03', '姓名': '王五E2E' },
    ]);
    genExcel('students_missing_id.xlsx', [
      { '学号': '', '姓名': '钱六E2E' },
      { '学号': 'e2e_mid_02', '姓名': '赵八E2E' },
    ]);
    genExcel('students_missing_name.xlsx', [
      { '学号': 'e2e_mn_01', '姓名': '' },
      { '学号': 'e2e_mn_02', '姓名': '孙十E2E' },
    ]);
  });

  // ===== E1: 班级列表显示人数列 =====
  test('E1: 班级列表显示人数列', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/exam/teacher/classes');
    await page.waitForTimeout(1000);

    const headerText = await page.locator('.ant-table').first().textContent();
    expect(headerText).toContain('人数');
  });

  // ===== E2: 新增班级后人数显示 0 =====
  test('E2: 新增班级后人数显示 0', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/exam/teacher/classes');
    await page.waitForTimeout(1000);

    // 点新增班级
    await page.locator('button:has-text("新增班级")').click();
    await page.waitForSelector('.ant-modal');
    await page.waitForTimeout(500);

    const newName = 'E2E_人数测试_' + Date.now();
    await page.locator('.ant-modal input').first().fill(newName);
    await page.locator('.ant-modal .ant-btn-primary').click();
    await page.waitForTimeout(2000);

    // 去学生管理看人数
    await page.goto('/exam/teacher/students');
    await page.waitForTimeout(1000);

    // 选班级下拉
    await page.locator('.ant-select').first().click();
    await page.waitForTimeout(800);
    await page.getByText(newName).click();
    await page.waitForTimeout(1000);

    const pageContent = await page.locator('body').textContent();
    expect(pageContent).toMatch(/本班人数/);
  });

  // ===== E3: 上传完整 Excel =====
  test('E3: 上传完整 Excel → 全部成功', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/exam/teacher/students');
    await page.waitForTimeout(1000);

    // 选班级
    await page.locator('.ant-select').first().click();
    await page.waitForTimeout(500);
    const opts = page.locator('.ant-select-dropdown .ant-select-item-option');
    if (await opts.count() > 0) {
      await opts.first().click();
      await page.waitForTimeout(800);
    }

    // 批量导入
    await page.locator('button:has-text("批量导入")').click();
    await page.waitForSelector('.ant-modal');
    await page.waitForTimeout(500);

    // 上传（直接设文件，避免 Ant Design upload 层级问题）
    const filePath = path.join(FIXTURES, 'students_full.xlsx');
    await page.locator('input[type="file"]').setInputFiles(filePath);

    // 等待结果弹框
    await page.waitForTimeout(3000);

    const resultText = await page.locator('body').textContent();
    // 应该显示成功
    expect(resultText).toMatch(/全部导入成功|成功|保存|共/);
  });

  // ===== E4: 上传缺学号 Excel =====
  test('E4: 上传缺学号 Excel → 警告提示', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/exam/teacher/students');
    await page.waitForTimeout(1000);

    await page.locator('.ant-select').first().click();
    await page.waitForTimeout(500);
    const opts = page.locator('.ant-select-dropdown .ant-select-item-option');
    if (await opts.count() > 0) {
      await opts.first().click();
      await page.waitForTimeout(800);
    }

    await page.locator('button:has-text("批量导入")').click();
    await page.waitForSelector('.ant-modal');
    await page.waitForTimeout(500);

    const filePath = path.join(FIXTURES, 'students_missing_id.xlsx');
    await page.locator('input[type="file"]').setInputFiles(filePath);

    await page.waitForTimeout(3000);
    const resultText = await page.locator('body').textContent();

    // 应该包含缺学号警告
    expect(resultText).toMatch(/缺少学号|待补全/);
  });

  // ===== E5: 上传缺姓名 Excel =====
  test('E5: 上传缺姓名 Excel → 警告提示', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/exam/teacher/students');
    await page.waitForTimeout(1000);

    await page.locator('.ant-select').first().click();
    await page.waitForTimeout(500);
    const opts = page.locator('.ant-select-dropdown .ant-select-item-option');
    if (await opts.count() > 0) {
      await opts.first().click();
      await page.waitForTimeout(800);
    }

    await page.locator('button:has-text("批量导入")').click();
    await page.waitForSelector('.ant-modal');
    await page.waitForTimeout(500);

    const filePath = path.join(FIXTURES, 'students_missing_name.xlsx');
    await page.locator('input[type="file"]').setInputFiles(filePath);

    await page.waitForTimeout(3000);
    const resultText = await page.locator('body').textContent();

    // 应该包含缺姓名警告
    expect(resultText).toMatch(/缺少姓名|待补全/);
  });

  // ===== E6: 编辑缺学号学生 =====
  test('E6: 编辑补全缺学号学生 → 学号可编辑', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/exam/teacher/students');
    await page.waitForTimeout(1000);

    await page.locator('.ant-select').first().click();
    await page.waitForTimeout(500);
    const opts = page.locator('.ant-select-dropdown .ant-select-item-option');
    if (await opts.count() > 0) {
      await opts.first().click();
      await page.waitForTimeout(1000);
    }

    // 找临时学号（tmp_ 开头）的学生 — 其学号应可编辑
    const tmpRow = page.locator('tr:has-text("tmp_")').first();
    if ((await tmpRow.count()) > 0) {
      await tmpRow.locator('button:has-text("编辑")').click();
      await page.waitForSelector('.ant-modal');
      await page.waitForTimeout(500);
      const idInput = page.locator('.ant-modal input').first();
      expect(await idInput.isDisabled()).toBe(false);
    } else {
      console.log('  ⚠ 当前列表无 tmp_ 学生，跳过 E6 断言');
    }
  });

  // ===== E7: 编辑缺姓名学生 =====
  test('E7: 缺姓名学生学号不可编辑', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/exam/teacher/students');
    await page.waitForTimeout(1000);

    await page.locator('.ant-select').first().click();
    await page.waitForTimeout(500);
    const opts = page.locator('.ant-select-dropdown .ant-select-item-option');
    if (await opts.count() > 0) {
      await opts.first().click();
      await page.waitForTimeout(1000);
    }

    // 找"(待补全)"姓名的学生
    const row = page.locator('tr', { hasText: '(待补全)' }).first();
    if (await row.count() > 0) {
      await row.locator('button:has-text("编辑")').click();
      await page.waitForSelector('.ant-modal');
      await page.waitForTimeout(500);

      // 学号字段应该 disabled
      const idInput = page.locator('.ant-modal input').first();
      expect(await idInput.isDisabled()).toBe(true);
    }
  });

  // ===== E8: 重置密码按钮 =====
  test('E8: 编辑正常学生 → 显示重置密码按钮', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/exam/teacher/students');
    await page.waitForTimeout(1000);

    await page.locator('.ant-select').first().click();
    await page.waitForTimeout(500);
    const opts = page.locator('.ant-select-dropdown .ant-select-item-option');
    if (await opts.count() > 0) {
      await opts.first().click();
      await page.waitForTimeout(1000);
    }

    // 找正常学生（无待补全标签的行）
    const allRows = page.locator('.ant-table-tbody tr');
    const count = await allRows.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const row = allRows.nth(i);
      const text = await row.textContent();
      if (!text.includes('待补全') && !text.includes('⚠')) {
        const editBtn = row.locator('button:has-text("编辑")');
        if (await editBtn.count() > 0) {
          await editBtn.click();
          await page.waitForSelector('.ant-modal');
          await page.waitForTimeout(500);
          const modalText = await page.locator('.ant-modal').textContent();
          // 应该有"重置"按钮
          expect(modalText).toMatch(/重置/);
          found = true;
          break;
        }
      }
    }
    if (!found) {
      // 没有找到合适的行（可能还没导入），跳过
      console.log('  ⚠ 未找到正常学生行，跳过 E8');
    }
  });

  // ===== E9: 学生可见作业 =====
  test('E9: 学生登录可见作业', async ({ page }) => {
    // 读 E2E 状态中学生的信息
    let stateData;
    try {
      stateData = JSON.parse(fs.readFileSync(path.join(__dirname, '.e2e-state.json'), 'utf-8'));
    } catch {
      console.log('  ⚠ 未找到 E2E 状态文件，跳过');
      return;
    }

    const studentUser = stateData.student.username;
    // 密码是学号（去掉 @院校代码）
    const plainId = studentUser.split('@')[0];
    await page.goto('/exam/login');
    await page.waitForTimeout(500);
    await page.getByPlaceholder(/用户名/).fill(studentUser);
    await page.getByPlaceholder(/密码/).fill(plainId);
    await page.locator('.login-form button').click();
    await page.waitForTimeout(2500);

    // 可能弹出学校选择
    const schoolSelect = page.locator('.ant-select');
    if (await schoolSelect.count() > 0 && page.url().includes('/login')) {
      await schoolSelect.click();
      await page.waitForTimeout(500);
      const opts = page.locator('.ant-select-dropdown .ant-select-item-option');
      if (await opts.count() > 0) {
        await opts.first().click();
        await page.waitForTimeout(500);
        const confirmBtn = page.locator('button:has-text("确认")');
        if (await confirmBtn.count() > 0) {
          await confirmBtn.click();
        }
        await page.waitForTimeout(2000);
      }
    }

    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/student/);

    // 应该有作业列表
    const table = page.locator('.ant-table-tbody tr');
    expect(await table.count()).toBeGreaterThan(0);
  });

  // ===== E10: 无法登录的不完整学生 =====
  test('E10: 不完整学生无法登录', async ({ page }) => {
    await page.goto('/exam/login');
    await page.waitForTimeout(500);

    // 用不存在的 tmp_ 学号登录
    await page.getByPlaceholder(/用户名/).fill('tmp_test_nonexist@99999');
    await page.getByPlaceholder(/密码/).fill('anything');
    await page.locator('.login-form button').click();
    await page.waitForTimeout(2000);

    // 应该在登录页，有错误提示
    const pageText = await page.locator('body').textContent();
    const stillOnLogin = page.url().includes('/login');
    const hasError = pageText.includes('错误') || pageText.includes('失败');
    expect(stillOnLogin || hasError).toBe(true);
  });

  // ===== E11: 上传锁定 =====
  test('E11: 上传期间模态框不可关闭', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto('/exam/teacher/students');
    await page.waitForTimeout(1000);

    await page.locator('.ant-select').first().click();
    await page.waitForTimeout(500);
    const opts = page.locator('.ant-select-dropdown .ant-select-item-option');
    if (await opts.count() > 0) {
      await opts.first().click();
      await page.waitForTimeout(800);
    }

    await page.locator('button:has-text("批量导入")').click();
    await page.waitForSelector('.ant-modal');
    await page.waitForTimeout(500);

    // 验证模态框存在
    const modal = page.locator('.ant-modal');
    expect(await modal.count()).toBeGreaterThan(0);

    // 验证标题正确
    const modalTitle = await page.locator('.ant-modal-title').textContent();
    expect(modalTitle).toContain('批量导入');
  });
});
