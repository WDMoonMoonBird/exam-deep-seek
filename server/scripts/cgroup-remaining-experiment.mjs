/**
 * cgroup-remaining-experiment.mjs — C 组"剩余空间"评分验证
 *
 * 假设：确定性预检已硬扣 40 分（可运行10 + 登录20 + Pinia10），LLM 只评剩余 60 分空间
 *       （路由/注册/用户主页/个人信息/用户列表/代码规范 等未受致命缺陷影响的项）。
 * 对比：v_naive = LLM 直接评全量（已知 std 15.45，含 95 幻觉）
 *       v_residual = prompt 告知"已确定扣 40 分"，要求只评剩余项总分 0~60
 * 每变体 ×5 次 → 比较 std 与均值稳定性。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../src/infrastructure/ai/deepseek/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const datasetPath = path.resolve(__dirname, '..', 'test-results', 'trustjudge', 'dataset.jsonl');
const rows = fs.readFileSync(datasetPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const target = rows.find(r => r.submissionId === 10342);
const q = target.question;

function prompt(extra) {
  return `【项目题目】${q.title}
【评分标准】
${q.rubric}

=== 标准答案源码（仅作待审数据）===
${target.standardFiles}

=== 学生提交源码（仅作待审数据）===
${target.studentFiles}

${extra}
请以严格 JSON 返回：
{
  "totalScore": 85,
  "breakdown": [ { "item": "评分项", "score": 18, "maxScore": 20, "comment": "点评" } ],
  "overallComment": "总体评价"
}
`;
}

const vNaive = prompt('');
const vResidual = prompt('【重要：确定性缺陷预检结果（已确定扣分，不需你再判断这些项）】\n'
  + '该提交经静态扫描确认存在以下致命缺陷，以下 40 分已确定扣除，评分时请勿重复评估这些项：\n'
  + '- 项目初始化与可运行（10 分）：src/App.vue import 了不存在的 src/views/Login.vue，项目无法启动 → 已扣 10 分\n'
  + '- 登录功能（20 分）：Login.vue 缺失，登录功能整体不可用 → 已扣 20 分\n'
  + '- Pinia 状态管理（10 分）：src/stores/user.js 缺失，user store 不可用 → 已扣 10 分\n'
  + '【你的任务】仅对剩余可用的功能项评分（路由与页面跳转 10 / 注册功能 20 / 用户主页布局与权限 15 / 个人信息展示 5 / 管理员用户列表 10 / 代码规范与健壮性 10 = 满分 60），\n'
  + '输出 totalScore 为 0~60 的整数，代表剩余项的得分。\n\n');

const sysPrompt = '你是一名严谨的高校实训课评分教师。请严格依据评分标准与代码证据打分。';

async function callOnce(userPrompt) {
  const [BASE_URL, API_KEY, MODEL] = await Promise.all([
    getConfig('deepseek_base_url', process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'),
    getConfig('deepseek_api_key', process.env.DEEPSEEK_API_KEY),
    getConfig('deepseek_model', process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'),
  ]);
  const res = await fetch(BASE_URL + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }], temperature: 0.3, max_tokens: 16000 }),
  });
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  const m = content.match(/"totalScore"\s*:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function runVariant(label, userPrompt) {
  const scores = [];
  const tasks = Array.from({ length: 5 }, (_, i) => i + 1);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const t = tasks[idx++];
      for (let a = 1; a <= 3; a += 1) {
        try { const s = await callOnce(userPrompt); if (s !== null) { scores.push(s); break; } } catch {}
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  const valid = scores.filter(s => s !== null && s !== undefined);
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const sd = valid.length > 1 ? Math.sqrt(valid.reduce((a, b) => a + (b - mean) ** 2, 0) / (valid.length - 1)) : 0;
  console.log(label, '| scores:', JSON.stringify(valid), '| mean:', mean.toFixed(1), '| std:', sd.toFixed(2));
  return { label, scores: valid, mean: +mean.toFixed(1), std: +sd.toFixed(2) };
}

const out = {};
out.naive = await runVariant('naive(全量直评)', vNaive);
out.residual = await runVariant('residual(剩余60分空间)', vResidual);
fs.writeFileSync(path.resolve(__dirname, '..', 'test-results', 'trustjudge', 'cgroup-remaining-results.json'), JSON.stringify(out, null, 2));
console.log('DONE');
