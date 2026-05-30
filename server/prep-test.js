import 'dotenv/config';
import prisma from './src/utils/prisma.js';

// 删除旧提交 + 为所有学生创建新提交
await prisma.submission.deleteMany({ where: { assignmentId: 19 } });

const students = await prisma.user.findMany({
  where: { role: 'student' },
  select: { id: true },
});

const BATCH = 200;
let created = 0;
for (let i = 0; i < students.length; i += BATCH) {
  const batch = students.slice(i, i + BATCH);
  await prisma.submission.createMany({
    data: batch.map(s => ({
      studentId: s.id,
      assignmentId: 19,
      questionId: 8,
      answer: 'def filter_odd(lst):\n    result = []\n    for x in lst:\n        if x % 2 != 0:\n            result.append(x)\n    return result',
      status: 'submitted',
      submittedAt: new Date(),
    })),
  });
  created += batch.length;
  console.log(`已创建 ${created}/${students.length} 条提交`);
}

const count = await prisma.submission.count({ where: { assignmentId: 19 } });
console.log(`完成，共 ${count} 条提交`);

await prisma.$disconnect();
