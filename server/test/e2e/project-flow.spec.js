// ============================================================================
// 实训项目 E2E（正式基线补强）— agent-e2e 2026-08-16
// 主流程：教师建实训题（上传标准包）→ 布置作业 → 学生提交项目 → 教师审核 → 成绩可见
// 说明：
//   - 本项目选用「实训题」（Question.type=project，挂在 Assignment 下）链路，
//     因为它是唯一端到端可走通的学生提交链路（实训任务 Project 表无学生提交路由，见报告 DSGN）。
//   - 实训题提交不经 AI 评分（gradingWorker 排除 type=project），教师人工审核，
//     因此本流程【不触发真实 DeepSeek 调用】，符合数据/API 隔离铁律。
//   - 定位器铁律：仅使用现有可见文本 / role / class，禁止 data-testid；client/** 只读。
//   - 夹具：server/test/e2e/fixtures/*.zip（标准工程包 / 学生提交）
// ============================================================================
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(fs.readFileSync(path.join(__dirname, '.e2e-state.json'), 'utf-8'));

const TEACHER = state.teacher; // 由 global.setup.js 写入（H6：首登改密后的已知口令，见 e2e-accounts.js；不再是 e2e_teacher/e2e_teacher）
const STUDENT = state.student; // 学生（含 @学校代码 的完整用户名）
const CLASS_NAME = 'E2E测试班';
const STD_ZIP = path.join(__dirname, 'fixtures', 'standard-package.zip');
const SUB_ZIP = path.join(__dirname, 'fixtures', 'student-submission.zip');

const ts = Date.now();
const qTitle = `E2E实训题${ts}`;
const assignmentTitle = `E2E实训作业${ts}`;
const FINAL_SCORE = '85';
const TEACHER_FEEDBACK = 'E2E 教师审核通过，功能完整';

// 跨用例共享（同文件内按顺序执行）
let studentRealName = null;

async function login(page, user, expectRole) {
  await page.goto('/exam/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('.ant-input', { timeout: 10000 });
  await page.locator('.ant-input').first().fill(user.username);
  await page.locator('input[type="password"]').fill(user.password);
  await page.locator('.ant-btn-primary').click();
  await page.waitForURL(`**/${expectRole}/**`, { timeout: 10000 });
}

/** 在已打开的 modal 中选择班级（教师布置作业步骤一） */
async function pickClassItem(page, className) {
  const item = page.locator('.pick-item').filter({ hasText: className }).first();
  await item.waitFor({ timeout: 5000 });
  await item.click();
}

test.describe('实训项目全流程 E2E', () => {
  // ============ P1 教师：新建实训题（上传标准工程包 → 保存） ============
  test('P1: 教师新建实训题（上传标准包）', async ({ page }) => {
    await login(page, TEACHER, 'teacher');
    await page.goto('/exam/teacher/questions/new/project', { waitUntil: 'networkidle' });

    // 阶段一：上传入口
    await page.waitForSelector('.kind-add-btn', { timeout: 15000 });
    await expect(page.getByText('点击上传标准工程包')).toBeVisible({ timeout: 5000 });

    // 上传标准工程包（隐藏 input[type=file]）
    await page.setInputFiles('input[type="file"]', STD_ZIP);
    // 等待前端过滤重打包 + 教师上传服务端拿 tempId
    await expect(page.locator('.ant-message-success').filter({ hasText: '上传成功' }).first())
      .toBeVisible({ timeout: 15000 });
    // 出现文件树（IDE 阶段二）
    await expect(page.locator('.zu-tree, .ant-tree').first()).toBeVisible({ timeout: 10000 });

    // 填写标题（page-header 第一个 input = 标题；满分默认 100、难度默认 medium）
    await page.locator('.page-header input').first().fill(qTitle);
    // antd 两字按钮渲染为「保 存」（自动空格），用正则容忍
    await page.locator('button').filter({ hasText: /保\s*存/ }).click();

    // 保存成功 → 跳回题库列表
    await expect(page.locator('.ant-message-success').filter({ hasText: '创建成功' }).first())
      .toBeVisible({ timeout: 10000 });
    await page.waitForURL('**/teacher/questions', { timeout: 10000 });

    // 题库列表（createdAt desc，新题在首页）出现该实训题 + 类型标签
    const row = page.locator('.ant-table-row').filter({ hasText: qTitle }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await expect(row).toContainText('实训题');
  });

  // ============ P2 教师：布置作业（三步向导） ============
  test('P2: 教师布置实训作业（选题/选班/时间）', async ({ page }) => {
    await login(page, TEACHER, 'teacher');
    await page.goto('/exam/teacher/assignments', { waitUntil: 'networkidle' });
    await page.locator('button').filter({ hasText: '布置作业' }).click();
    await page.waitForSelector('.assign-modal', { timeout: 5000 });

    // 步骤一：选题（搜索并单选）
    await page.locator('.assign-modal input[placeholder="搜索题目"]').fill(qTitle);
    await page.locator('.assign-modal input[placeholder="搜索题目"]').press('Enter');
    const qRow = page.locator('.assign-modal .ant-table-tbody tr').filter({ hasText: qTitle }).first();
    await qRow.waitFor({ timeout: 8000 });
    await qRow.locator('.ant-radio-wrapper').click();
    await page.locator('.assign-modal button').filter({ hasText: '下一步' }).click();

    // 步骤二：选班
    await pickClassItem(page, CLASS_NAME);
    await page.locator('.assign-modal button').filter({ hasText: '下一步' }).click();

    // 步骤三：设置时间（动态起止，start=now-1d, end=now+30d）
    const fmt = (d) => {
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    const start = new Date(Date.now() - 864e5);
    const end = new Date(Date.now() + 30 * 864e5);
    await page.locator('.assign-modal .ant-form-item').filter({ hasText: '作业标题' }).locator('input').fill(assignmentTitle);
    const rangeInputs = page.locator('.assign-modal .ant-picker-range input');
    await rangeInputs.nth(0).fill(fmt(start));
    await rangeInputs.nth(0).press('Enter');
    await rangeInputs.nth(1).fill(fmt(end));
    await rangeInputs.nth(1).press('Enter');
    await page.waitForTimeout(300); // 等待时间面板提交

    await page.locator('.assign-modal button').filter({ hasText: '提交' }).click();
    await expect(page.locator('.ant-message-success').filter({ hasText: '布置成功' }).first())
      .toBeVisible({ timeout: 10000 });

    // 作业列表出现（createdAt desc，新作业在首页）
    const aRow = page.locator('.ant-table-row').filter({ hasText: assignmentTitle }).first();
    await expect(aRow).toBeVisible({ timeout: 5000 });
    await expect(aRow).toContainText(CLASS_NAME);
  });

  // ============ P3 学生：提交实训项目 ============
  test('P3: 学生提交实训项目', async ({ page }) => {
    await login(page, STUDENT, 'student');
    await page.goto('/exam/student/assignments', { waitUntil: 'networkidle' });

    // 搜索该作业并进入
    await page.locator('input[placeholder="搜索作业标题"]').fill(assignmentTitle);
    await page.locator('input[placeholder="搜索作业标题"]').press('Enter');
    const row = page.locator('.ant-table-tbody tr').filter({ hasText: assignmentTitle }).first();
    await row.waitFor({ timeout: 8000 });
    await row.click();
    await page.waitForURL(`**/student/assignments/*/project/*`, { timeout: 10000 });

    // 实训题学生页：上传入口
    await page.waitForSelector('.kind-add-btn', { timeout: 15000 });
    await expect(page.getByText('点击上传项目文件')).toBeVisible({ timeout: 5000 });

    // 上传学生项目 zip
    await page.setInputFiles('input[type="file"]', SUB_ZIP);
    await expect(page.locator('.zu-tree, .ant-tree').first()).toBeVisible({ timeout: 15000 });

    // 提交答案
    await page.locator('button').filter({ hasText: '提交答案' }).click();
    await expect(page.locator('.ant-message-success').filter({ hasText: '提交成功' }).first())
      .toBeVisible({ timeout: 15000 });

    // 成绩卡片显示「已提交，待评分」（R4：未审核不显示分数）
    const card = page.locator('.student-score-card');
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card).toContainText('已提交，待评分');
    await expect(card).not.toContainText('教师评语');
  });

  // ============ P4 教师：评分审核 → 实训题审核 → 审核通过 ============
  test('P4: 教师审核实训提交并放分', async ({ page }) => {
    await login(page, TEACHER, 'teacher');
    await page.goto('/exam/teacher/review', { waitUntil: 'networkidle' });

    // 选择班级 E2E测试班
    await page.locator('.ant-select').first().click();
    const classOpt = page.locator('.ant-select-dropdown:visible .ant-select-item-option')
      .filter({ hasText: CLASS_NAME }).first();
    await classOpt.waitFor({ timeout: 5000 });
    await classOpt.click();

    // 找到该作业行 → 审核（进 ReviewClass）
    const summaryRow = page.locator('.ant-table-row').filter({ hasText: assignmentTitle }).first();
    await summaryRow.waitFor({ timeout: 8000 });
    await summaryRow.locator('button').filter({ hasText: /审\s*核/ }).first().click();
    await page.waitForURL('**/teacher/review/class/*', { timeout: 10000 });

    // ReviewClass：找学生行 → 审核（实训题 → /teacher/review/project/:submissionId）
    const stuRow = page.locator('.ant-table-row').filter({ hasText: STUDENT.username }).first();
    await stuRow.waitFor({ timeout: 8000 });
    await stuRow.locator('button').filter({ hasText: /审\s*核/ }).first().click();
    await page.waitForURL('**/teacher/review/project/*', { timeout: 10000 });

    // 实训题三栏审核页（ProjectReviewNew）
    await page.waitForSelector('.pr-page', { timeout: 15000 });
    await expect(page.locator('.pr-top')).toContainText('实训题');

    // 填写最终分数 + 教师评语（AI 评语不自动下发，教师显式填写 R3）
    await page.locator('.pr-panel .ant-input-number input').fill(FINAL_SCORE);
    await page.locator('.pr-panel textarea').fill(TEACHER_FEEDBACK);
    await page.locator('.pr-panel button').filter({ hasText: '审核通过' }).click();

    // 审核通过 → 学生可见成绩
    await expect(page.locator('.ant-message-success').filter({ hasText: '审核通过' }).first())
      .toBeVisible({ timeout: 10000 });
    await expect(page.locator('.pr-top')).toContainText('已审核');
  });

  // ============ P5 学生：成绩可见（分数 + 教师评语） ============
  test('P5: 学生查看实训成绩', async ({ page }) => {
    await login(page, STUDENT, 'student');
    await page.goto('/exam/student/assignments', { waitUntil: 'networkidle' });

    await page.locator('input[placeholder="搜索作业标题"]').fill(assignmentTitle);
    await page.locator('input[placeholder="搜索作业标题"]').press('Enter');
    const row = page.locator('.ant-table-tbody tr').filter({ hasText: assignmentTitle }).first();
    await row.waitFor({ timeout: 8000 });
    await row.click();
    await page.waitForURL(`**/student/assignments/*/project/*`, { timeout: 10000 });

    // 成绩卡片：已批改 + 分数 + 教师评语（R4：reviewed 放分）
    const card = page.locator('.student-score-card');
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText('已批改');
    await expect(card).toContainText(FINAL_SCORE);
    await expect(card).toContainText(TEACHER_FEEDBACK);
  });
});
