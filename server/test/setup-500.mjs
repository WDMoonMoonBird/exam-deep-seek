// 为 teacher_a 在 Deadpan 大学创建 500 人班级 + 题目 + 作业
// 不修改任何并发设置
const BASE = 'http://localhost:3000/api';
const SCHOOL_ID = 1; // Deadpan 大学

async function post(url, body, token) {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function put(url, body, token) {
  const res = await fetch(`${BASE}${url}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function get(url, token) {
  const res = await fetch(`${BASE}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return res.json();
}

async function main() {
  // 1. teacher_a 登录
  console.log('1. teacher_a 登录...');
  let tl = await post('/auth/login', { username: 'teacher_a', password: 'teacher_a' });
  const tToken = tl.data.token;
  console.log('   已登录, schoolId=', SCHOOL_ID);

  // teacher API 自动带 schoolId
  function T(method, path, body) {
    const sep = path.includes('?') ? '&' : '?';
    const fullPath = `${path}${sep}schoolId=${SCHOOL_ID}`;
    if (method === 'GET') return get(fullPath, tToken);
    if (method === 'PUT') return put(fullPath, body, tToken);
    return post(fullPath, body, tToken);
  }

  // 2. 创建 500 人班级
  console.log('2. 创建班级...');
  const className = 'Java500人班';
  // 删旧同名
  const oldCls = await T('GET', '/teacher/classes');
  for (const c of (oldCls.data || [])) {
    if (c.name === className) {
      await T('PUT', `/teacher/classes/${c.id}`, null); // 不能删，直接复用
      console.log('   复用旧班级 id=', c.id);
    }
  }
  // 新建
  const cls = await T('POST', '/teacher/classes', { name: className });
  const classId = cls.data?.id;
  console.log('   班级:', className, 'id=', classId);

  // 3. 批量创建 500 学生
  console.log('3. 创建 500 学生...');
  const t0 = Date.now();
  let created = 0;
  // 先查已有
  const existing = await T('GET', `/teacher/students?classId=${classId}`);
  const have = (existing.data || []).length;
  console.log(`   已有 ${have} 人`);
  const need = Math.max(0, 500 - have);

  for (let i = have; i < have + need; i += 50) {
    const batch = [];
    const end = Math.min(i + 50, have + need);
    for (let j = i; j < end; j++) {
      const num = String(j + 1).padStart(4, '0');
      batch.push({ username: `sz${num}`, realName: `Java${num}` });
    }
    const r = await T('POST', '/teacher/students/batch', { classId, students: batch });
    created += r.data?.success || 0;
    process.stdout.write(`\r   ${created}/${need}`);
  }
  console.log(`\n   完成! ${Math.round((Date.now()-t0)/1000)}s`);

  // 4. 创建题目
  console.log('4. 创建题目...');
  const q = await T('POST', '/teacher/questions', {
    title: 'Java程序设计期末考试',
    difficulty: 'medium',
    material: '<p>请实现一个<strong>学生成绩管理系统</strong>。</p>',
    subQuestions: [{
      title: '学生成绩管理系统',
      type: 'code', score: 100,
      content: '<p>使用 Java 实现：面向对象设计、添加学生及成绩、计算平均/最高/最低分、按成绩排序输出。</p>',
      referenceAnswer: 'class Student{String n;int s;Student(String n,int s){this.n=n;this.s=s;}}class Manager{List<Student>l=new ArrayList<>();void add(Student s){l.add(s);}double avg(){return l.stream().mapToInt(x->x.s).average().orElse(0);}int max(){return l.stream().mapToInt(x->x.s).max().orElse(0);}int min(){return l.stream().mapToInt(x->x.s).min().orElse(0);}void sort(){l.sort((a,b)->b.s-a.s);l.forEach(x->System.out.println(x.n+":"+x.s));}}',
      language: 'java',
      scoringCriteria: '代码正确性(60%)+效率(20%)+可读性(20%)',
    }],
  });
  const questionId = q.data.id;
  const subQuestionId = q.data.subQuestions[0].id;
  console.log('   questionId=', questionId, 'subQuestionId=', subQuestionId);

  // 5. 创建作业
  console.log('5. 创建作业...');
  const now = new Date();
  const a = await T('POST', '/teacher/assignments', {
    title: 'Java程序设计期末考试',
    description: '请独立完成编码，严禁抄袭。',
    startTime: new Date(now - 86400000).toISOString(),
    endTime: new Date(now + 86400000 * 7).toISOString(),
    allowResubmit: false,
    questionIds: [questionId],
    classIds: [classId],
  });
  const assignmentId = a.data.id;
  console.log('   assignmentId=', assignmentId);

  console.log('\n=== 环境就绪 ===');
  console.log(`班级="${className}" id=${classId} 学生=500`);
  console.log(`题目 id=${questionId} 小题 id=${subQuestionId}`);
  console.log(`作业 id=${assignmentId}`);
  console.log(`\n运行 node test/submit-500-v2.mjs 提交作业`);
}

main().catch(e => { console.error(e); process.exit(1); });
