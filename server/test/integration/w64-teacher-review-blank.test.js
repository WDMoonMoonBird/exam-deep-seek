/**
 * W64（R2-B47 / t26）：U-1「返回后空白」的**根因复现 + 修法验证**（挂载级：直接执行页面里真实的函数体）。
 *
 * 复现方式（不是"读代码猜"）：从 SFC 源码中**抽取真实函数体**（括号配对，不改一字），在受控 sandbox 里执行：
 *   · request 抛错（HTTP 4xx/5xx/网络异常）⇒ 观察 loading 是否复位、是否有可读错态；
 *   · request 正常 ⇒ 观察数据是否重建。
 * 结论（修复后）：任何路径 loading 必复位且错态可读 ⇒ 不白屏；变异（把 finally 去掉）⇒ 断言失败（见 R2-B47 记录 §4）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEACHER = path.resolve(__dirname, '..', '..', '..', 'client', 'src', 'views', 'teacher');

/** 从 SFC 中抽取函数体（含 function 关键字那一行到配对右括号） */
function extractFunction(source, header) {
  const start = source.indexOf(header);
  expect(start).toBeGreaterThan(-1);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart + 1, i);
    }
  }
  throw new Error('unbalanced braces for ' + header);
}

/** ★R2-B65（t6）：用真实函数体建一个**同步**可执行体（有返回值；与 buildRunner 同口径：不改一字） */
function buildFunctionRunner(body, name) {
  // eslint-disable-next-line no-new-func
  return new Function('sandbox', 'err', 'with (sandbox) { return (function ' + name + '(err) {' + body + '})(err); }');
}

/** 用真实函数体建一个可执行体（sandbox 内的名字即页面里的名字） */
function buildRunner(body) {
  // eslint-disable-next-line no-new-func
  return new Function('sandbox', 'with (sandbox) { return (async () => {' + body + '})(); }');
}

function readSfc(file) { return fs.readFileSync(path.join(TEACHER, file), 'utf8'); }

function makeSandbox(overrides = {}) {
  const state = {
    loading: { value: false },
    loadError: { value: '' },
    list: { value: [] },
    pagination: { current: 1, pageSize: 20, total: 0 },
    filter: { value: 'all' },
    keyword: { value: '' },
    sortField: { value: '' },
    sortOrder: { value: '' },
    assignmentTitle: { value: '' },
    className: { value: '' },
    classId: { value: 7 },
    assignmentId: { value: 3 },
    route: { params: { classId: '7' }, query: { assignmentId: '3' } },
  };
  return Object.assign(state, overrides);
}

describe('W64 U-1「返回后空白」根因复现（R2-B47）', () => {
  it('★W64-1 ReviewClass.fetch：请求失败 ⇒ loading 必复位 + 错态可读（旧实现停在 loading ⇒ 空白）', async () => {
    const src = readSfc('ReviewClass.vue');
    const body = extractFunction(src, 'async function fetch(');
    // ★R2-B65（t6 修复）：fetch 体现已改为 `loadError.value = friendlyLoadError(e)`（R2-B54：原始错误只进 console、不上屏）。
    //   sandbox 注入**同一 SFC 里真实的 friendlyLoadError 函数体**（与 fetch 同一种抽取方式，不改一字），不用手写替身。
    const friendlyRunner = buildFunctionRunner(extractFunction(src, 'function friendlyLoadError('), 'friendlyLoadError');
    const runFriendly = (err) => friendlyRunner({ console: { error: () => {} } }, err);
    // ① 失败路径
    const fail = makeSandbox({
      friendlyLoadError: runFriendly,
      request: { get: async () => { const e = new Error('boom'); e.response = { status: 500, data: { message: '服务器内部错误' } }; throw e; } },
    });
    // 让请求"挂起"也行：这里直接抛错，等价于 4xx/5xx/网络失败
    await buildRunner(body)(fail);
    expect(fail.loading.value).toBe(false);        // ★关键：旧代码此处置 true ⇒ 页面永久 loading/空白
    expect(fail.list.value).toEqual([]);
    expect(fail.loadError.value).toBe('数据加载失败，请重试');    // ★R2-B54 口径：错态可读（固定友好文案）
    expect(fail.loadError.value).not.toContain('服务器内部错误');      // ★原始错误只进 console，不上屏（不泄漏内部信息）
    // ② 成功路径
    const ok = makeSandbox({
      friendlyLoadError: runFriendly,
      request: { get: async () => ({ data: { list: [{ id: 1, studentName: '张三', assignmentTitle: 'T', className: 'C' }], total: 3 } }) },
    });
    await buildRunner(body)(ok);
    expect(ok.loading.value).toBe(false);
    expect(ok.list.value).toHaveLength(1);
    expect(ok.pagination.total).toBe(3);
    expect(ok.loadError.value).toBe('');
    expect(ok.assignmentTitle.value).toBe('T');
  }, 60000);

  it('★W64-2 路由参数在**请求时**读取（换班/重入不会再用 setup 期的旧值）', async () => {
    const src = readSfc('ReviewClass.vue');
    const body = extractFunction(src, 'async function fetch(');
    const seen = [];
    const sb = makeSandbox({
      request: { get: async (url, opts) => { seen.push({ url, params: opts.params }); return { data: { list: [], total: 0 } }; } },
    });
    const run = buildRunner(body);
    await run(sb);
    // 模拟路由重入：同一组件复用、classId/assignmentId 变化（旧实现是 setup 期 const ⇒ 永远第一次的值）
    sb.route.params.classId = '99';
    sb.route.query.assignmentId = '5';
    sb.classId.value = 99; sb.assignmentId.value = 5;
    await run(sb);
    expect(seen[0].url).toBe('/teacher/review-class/7');
    expect(seen[1].url).toBe('/teacher/review-class/99');            // ★跟随当前路由
    expect(seen[1].params.assignmentId).toBe(5);
    // 源码契约：参数是 computed（无 setup 期一次性捕获），且有路由变化 watch（重入重建数据）
    expect(src).toContain('const classId = computed(() => +route.params.classId)');
    expect(src).not.toMatch(/^const classId = \+route\.params\.classId/m);
    expect(src).toMatch(/watch\(\(\) => \[route\.params\.classId, route\.query\.assignmentId\]/);
  }, 60000);

  it('★W64-3 返回落点确定性：站内复审历史 ⇒ back()；无历史/落点越界 ⇒ 显式回 /teacher/review', async () => {
    const src = readSfc('ProjectReviewNew.vue');
    const body = extractFunction(src, 'function goBack(');
    const run = buildRunner(body);
    const mk = (backPath) => {
      const calls = [];
      const sandbox = {
        router: {
          options: { history: { state: backPath === undefined ? {} : { back: backPath } } },
          back: () => calls.push('back'),
          push: (to) => calls.push('push:' + to),
        },
      };
      return { sandbox, calls };
    };
    const a = mk('/teacher/review/class/7?assignmentId=3');           // 站内复审流 ⇒ 回上一页
    await run(a.sandbox);
    expect(a.calls).toEqual(['back']);
    const b = mk('/login');                                          // 落点在复审流外 ⇒ 显式回复审列表（不"什么都不做"）
    await run(b.sandbox);
    expect(b.calls).toEqual(['push:/teacher/review']);
    const c = mk(undefined);                                         // 无历史（直接打开/新标签页）⇒ 兜底
    await run(c.sandbox);
    expect(c.calls).toEqual(['push:/teacher/review']);
    // 两页都已接线（源码契约）
    expect(readSfc('ReviewDetail.vue')).toContain('@click="goBack"');
    expect(src).toContain('@click="goBack"');
  }, 60000);
});
