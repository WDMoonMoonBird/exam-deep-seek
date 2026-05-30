import { loginAsTeacher, authReq } from './helpers.js';

describe('题库 CRUD', () => {
  let token;
  let r;

  beforeAll(async () => {
    token = await loginAsTeacher();
    r = authReq(token);
  });

  function makeQuestion(overrides = {}) {
    return {
      title: '默认标题',
      maxScore: 100,
      difficulty: 'easy',
      subQuestions: [{ title: '题1', content: '<p>内容</p>', referenceAnswer: 'ans', language: 'python' }],
      ...overrides,
    };
  }

  // Q1: 创建单小题题目
  it('Q1: 创建单小题题目 → subQuestions.length=1', async () => {
    const res = await r.post('/api/teacher/questions', makeQuestion({ title: '单小题测试' }));
    expect(res.body.code).toBe(0);
    expect(res.body.data.subQuestions).toHaveLength(1);
    expect(res.body.data.subQuestions[0].score).toBe(100);
  });

  // Q2: 创建 3 小题题目，分值均分
  it('Q2: 创建3小题题目 → 分值均分', async () => {
    const res = await r.post('/api/teacher/questions', makeQuestion({
      title: '3小题测试',
      maxScore: 90,
      subQuestions: [
        { title: '题1', content: '<p>c1</p>', referenceAnswer: 'a1', language: 'python' },
        { title: '题2', content: '<p>c2</p>', referenceAnswer: 'a2', language: 'python' },
        { title: '题3', content: '<p>c3</p>', referenceAnswer: 'a3', language: 'python' },
      ],
    }));
    expect(res.body.code).toBe(0);
    expect(res.body.data.subQuestions).toHaveLength(3);
    expect(res.body.data.subQuestions[0].score).toBe(30);
    expect(res.body.data.subQuestions[1].score).toBe(30);
    expect(res.body.data.subQuestions[2].score).toBe(30);
  });

  // Q3: 自定义分值
  it('Q3: 自定义分值 → 保存正确', async () => {
    const res = await r.post('/api/teacher/questions', makeQuestion({
      title: '自定义分值题',
      subQuestions: [
        { title: '题1', content: '<p>c1</p>', referenceAnswer: 'a1', score: 20, language: 'python' },
        { title: '题2', content: '<p>c2</p>', referenceAnswer: 'a2', score: 30, language: 'python' },
        { title: '题3', content: '<p>c3</p>', referenceAnswer: 'a3', score: 50, language: 'python' },
      ],
    }));
    expect(res.body.code).toBe(0);
    const scores = res.body.data.subQuestions.map(sq => sq.score);
    expect(scores).toEqual([20, 30, 50]);
  });

  // Q4: 分值总和不等于满分 → 400
  it('Q4: 分值总和≠满分 → 400', async () => {
    const res = await r.post('/api/teacher/questions', makeQuestion({
      title: '错误分值题',
      subQuestions: [
        { title: '题1', content: '<p>c1</p>', referenceAnswer: 'a1', score: 20, language: 'python' },
        { title: '题2', content: '<p>c2</p>', referenceAnswer: 'a2', score: 20, language: 'python' },
      ],
    }));
    expect(res.body.code).toBe(1001);
    expect(res.body.message).toContain('分值总和');
  });

  // Q5: 不填标题 → 400
  it('Q5: 不填标题 → 400', async () => {
    const res = await r.post('/api/teacher/questions', {
      maxScore: 100,
      difficulty: 'easy',
      subQuestions: [{ title: '题1', content: '<p>c1</p>', referenceAnswer: 'a1', language: 'python' }],
    });
    expect(res.body.code).toBe(1001);
  });

  // Q6: 不填小题 → 400
  it('Q6: 不填小题 → 400', async () => {
    const res = await r.post('/api/teacher/questions', {
      title: '无小题的题',
      maxScore: 100,
      difficulty: 'easy',
      subQuestions: [],
    });
    expect(res.body.code).toBe(1001);
  });

  // Q7: 更新题目分值（旧小题删除，新小题重建）
  it('Q7: 更新题目分值 → 旧小题删除，新小题重建', async () => {
    const createRes = await r.post('/api/teacher/questions', makeQuestion({
      title: '待更新题',
      subQuestions: [
        { title: '旧题1', content: '<p>c1</p>', referenceAnswer: 'a1', score: 50, language: 'python' },
        { title: '旧题2', content: '<p>c2</p>', referenceAnswer: 'a2', score: 50, language: 'python' },
      ],
    }));
    const id = createRes.body.data.id;

    const updateRes = await r.put(`/api/teacher/questions/${id}`, {
      title: '已更新题',
      maxScore: 100,
      difficulty: 'easy',
      subQuestions: [
        { title: '新题1', content: '<p>nc1</p>', referenceAnswer: 'na1', score: 40, language: 'java' },
        { title: '新题2', content: '<p>nc2</p>', referenceAnswer: 'na2', score: 60, language: 'java' },
      ],
    });
    expect(updateRes.body.code).toBe(0);

    const getRes = await r.get(`/api/teacher/questions/${id}`);
    expect(getRes.body.data.title).toBe('已更新题');
    expect(getRes.body.data.subQuestions).toHaveLength(2);
    expect(getRes.body.data.subQuestions[0].title).toBe('新题1');
  });

  // Q8: 编辑小题内容
  it('Q8: 编辑小题内容 → 参考答案更新', async () => {
    const createRes = await r.post('/api/teacher/questions', makeQuestion({
      title: '编辑小题测试',
      subQuestions: [
        { title: '题1', content: '<p>原内容</p>', referenceAnswer: '原答案', score: 100, language: 'python' },
      ],
    }));
    const id = createRes.body.data.id;

    await r.put(`/api/teacher/questions/${id}`, {
      title: '编辑小题测试',
      maxScore: 100,
      difficulty: 'easy',
      subQuestions: [
        { title: '题1', content: '<p>新内容</p>', referenceAnswer: '新答案', score: 100, language: 'python' },
      ],
    });

    const getRes = await r.get(`/api/teacher/questions/${id}`);
    expect(getRes.body.data.subQuestions[0].content).toBe('<p>新内容</p>');
    expect(getRes.body.data.subQuestions[0].referenceAnswer).toBe('新答案');
  });

  // Q9: 删除题目
  it('Q9: 删除题目 → 200, GET 不再返回', async () => {
    const createRes = await r.post('/api/teacher/questions', makeQuestion({ title: '待删除题' }));
    const id = createRes.body.data.id;

    const delRes = await r.delete(`/api/teacher/questions/${id}`);
    expect(delRes.body.code).toBe(0);

    const getRes = await r.get(`/api/teacher/questions/${id}`);
    expect(getRes.status).toBe(404);
  });

  // Q10: 创建含材料
  it('Q10: 创建含材料 → material 字段存储正确', async () => {
    const res = await r.post('/api/teacher/questions', makeQuestion({
      title: '含材料题',
      material: '<p>这是材料内容</p>',
    }));
    expect(res.body.code).toBe(0);
    expect(res.body.data.material).toBe('<p>这是材料内容</p>');
  });

  // Q11: 列表分页
  it('Q11: 列表分页 → total/list/page 正确', async () => {
    const res = await r.get('/api/teacher/questions?page=1&pageSize=2');
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('list');
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(2);
    expect(res.body.data.list.length).toBeLessThanOrEqual(2);
  });

  // Q12: 列表按关键词搜索
  it('Q12: 列表按关键词搜索 → 返回匹配项', async () => {
    await r.post('/api/teacher/questions', makeQuestion({ title: '期中考试专用题' }));

    const res = await r.get('/api/teacher/questions?keyword=期中');
    expect(res.body.code).toBe(0);
    expect(res.body.data.list.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.list.every(q => q.title.includes('期中'))).toBe(true);
  });

  // Q13: 详情含小题排序
  it('Q13: 详情含小题按 sortOrder 升序', async () => {
    const createRes = await r.post('/api/teacher/questions', makeQuestion({
      title: '排序测试',
      subQuestions: [
        { title: '第3题', content: '<p>c3</p>', referenceAnswer: 'a3', score: 30, language: 'python' },
        { title: '第1题', content: '<p>c1</p>', referenceAnswer: 'a1', score: 30, language: 'python' },
        { title: '第2题', content: '<p>c2</p>', referenceAnswer: 'a2', score: 40, language: 'python' },
      ],
    }));
    const id = createRes.body.data.id;

    const getRes = await r.get(`/api/teacher/questions/${id}`);
    const orders = getRes.body.data.subQuestions.map(sq => sq.sortOrder);
    expect(orders).toEqual([1, 2, 3]);
  });
});
