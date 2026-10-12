/**
 * W39（R2-B15）：seed 清理必须覆盖「上一轮遗留的测试教师数据」（projects/teams/assignments/questions 及其子表）。
 * 复现：构造遗留链（project→project_classes/project_files/project_submissions→submission_files；assignment→…；question→sub_questions；team.created_by）
 * 再调用 seedTestData() ⇒ 必须成功（旧代码会因 FK 挡在 user.delete 上，表现为整批 suite failed to run / 0 例）。
 */
import prisma from '../../src/utils/prisma.js';
import { seedTestData } from '../setup.js';

const tag = 'w39-leftover-' + Date.now();

describe('W39 seed 对遗留教师数据的清理', () => {
  it('★W39-1 遗留 project/assignment/question/team ⇒ seedTestData 成功且遗留行被清空', async () => {
    const teacher = await prisma.user.findFirst({ where: { username: 'test_teacher' }, select: { id: true } });
    expect(teacher).toBeTruthy();
    const cls = await prisma.class.findFirst({ where: { name: 'test_class' }, select: { id: true } });
    expect(cls).toBeTruthy();

    // 构造「上一轮遗留」：project 域（含三层子表）
    const project = await prisma.project.create({ data: { teacherId: teacher.id, title: tag + '-proj', description: 'x', startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    await prisma.projectClass.create({ data: { projectId: project.id, classId: cls.id } });
    await prisma.projectFile.create({ data: { projectId: project.id, path: tag + '.md', name: tag + '.md', type: 'file' } });
    const student = await prisma.user.findFirst({ where: { role: 'student' }, select: { id: true } });
    const psub = await prisma.projectSubmission.create({ data: { projectId: project.id, studentId: student.id } });
    await prisma.submissionFile.create({ data: { submissionId: psub.id, path: tag + '.txt', name: tag + '.txt', type: 'file' } });

    // 构造「上一轮遗留」：assignment/question 域 + 教师创建的 team
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag + '-q', type: 'project', difficulty: 'easy', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag + '-a', startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    await prisma.assignmentQuestion.create({ data: { assignmentId: a.id, questionId: q.id, sortOrder: 1 } });
    await prisma.assignmentClass.create({ data: { assignmentId: a.id, classId: cls.id } });
    await prisma.submission.create({ data: { assignmentId: a.id, questionId: q.id, studentId: student.id, status: 'submitted' } });
    const school = await prisma.school.findFirst({ where: { officialCode: '10001' }, select: { id: true } });
    await prisma.team.create({ data: { schoolId: school.id, name: tag + '-team', createdBy: teacher.id } });

    // ★ 旧代码在这里会抛 FK 错误（整批 suite failed to run）
    await expect(seedTestData()).resolves.toBeUndefined();

    // 遗留行应被清空（父表与子表都查一遍）
    expect(await prisma.project.findMany({ where: { title: tag + '-proj' } })).toHaveLength(0);
    expect(await prisma.projectClass.findMany({ where: { projectId: project.id } })).toHaveLength(0);
    expect(await prisma.projectFile.findMany({ where: { projectId: project.id } })).toHaveLength(0);
    expect(await prisma.projectSubmission.findMany({ where: { projectId: project.id } })).toHaveLength(0);
    expect(await prisma.submissionFile.findMany({ where: { submissionId: psub.id } })).toHaveLength(0);
    expect(await prisma.assignment.findMany({ where: { title: tag + '-a' } })).toHaveLength(0);
    expect(await prisma.question.findMany({ where: { title: tag + '-q' } })).toHaveLength(0);
    expect(await prisma.team.findMany({ where: { name: tag + '-team' } })).toHaveLength(0);

    // seed 语义等价：教师与学生种子仍在
    expect(await prisma.user.findFirst({ where: { username: 'test_teacher' } })).toBeTruthy();
    expect(await prisma.user.findMany({ where: { username: { in: ['test_stu_01@10001', 'test_stu_02@10001', 'test_stu_03@10001'] } } })).toHaveLength(3);
    expect(await prisma.class.findFirst({ where: { name: 'test_class' } })).toBeTruthy();
  }, 120000);

  it('W39-2 机制证明：projects.teacher_id 会挡住 user.delete（旧清理缺口的失败机制）', async () => {
    // 造一个一次性教师 + 其 project（不触碰种子教师）
    const u = await prisma.user.create({ data: { username: tag + '-tmp-teacher', password: 'x', role: 'teacher', realName: tag } });
    const p = await prisma.project.create({ data: { teacherId: u.id, title: tag + '-tmp-proj', description: 'x', startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    let err = null;
    try { await prisma.user.delete({ where: { id: u.id } }); } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(String(err.message || '')).toMatch(/Foreign key constraint|teacher_id/);
    // 按 FK 序清掉 project 之后即可删除 ⇒ 证明「先清子表再删父行」是必须的
    await prisma.projectClass.deleteMany({ where: { projectId: p.id } });
    await prisma.projectFile.deleteMany({ where: { projectId: p.id } });
    await prisma.projectSubmission.deleteMany({ where: { projectId: p.id } });
    await prisma.project.deleteMany({ where: { id: p.id } });
    await prisma.user.delete({ where: { id: u.id } });
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBe(null);
  }, 60000);
});
