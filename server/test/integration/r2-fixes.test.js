/**
 * r2-fixes.test.js — 第二轮缺陷修复的直接测试覆盖（测试团队建议）。
 * 覆盖：extractFilesJson 截断 8 场景 / enforceBudget 权重降序 / 重评幂等（pending 重复重评 400）。
 */
import { request, loginAsTeacher, getTestData } from './helpers.js';
import prisma from '../../src/utils/prisma.js';
import { extractFilesJson } from '../../src/services/deepseek.js';
import { enforceBudget } from '../../src/services/projectGrading.js';

describe('BUG-R2-A：extractFilesJson 截断宽容解析', () => {
  const cases = [
    ['完整 JSON', '{"files": ["src/a.js"], "reason": "ok"}', ['src/a.js']],
    ['字符串中段截断', '{"files": ["src/a.js", "src/b', ['src/a.js']],
    ['尾逗号截断', '{"files": ["src/a.js",', ['src/a.js']],
    ['悬空开引号', '{"files": ["src/a.js"], "reason": "', ['src/a.js']],
    ['markdown 围栏', '```json\n{"files": ["src/a.js"]}\n```', ['src/a.js']],
    ['前缀文本', '好的：{"files": ["src/a.js", "src/b.js"], "reason": "核心"}', ['src/a.js', 'src/b.js']],
    ['mid 截断 reason', '{"files": ["src/a.js"], "reason": "选', ['src/a.js']],
    ['嵌套数组截断', '{"files": ["src/a.js", ["x", "y"], "src', ['src/a.js', ['x', 'y']]],
  ];
  it.each(cases)('%s → 修复成功', (name, input, expectFiles) => {
    const r = extractFilesJson(input);
    expect(r).not.toBeNull();
    expect(JSON.stringify(r.files)).toBe(JSON.stringify(expectFiles));
  });
  it('无效内容 → null（不抛错）', () => {
    expect(extractFilesJson('')).toBeNull();
    expect(extractFilesJson('no json here')).toBeNull();
  });
});

describe('BUG-R2-C：enforceBudget 权重降序（高权重保全文）', () => {
  const mkFile = (p, w, size) => ({ path: p, name: p.split('/').pop(), dir: false, size, ext: 'js', fold: false, weight: w });
  it('预算不足时高权重文件保全文、低权重文件被骨架化/占位', () => {
    // 500KB 标准包 → 必然超 120K token 预算，触发压缩路径
    const stu = [mkFile('src/main.js', 3, 10240), mkFile('src/helper.js', 1, 10240)];
    const r = enforceBudget({
      standardText: 'x'.repeat(500000),
      studentText: 'stu',
      stdFiltered: [],
      stuFiltered: stu,
      stdBase: '/tmp',
      stuBase: '/tmp',
    });
    expect(r.truncated).toBe(true);
    // 高权重 main.js 在前（降序排列）
    const student = r.studentText;
    expect(student).toContain('main.js');
    const mainIdx = student.indexOf('main.js');
    const helperIdx = student.indexOf('helper.js');
    expect(mainIdx).toBeGreaterThanOrEqual(0);
    expect(helperIdx).toBeGreaterThan(mainIdx);
  });
  it('预算充足时不截断', () => {
    const r = enforceBudget({ standardText: 'std', studentText: 'stu', stdFiltered: [], stuFiltered: [], stdBase: '/tmp', stuBase: '/tmp' });
    expect(r.truncated).toBe(false);
  });
});

describe('BUG-014：重评幂等（评分中重复重评 → 400）', () => {
  let teacherToken;
  let td;
  let projectQuestion;
  let assignment;

  beforeAll(async () => {
    teacherToken = await loginAsTeacher();
    td = getTestData();
    const base = 'r2fix_' + Date.now();
    projectQuestion = await prisma.question.create({
      data: { teacherId: td.teacherId, title: base + '_q', maxScore: 100, difficulty: 'medium', type: 'project', material: '' },
    });
    assignment = await prisma.assignment.create({
      data: { teacherId: td.teacherId, title: base + '_a', startTime: new Date(Date.now() - 86400000), endTime: new Date(Date.now() + 86400000) },
    });
  });

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { questionId: projectQuestion.id } });
    await prisma.question.delete({ where: { id: projectQuestion.id } });
    await prisma.assignment.delete({ where: { id: assignment.id } });
  });

  it('pending + prevStatus（重评进行中）时重复重评 → 400', async () => {
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id, studentId: td.studentIds[0], questionId: projectQuestion.id,
        status: 'reviewed', aiScore: 88, finalScore: 90,
        answer: JSON.stringify({ kind: 'project', currentVersion: 1, history: [], grading: { state: 'pending', version: 1, startedAt: null, finishedAt: null, error: null, prevStatus: 'reviewed' } }),
        submittedAt: new Date(), reviewedAt: new Date(),
      },
    });
    const r = await request().post(`/api/teacher/submissions/${sub.id}/project/regrade`).set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(1001);
    expect(r.body.message).toContain('评分进行中');
    await prisma.submission.delete({ where: { id: sub.id } });
  });

  it('学生首次提交 pending（无 prevStatus）→ 允许重评', async () => {
    const sub = await prisma.submission.create({
      data: {
        assignmentId: assignment.id, studentId: td.studentIds[1], questionId: projectQuestion.id,
        status: 'submitted', aiScore: null,
        answer: JSON.stringify({ kind: 'project', currentVersion: 1, history: [], grading: { state: 'pending', version: 1, startedAt: null, finishedAt: null, error: null } }),
        submittedAt: new Date(),
      },
    });
    const r = await request().post(`/api/teacher/submissions/${sub.id}/project/regrade`).set('Authorization', 'Bearer ' + teacherToken);
    expect(r.body.code).toBe(0);
    await prisma.submission.delete({ where: { id: sub.id } });
  });
});