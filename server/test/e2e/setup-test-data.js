// 创建测试数据：测试教师1~2、测试学生1~5、测试班级1、测试题目1、测试作业1、测试团队1
const BASE = 'http://localhost:3000/api';

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  // teacher routes need schoolId query param
  const separator = path.includes('?') ? '&' : '?';
  const fullPath = path.startsWith('/teacher') ? `${path}${separator}schoolId=2749` : path;
  const res = await fetch(`${BASE}${fullPath}`, opts);
  const data = await res.json();
  if (data.code !== 0) throw new Error(`${method} ${path}: ${JSON.stringify(data)}`);
  return data.data;
}

(async () => {
  try {
    // 1. 登录 admin
    console.log('1. 登录 admin...');
    const adminLogin = await api('POST', '/auth/login', { username: 'admin', password: '***REDACTED***' });
    const adminToken = adminLogin.token;

    // 2. 创建测试教师1
    console.log('2. 创建测试教师1...');
    let t1;
    try {
      t1 = await api('POST', '/admin/teachers', { username: 'testteacher1', realName: '测试教师1', schoolIds: [2749] }, adminToken);
    } catch (e) {
      if (e.message.includes('已存在')) console.log('   已存在，跳过');
    }
    console.log('   ✅ 测试教师1 (testteacher1 / testteacher1)');

    // 3. 创建测试教师2
    console.log('3. 创建测试教师2...');
    let t2;
    try {
      t2 = await api('POST', '/admin/teachers', { username: 'testteacher2', realName: '测试教师2', schoolIds: [2749] }, adminToken);
    } catch (e) {
      if (e.message.includes('已存在')) console.log('   已存在，跳过');
    }
    console.log('   ✅ 测试教师2 (testteacher2 / testteacher2)');

    // 4. 登录测试教师1
    console.log('4. 登录测试教师1...');
    const t1Login = await api('POST', '/auth/login', { username: 'testteacher1', password: 'testteacher1' });
    const t1Token = t1Login.token;
    const t1UserId = t1Login.user.id;
    console.log('   测试教师1 userId=' + t1UserId);

    // 5. 创建测试班级1
    console.log('5. 创建测试班级1...');
    const cls = await api('POST', '/teacher/classes', { name: '测试班级1' }, t1Token);
    const classId = cls.id;
    console.log('   ✅ 测试班级1 (id=' + classId + ')');

    // 6. 批量创建测试学生1~5
    console.log('6. 创建测试学生1~5...');
    const students = [
      { username: 'teststudent1', realName: '测试学生1' },
      { username: 'teststudent2', realName: '测试学生2' },
      { username: 'teststudent3', realName: '测试学生3' },
      { username: 'teststudent4', realName: '测试学生4' },
      { username: 'teststudent5', realName: '测试学生5' },
    ];
    await api('POST', '/teacher/students/batch', { classId, students }, t1Token);
    console.log('   ✅ 测试学生1~5');

    // 7. 创建测试题目1（含3道小题）
    console.log('7. 创建测试题目1...');
    await api('POST', '/teacher/questions', {
      title: '测试题目1',
      difficulty: 'medium',
      maxScore: 100,
      material: '<p>请根据以下要求编写代码：</p><ul><li>要求1：实现基本功能</li><li>要求2：考虑边界情况</li></ul>',
      subQuestions: [
        {
          title: '第1小题', score: 30,
          content: '<p>编写一个函数，实现数组排序功能。输入一个整数数组，返回排序后的数组。</p>',
          referenceAnswer: 'function sortArray(arr) {\n  return arr.sort((a, b) => a - b);\n}',
          language: 'javascript',
        },
        {
          title: '第2小题', score: 30,
          content: '<p>编写一个函数，实现二分查找。输入有序数组和目标值，返回目标值的索引。</p>',
          referenceAnswer: 'function binarySearch(arr, target) {\n  let left = 0, right = arr.length - 1;\n  while (left <= right) {\n    const mid = Math.floor((left + right) / 2);\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  return -1;\n}',
          language: 'javascript',
        },
        {
          title: '第3小题', score: 40,
          content: '<p>编写一个函数，实现链表反转。输入链表头节点，返回反转后的链表头节点。</p>',
          referenceAnswer: 'function reverseList(head) {\n  let prev = null;\n  let curr = head;\n  while (curr) {\n    const next = curr.next;\n    curr.next = prev;\n    prev = curr;\n    curr = next;\n  }\n  return prev;\n}',
          language: 'javascript',
        },
      ],
    }, t1Token);
    console.log('   ✅ 测试题目1（3道小题）');

    // 8. 创建测试作业1
    console.log('8. 创建测试作业1...');
    const qList = await api('GET', '/teacher/questions?pageSize=10', null, t1Token);
    const questionId = qList.list[0]?.id;
    if (!questionId) throw new Error('题目未找到');

    const now = new Date();
    const startTime = new Date(now.getTime() - 86400000).toISOString();
    const endTime = new Date(now.getTime() + 86400000 * 7).toISOString();

    await api('POST', '/teacher/assignments', {
      title: '测试作业1',
      description: '这是一个测试作业，请同学们按时完成。',
      startTime, endTime, allowResubmit: true,
      questionIds: [questionId], classIds: [classId],
    }, t1Token);
    console.log('   ✅ 测试作业1');

    // 9. 创建测试团队1
    console.log('9. 创建测试团队1...');
    const team = await api('POST', '/teacher/teams', { name: '测试团队1' }, t1Token);
    const teamId = team.id;
    console.log('   ✅ 测试团队1 (id=' + teamId + ')');

    // 10. 查测试教师2的userId并加入团队
    console.log('10. 添加测试教师2到团队...');
    const teachersList = await api('GET', '/teacher/teachers?schoolId=2749', null, t1Token);
    const t2User = teachersList.find(t => t.username === 'testteacher2');
    if (t2User) {
      await api('PUT', `/teacher/teams/${teamId}`, { teacherIds: [t1UserId, t2User.id] }, t1Token);
      console.log('   ✅ 测试教师2 (userId=' + t2User.id + ') 已加入');
    } else {
      console.log('   ⚠️ 未找到测试教师2，跳过');
    }

    // 11. 将测试班级1加入测试团队1
    console.log('11. 添加测试班级1到团队...');
    await api('PUT', `/teacher/teams/${teamId}`, { classIds: [classId] }, t1Token);
    console.log('   ✅ 测试班级1已加入团队');

    console.log('\n🎉 全部完成！');
    console.log('   testteacher1 / testteacher1 (教师)');
    console.log('   testteacher2 / testteacher2 (教师)');
    console.log('   teststudent1~5 / teststudent1~5 (学生)');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  }
})();
