// 完整压测：新建 500 人班级 + 作业 + 全部提交 → 64 并发评分
// admin 凭据来自统一夹具（W0-C，环境变量优先/缺省自建）；需与被测服务同一 DATABASE_URL。
import { ensureAdminAccount } from './fixtures/admin.js';

const BASE = 'http://localhost:3000/api';

function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${BASE}${path}`, opts).then(r => r.json());
}

async function main() {
  console.log('=== 1. admin 登录 + 设并发 64 ===');
  const adminCreds = await ensureAdminAccount();
  const admin = await api('POST', '/auth/login', { username: adminCreds.username, password: adminCreds.password });
  const adminToken = admin.data.token;
  await api('PUT', '/admin/settings', { ai_concurrency: 64 }, adminToken);

  const schools = await api('GET', '/admin/schools', null, adminToken);
  const schoolId = schools.data[0].id;

  console.log('=== 2. 教师 A ===');
  let tl = await api('POST', '/auth/login', { username: 'teacher_a', password: 'teacher_a' });
  if (tl.code !== 0) {
    await api('POST', '/admin/teachers', { username: 'teacher_a', realName: 'A老师', schoolIds: [schoolId] }, adminToken);
    tl = await api('POST', '/auth/login', { username: 'teacher_a', password: 'teacher_a' });
  }
  const tToken = tl.data.token;
  // helper: 教师路由自动加 schoolId
  const T = (method, path, body) => {
    const sep = path.includes('?') ? '&' : '?';
    return api(method, `${path}${sep}schoolId=${schoolId}`, body, tToken);
  };

  console.log('=== 3. 创建新班级 ===');
  const className = `Java期末500人-${Date.now()}`;
  const oldCls = await T('GET', '/teacher/classes');
  for (const c of (oldCls.data || [])) {
    if (c.name && c.name.startsWith('Java期末500人-')) {
      await T('DELETE', `/teacher/classes/${c.id}`);
      console.log('  删除旧班级:', c.name);
    }
  }
  const cls = await T('POST', '/teacher/classes', { name: className });
  const classId = cls.data.id;
  console.log('  班级:', className, 'id=', classId);

  console.log('=== 4. 批量创建 500 学生 ===');
  const t0 = Date.now();
  let created = 0;
  for (let i = 0; i < 500; i += 50) {
    const batch = [];
    for (let j = i; j < Math.min(i + 50, 500); j++) {
      const num = String(j + 1).padStart(4, '0');
      batch.push({ username: `js${num}`, realName: `Java${num}` });
    }
    const r = await T('POST', '/teacher/students/batch', { classId, students: batch });
    created += r.data?.success || 0;
    process.stdout.write(`\r  ${created}/500`);
  }
  console.log(`\n  完成! ${Math.round((Date.now()-t0)/1000)}s`);

  console.log('=== 5. 创建题目 ===');
  const q = await T('POST', '/teacher/questions', {
    title: `Java期末考试-${Date.now()}`,
    difficulty: 'medium',
    material: '<p>实现学生成绩管理系统。</p>',
    subQuestions: [{
      title: '成绩管理系统', type: 'code', score: 100,
      content: '<p>Java 实现：面向对象、增删成绩、统计平均/最高/最低、排序输出。</p>',
      referenceAnswer: 'class Student{String n;int s;Student(String n,int s){this.n=n;this.s=s;}}\nclass M{List<Student>l=new ArrayList<>();void a(Student s){l.add(s);}double v(){return l.stream().mapToInt(x->x.s).average().orElse(0);}int x(){return l.stream().mapToInt(x->x.s).max().orElse(0);}int m(){return l.stream().mapToInt(x->x.s).min().orElse(0);}void p(){l.sort((a,b)->b.s-a.s);l.forEach(x->System.out.println(x.n+":"+x.s));}}',
      language: 'java',
      scoringCriteria: '正确性60%+效率20%+可读性20%',
    }],
  });
  const questionId = q.data.id;
  const subQuestionId = q.data.subQuestions[0].id;
  console.log('  qid=', questionId);

  console.log('=== 6. 创建作业 ===');
  const now = new Date();
  const a = await T('POST', '/teacher/assignments', {
    title: 'Java程序设计期末考试',
    description: '独立完成，严禁抄袭。',
    startTime: new Date(now - 86400000).toISOString(),
    endTime: new Date(now + 86400000 * 7).toISOString(),
    allowResubmit: false,
    questionIds: [questionId],
    classIds: [classId],
  });
  const assignmentId = a.data.id;
  console.log('  aid=', assignmentId);

  console.log('=== 7. 500 学生提交 (100满分 + 100部分 + 100差 + 100空 + 100满分) ===');
  const allStu = await T('GET', `/teacher/students?classId=${classId}`);
  const students = allStu.data || [];
  console.log(`  共 ${students.length} 人`);

  const REF = 'class Student{String n;int s;Student(String n,int s){this.n=n;this.s=s;}}\nclass M{List<Student>l=new ArrayList<>();void a(Student s){l.add(s);}double v(){return l.stream().mapToInt(x->x.s).average().orElse(0);}int x(){return l.stream().mapToInt(x->x.s).max().orElse(0);}int m(){return l.stream().mapToInt(x->x.s).min().orElse(0);}void p(){l.sort((a,b)->b.s-a.s);l.forEach(x->System.out.println(x.n+":"+x.s));}}';
  const PARTIAL = 'class X{public static void main(String[]a){int x=85,y=92;System.out.println((x+y)/2);}}';
  const POOR = 'public class T{public static void main(String[]a){System.out.println("ok");}}';
  const EMPTY = '';
  const answers = [REF, PARTIAL, POOR, EMPTY, REF];

  const t1 = Date.now();
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < students.length; i += 40) {
    const batch = [];
    for (let j = i; j < Math.min(i + 40, students.length); j++) {
      const ans = answers[Math.floor(j / 100)] || REF;
      const stu = students[j];
      const sid = (stu.username || '').includes('@') ? stu.username.split('@')[0] : stu.username;
      batch.push((async () => {
        try {
          const login = await api('POST', '/auth/login', { username: sid, password: sid });
          if (login.code !== 0) { fail++; console.error(`  [提交失败] ${sid} 登录失败: ${login.message || 'code=' + login.code}`); return; }
          const sub = await api('POST', `/student/assignments/${assignmentId}/submit`, {
            questionId, subQuestionId, answer: ans,
          }, login.data.token);
          if (sub.code === 0) ok++;
          else { fail++; console.error(`  [提交失败] ${sid}: ${sub.message || 'code=' + sub.code}`); }
        } catch (e) {
          fail++;
          console.error(`  [提交异常] ${sid}: ${e.message || e}`);
        }
      })());
    }
    await Promise.all(batch);
    process.stdout.write(`\r  ${Math.min(i + 40, students.length)}/${students.length} (${Math.round((Date.now()-t1)/1000)}s)`);
  }
  console.log(`\n  提交完成! 成功 ${ok} 人，失败 ${fail} 人（${Math.round((Date.now()-t1)/1000)}s）`);
  if (ok === 0) {
    console.error('\n⛔ 没有任何提交成功，退出');
    process.exit(1);
  }

  console.log('=== 8. 等待评分... ===');
  // 轮询提交列表，直到全部已成功提交的记录完成评分（status=ai_graded），超时打印明细并退出码非 0
  const POLL_INTERVAL_MS = 10000;
  const MAX_WAIT_MS = 600000; // 10 分钟上限
  const pollStart = Date.now();
  let graded = 0;
  while (Date.now() - pollStart < MAX_WAIT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const st = await T('GET', `/teacher/submissions?assignmentId=${assignmentId}&pageSize=500`);
    if (st.code !== 0) {
      console.error(`  [轮询失败] 查询提交列表: ${st.message || 'code=' + st.code}`);
      continue;
    }
    const list = st.data?.list || [];
    graded = list.filter(s => s.status === 'ai_graded').length;
    console.log(`  已评分 ${graded}/${ok}（提交记录 ${st.data?.total ?? list.length}）`);
    if (graded >= ok) break;
  }

  if (graded < ok) {
    console.error(`\n⛔ 超时：${Math.round((Date.now()-pollStart)/1000)}s 内仅 ${graded}/${ok} 完成评分，未完成明细：`);
    const st = await T('GET', `/teacher/submissions?assignmentId=${assignmentId}&pageSize=500`);
    if (st.code === 0) {
      for (const s of (st.data?.list || [])) {
        if (s.status !== 'ai_graded') {
          console.error(`  - ${s.student?.username || s.studentId} status=${s.status} 提交时间=${s.submittedAt || '无'}`);
        }
      }
    }
    console.error('\n日志: /tmp/worker.log');
    process.exit(1);
  }

  console.log(`\n  评分完成! ${Math.round((Date.now()-pollStart)/1000)}s`);

  console.log('\n=== ✅ 完成 ===');
  console.log('班级:', className, '(500人)');
  console.log('作业: Java程序设计期末考试');
  console.log(`提交: 成功 ${ok} 人，失败 ${fail} 人`);
  console.log('分布: 1-100满分 | 101-200部分 | 201-300差 | 301-400空 | 401-500满分');
  console.log('日志: /tmp/worker.log');
}

main().catch(e => { console.error(e); process.exit(1); });
