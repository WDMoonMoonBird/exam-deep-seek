/**
 * checker-service.test.js — AI 评分规则生成服务（checkerService）单元测试（离线，纯函数）。
 * 测纯函数 parseCheckerResult（旧脚本结果，保留）：完整 JSON / markdown 围栏 / 截断补全 / 非法输入 / null，
 * 以及归一化逻辑（score 越界截断、非法项丢弃）。
 * 测新纯函数 parseCheckerRules（规则驱动）：完整规则 / 围栏 / id 补缺省 / 截断补全 / 非法输入 / 总和错误（validateRules）。
 * 另附 runCheckerScript 子进程沙箱执行的可选测试（成功 + 运行抛错，旧脚本流程保留）。
 * Team B 2026-08-18 新增：findMisplacedSubjective（subjective 分类分项误入 objective_items 的校验）。
 * 不测 generateChecker（真实 LLM 调用）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCheckerResult, parseCheckerRules, runCheckerScript, attachNegativeFeedback, findMisplacedSubjective } from '../../../src/services/checkerService.js';

/** 创建临时目录（测试后清理） */
function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'checker-svc-test-'));
}

describe('parseCheckerResult — 完整 JSON 解析', () => {
  it('解析完整结果：items/subjective 保留，item 名 trim', () => {
    const output = JSON.stringify({
      totalScore: 85,
      items: [
        { item: ' 登录功能 ', maxScore: 50, score: 40, evidence: 'src/login.js:3 未处理空密码' },
        { item: '文件结构', maxScore: 30, score: 30, evidence: '' },
      ],
      subjective: [{ item: '代码可读性', maxScore: 20 }],
    });
    const r = parseCheckerResult(output);
    expect(r).not.toBeNull();
    expect(r.totalScore).toBe(85);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toEqual({ item: '登录功能', maxScore: 50, score: 40, evidence: 'src/login.js:3 未处理空密码' });
    // evidence 为空串 → 项保留但不带 evidence 字段
    expect(r.items[1]).toEqual({ item: '文件结构', maxScore: 30, score: 30 });
    expect(r.subjective).toEqual([{ item: '代码可读性', maxScore: 20 }]);
  });

  it('JSON 前后存在说明文字也能提取', () => {
    const output = '检查结果如下：\n' + JSON.stringify({ totalScore: 100, items: [], subjective: [] }) + '\n（以上为最终结果）';
    const r = parseCheckerResult(output);
    expect(r).not.toBeNull();
    expect(r.totalScore).toBe(100);
    expect(r.items).toEqual([]);
    expect(r.subjective).toEqual([]);
  });
});

describe('parseCheckerResult — markdown 围栏剥离', () => {
  it('```json 围栏内 JSON 可解析', () => {
    const output = '```json\n{"totalScore": 60, "items": [{"item": "A", "maxScore": 10, "score": 6}], "subjective": []}\n```';
    const r = parseCheckerResult(output);
    expect(r).not.toBeNull();
    expect(r.totalScore).toBe(60);
    expect(r.items).toEqual([{ item: 'A', maxScore: 10, score: 6 }]);
  });

  it('```js 围栏 + 前导说明文字', () => {
    const output = '生成的脚本检查结果：\n```js\n{"totalScore": 90, "items": [{"item": "B", "maxScore": 50, "score": 50, "evidence": "b.js:1"}], "subjective": [{"item": "S", "maxScore": 40}]}\n```';
    const r = parseCheckerResult(output);
    expect(r).not.toBeNull();
    expect(r.totalScore).toBe(90);
    expect(r.subjective).toEqual([{ item: 'S', maxScore: 40 }]);
  });
});

describe('parseCheckerResult — 截断补全', () => {
  it('JSON 缺末尾闭合（max_tokens 截断）→ 括号补全修复', () => {
    // max_tokens 截断：切断在 subjective 数组内部（最后是完整字符串 "可读性"，其后仅有结构残尾）
    const output = '{"totalScore": 85, "items": [{"item": "登录功能", "maxScore": 50, "score": 50, "evidence": "src/login.js:3"}, {"item": "注册功能", "maxScore": 50, "score": 35, "evidence": "src/reg.js:7"}], "subjective": [{"item": "可读性", "maxScore": 15';
    const r = parseCheckerResult(output);
    expect(r).not.toBeNull();
    expect(r.totalScore).toBe(85);
    expect(r.items).toHaveLength(2);
    expect(r.items[1]).toEqual({ item: '注册功能', maxScore: 50, score: 35, evidence: 'src/reg.js:7' });
  });

  it('截断到字符串中间 → 无法修复，返回 null', () => {
    const output = '{"totalScore": 85, "items": [{"item": "登录功能", "maxScore": 50, "score": 50}, {"item": "注';
    expect(parseCheckerResult(output)).toBeNull();
  });
});

describe('parseCheckerResult — 非法输入', () => {
  it('结构非法：items 不是数组 → null', () => {
    expect(parseCheckerResult('{"totalScore": 80, "items": "oops", "subjective": []}')).toBeNull();
  });

  it('结构非法：subjective 不是数组 → null', () => {
    expect(parseCheckerResult('{"totalScore": 80, "items": [], "subjective": {}}')).toBeNull();
  });

  it('totalScore 缺失/非数字 → null', () => {
    expect(parseCheckerResult('{"items": [], "subjective": []}')).toBeNull();
    expect(parseCheckerResult('{"totalScore": "abc", "items": [], "subjective": []}')).toBeNull();
  });

  it('totalScore 为数组/对象/null（Number 强转会误判）→ null', () => {
    expect(parseCheckerResult('{"totalScore": [], "items": [], "subjective": []}')).toBeNull();
    expect(parseCheckerResult('{"totalScore": null, "items": [], "subjective": []}')).toBeNull();
  });

  it('不是 JSON 文本 → null', () => {
    expect(parseCheckerResult('这不是 JSON')).toBeNull();
    expect(parseCheckerResult('const x = 1;')).toBeNull();
  });
});

describe('parseCheckerResult — null / 空输入', () => {
  it('null / undefined / 空串 / 纯空白 / 非字符串 → null', () => {
    expect(parseCheckerResult(null)).toBeNull();
    expect(parseCheckerResult(undefined)).toBeNull();
    expect(parseCheckerResult('')).toBeNull();
    expect(parseCheckerResult('   \n  ')).toBeNull();
    expect(parseCheckerResult(123)).toBeNull();
    expect(parseCheckerResult({ totalScore: 80 })).toBeNull();
  });

  it('不含 totalScore 的合法 JSON → null', () => {
    expect(parseCheckerResult('{"score": 80}')).toBeNull();
  });
});

describe('parseCheckerResult — 归一化：score 越界截断', () => {
  it('score 超过 maxScore → 截断为 maxScore', () => {
    const r = parseCheckerResult('{"totalScore": 120, "items": [{"item": "A", "maxScore": 100, "score": 120}, {"item": "B", "maxScore": 30, "score": 99}], "subjective": []}');
    expect(r).not.toBeNull();
    expect(r.items[0].score).toBe(100);
    expect(r.items[1].score).toBe(30);
  });

  it('score 为负数 → 截断为 0', () => {
    const r = parseCheckerResult('{"totalScore": -5, "items": [{"item": "A", "maxScore": 50, "score": -5}], "subjective": []}');
    expect(r).not.toBeNull();
    expect(r.items[0].score).toBe(0);
  });

  it('score 为数字字符串 → 转数字并截断', () => {
    const r = parseCheckerResult('{"totalScore": 40, "items": [{"item": "A", "maxScore": 50, "score": "40"}], "subjective": []}');
    expect(r).not.toBeNull();
    expect(r.items[0].score).toBe(40);
  });
});

describe('parseCheckerResult — 归一化：非法项丢弃', () => {
  it('缺 item 名 / item 非字符串 / 名称为空白 → 丢弃', () => {
    const r = parseCheckerResult('{"totalScore": 60, "items": [{"maxScore": 10, "score": 5}, {"item": 123, "maxScore": 10, "score": 5}, {"item": "   ", "maxScore": 10, "score": 5}, {"item": " 有效项 ", "maxScore": 10, "score": 5}], "subjective": []}');
    expect(r).not.toBeNull();
    expect(r.items).toHaveLength(1);
    expect(r.items[0].item).toBe('有效项');
  });

  it('maxScore 非数字 / 非正数 → 丢弃', () => {
    const r = parseCheckerResult('{"totalScore": 60, "items": [{"item": "A", "score": 5}, {"item": "B", "maxScore": "x", "score": 5}, {"item": "C", "maxScore": 0, "score": 5}, {"item": "D", "maxScore": 10, "score": 5}], "subjective": []}');
    expect(r).not.toBeNull();
    expect(r.items.map((i) => i.item)).toEqual(['D']);
  });

  it('score 非数字 → 丢弃', () => {
    const r = parseCheckerResult('{"totalScore": 60, "items": [{"item": "A", "maxScore": 10, "score": "x"}, {"item": "B", "maxScore": 10, "score": 6}], "subjective": []}');
    expect(r).not.toBeNull();
    expect(r.items.map((i) => i.item)).toEqual(['B']);
  });

  it('evidence 非字符串 → 项保留但不带 evidence；字符串 evidence trim', () => {
    const r = parseCheckerResult('{"totalScore": 60, "items": [{"item": "A", "maxScore": 10, "score": 6, "evidence": 123}, {"item": "B", "maxScore": 10, "score": 6, "evidence": " b.js:2 "}], "subjective": []}');
    expect(r).not.toBeNull();
    expect(r.items[0]).toEqual({ item: 'A', maxScore: 10, score: 6 });
    expect(r.items[1].evidence).toBe('b.js:2');
  });

  it('subjective 非法项丢弃、item 名 trim', () => {
    const r = parseCheckerResult('{"totalScore": 100, "items": [], "subjective": [{"maxScore": 10}, {"item": 1, "maxScore": 10}, {"item": " 主观项 ", "maxScore": 20}, {"item": "坏项", "maxScore": "x"}]}');
    expect(r).not.toBeNull();
    expect(r.subjective).toEqual([{ item: '主观项', maxScore: 20 }]);
  });

  it('全部非法项被丢弃后 items 为空数组（不返回 null）', () => {
    const r = parseCheckerResult('{"totalScore": 0, "items": [{"score": 5}, {"item": 1, "maxScore": 5, "score": 5}], "subjective": []}');
    expect(r).not.toBeNull();
    expect(r.items).toEqual([]);
    expect(r.totalScore).toBe(0);
  });
});

describe('parseCheckerRules — 完整规则 JSON 解析', () => {
  it('解析完整规则：id 保留、item trim、max_score 取整', () => {
    const output = JSON.stringify({
      max_score: 100,
      objective_items: [
        { id: 'a1', group: '项目初始化与运行', item: ' package.json 存在 ', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 2 },
        { id: 'a2', group: '项目初始化与运行', item: '入口文件存在', rule_type: 'file_exists', params: { path: 'src/main.js' }, max_score: 8.4 },
      ],
      subjective_items: [{ id: 's1', item: '代码可读性', max_score: 90 }],
    });
    const r = parseCheckerRules(output);
    expect(r).not.toBeNull();
    expect(r.max_score).toBe(100);
    expect(r.objective_items).toHaveLength(2);
    expect(r.objective_items[0]).toEqual({ id: 'a1', group: '项目初始化与运行', item: 'package.json 存在', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 2 });
    expect(r.objective_items[1].max_score).toBe(8); // Math.round(8.4)
    expect(r.subjective_items).toEqual([{ id: 's1', item: '代码可读性', max_score: 90 }]);
  });

  it('id 缺省自动补全：objective a1/a2…、subjective s1/s2…，已有 id 保留', () => {
    const output = JSON.stringify({
      max_score: 100,
      objective_items: [
        { group: 'G1', item: '第一个文件', rule_type: 'file_exists', params: { path: 'a.txt' }, max_score: 10 },
        { id: 'keep1', group: 'G2', item: '第二个文件', rule_type: 'file_exists', params: { path: 'b.txt' }, max_score: 30 },
      ],
      subjective_items: [
        { item: '代码可读性', max_score: 50 },
        { id: 's2', item: '健壮性', max_score: 10 },
      ],
    });
    const r = parseCheckerRules(output);
    expect(r).not.toBeNull();
    expect(r.objective_items.map((i) => i.id)).toEqual(['a1', 'keep1']);
    expect(r.subjective_items.map((i) => i.id)).toEqual(['s1', 's2']);
  });

  it('JSON 前后存在说明文字 + ```json 围栏也能提取', () => {
    const output = '生成的规则如下：\n```json\n' + JSON.stringify({
      max_score: 100,
      objective_items: [
        { id: 'a1', group: 'G', item: '入口文件', rule_type: 'file_exists', params: { path: 'src/main.js' }, max_score: 60 },
      ],
      subjective_items: [{ id: 's1', item: '代码风格', max_score: 40 }],
    }) + '\n```\n（以上为最终规则）';
    const r = parseCheckerRules(output);
    expect(r).not.toBeNull();
    expect(r.max_score).toBe(100);
    expect(r.objective_items[0].item).toBe('入口文件');
  });

  it('max_tokens 截断 → 括号补全修复（未闭合项被丢弃，已闭合项保留）', () => {
    const output = '{"max_score": 100, "objective_items": [{"id": "a1", "item": "文件存在", "rule_type": "file_exists", "params": {"path": "package.json"}, "max_score": 60}], "subjective_items": [{"id": "s1", "item": "可读性", "max_score": 40}, {"id": "s2", "item": "健壮性"';
    const r = parseCheckerRules(output);
    expect(r).not.toBeNull();
    expect(r.max_score).toBe(100);
    expect(r.objective_items).toHaveLength(1);
    expect(r.subjective_items).toHaveLength(1); // s2 截断被丢弃，仅剩 s1
    expect(r.subjective_items[0].id).toBe('s1');
  });
});

describe('parseCheckerRules — 非法输入', () => {
  it('null / undefined / 空串 / 纯空白 / 非字符串 → null', () => {
    expect(parseCheckerRules(null)).toBeNull();
    expect(parseCheckerRules(undefined)).toBeNull();
    expect(parseCheckerRules('')).toBeNull();
    expect(parseCheckerRules('   \n  ')).toBeNull();
    expect(parseCheckerRules(123)).toBeNull();
    expect(parseCheckerRules({ max_score: 100 })).toBeNull();
  });

  it('不是 JSON / 不含 max_score → null', () => {
    expect(parseCheckerRules('这不是 JSON')).toBeNull();
    expect(parseCheckerRules('const x = 1;')).toBeNull();
    expect(parseCheckerRules('{"score": 100}')).toBeNull();
  });

  it('max_score 缺失 / 非数字 / 非正数 → null', () => {
    expect(parseCheckerRules('{"objective_items": [], "subjective_items": []}')).toBeNull();
    expect(parseCheckerRules('{"max_score": "abc", "objective_items": [], "subjective_items": []}')).toBeNull();
    expect(parseCheckerRules('{"max_score": 0, "objective_items": [], "subjective_items": []}')).toBeNull();
    expect(parseCheckerRules('{"max_score": -5, "objective_items": [], "subjective_items": []}')).toBeNull();
  });

  it('objective_items / subjective_items 不是数组 → null', () => {
    expect(parseCheckerRules('{"max_score": 100, "objective_items": "oops", "subjective_items": []}')).toBeNull();
    expect(parseCheckerRules('{"max_score": 100, "objective_items": [], "subjective_items": {}}')).toBeNull();
    expect(parseCheckerRules('{"max_score": 100}')).toBeNull();
  });

  it('rule_type 不在白名单 → 该项丢弃后总和归一化补差（仍合法，总和=max_score）', () => {
    const output = JSON.stringify({
      max_score: 100,
      objective_items: [
        { id: 'a1', item: '坏规则', rule_type: 'not_a_rule', params: { path: 'x' }, max_score: 10 },
        { id: 'a2', item: '好规则', rule_type: 'file_exists', params: { path: 'package.json' }, max_score: 40 },
      ],
      subjective_items: [{ id: 's1', item: '主观项', max_score: 50 }],
    });
    const r = parseCheckerRules(output);
    expect(r).not.toBeNull();
    const objSum = r.objective_items.reduce((s, x) => s + x.max_score, 0);
    const subSum = r.subjective_items.reduce((s, x) => s + x.max_score, 0);
    expect(objSum + subSum).toBe(100);
    expect(r.objective_items[0].max_score).toBe(50); // 40 → 补差 50
  });
});

describe('parseCheckerRules — 总和错误（validateRules 校验）', () => {
  it('objective + subjective 总分 ≠ max_score → 归一化补差（总和对齐满分）', () => {
    const output = JSON.stringify({
      max_score: 100,
      objective_items: [
        { id: 'a1', group: 'G', item: '入口文件存在', rule_type: 'file_exists', params: { path: 'src/main.js' }, max_score: 40 },
      ],
      subjective_items: [{ id: 's1', item: '代码可读性', max_score: 30 }],
    });
    const r = parseCheckerRules(output);
    expect(r).not.toBeNull();
    const objSum = r.objective_items.reduce((s, x) => s + x.max_score, 0);
    const subSum = r.subjective_items.reduce((s, x) => s + x.max_score, 0);
    expect(objSum + subSum).toBe(100);
    expect(r.objective_items[0].max_score).toBe(70); // 40 → 补差 70
  });

  it('缺少 subjective_items 键 → 容错为空数组（模型常见省略）', () => {
    const r = parseCheckerRules('{"max_score": 100, "objective_items": []}');
    expect(r).not.toBeNull();
    expect(r.subjective_items).toEqual([]);
  });
});

describe('runCheckerScript — 沙箱执行（可选，子进程真实执行）', () => {
  it('简单脚本在 rootDir 上执行并返回结果 JSON', async () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'main.js'), 'export const a = 1;');
      const script = [
        'module.exports = {',
        '  check(rootDir) {',
        '    const fs = require(\'fs\');',
        '    const files = fs.readdirSync(rootDir);',
        '    const hasMain = files.includes(\'main.js\');',
        '    return {',
        '      totalScore: hasMain ? 100 : 0,',
        '      items: [{ item: \'入口文件\', maxScore: 100, score: hasMain ? 100 : 0, evidence: hasMain ? \'\' : \'缺少 main.js\' }],',
        '      subjective: [],',
        '    };',
        '  },',
        '};',
      ].join('\n');
      const result = await runCheckerScript(script, dir);
      expect(result.totalScore).toBe(100);
      expect(result.items[0].score).toBe(100);
      expect(result.subjective).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('脚本运行抛错 → 抛错且错误信息含 stderr 片段', async () => {
    const dir = tmpdir();
    try {
      const script = 'module.exports = { check() { throw new Error(\'boom-checker\'); } };';
      await expect(runCheckerScript(script, dir)).rejects.toThrow(/boom-checker|检查脚本执行失败/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});


describe('findMisplacedSubjective — subjective 分类项误入 objective_items 校验（Team B 三分类）', () => {
  const fixedItems = [
    { item: '登录功能', maxScore: 40, automation_level: 'deterministic' },
    { item: '界面美观', maxScore: 20, automation_level: 'subjective' },
    { item: '代码可读性', maxScore: 20, automation_level: 'subjective' },
    { item: '组件复用', maxScore: 20, automation_level: 'semi' },
  ];

  it('subjective 分项以 group 名写入 objective_items → 命中并返回该分项名', () => {
    const rules = {
      max_score: 100,
      objective_items: [
        { id: 'a1', group: '登录功能', item: '存在 login.js', rule_type: 'file_exists', params: { path: 'login.js' }, max_score: 40 },
        { id: 'a2', group: '界面美观', item: '界面颜色搭配合理', rule_type: 'contains_text', params: { path: 'src/main.js' }, max_score: 20 },
      ],
      subjective_items: [{ id: 's1', item: '代码可读性', max_score: 20 }, { id: 's2', item: '组件复用', max_score: 20 }],
    };
    expect(findMisplacedSubjective(rules, fixedItems)).toEqual(['界面美观']);
  });

  it('subjective 分项以「分项名（检查描述）」写入 objective_items.item → 命中', () => {
    const rules = {
      max_score: 100,
      objective_items: [
        { id: 'a1', group: '登录功能', item: '存在 login.js', rule_type: 'file_exists', params: { path: 'login.js' }, max_score: 60 },
        { id: 'a2', group: '其他', item: '代码可读性（命名规范）', rule_type: 'contains_regex', params: { path: 'src' }, max_score: 20 },
      ],
      subjective_items: [{ id: 's1', item: '界面美观', max_score: 20 }],
    };
    expect(findMisplacedSubjective(rules, fixedItems)).toEqual(['代码可读性']);
  });

  it('subjective 分项全部在 subjective_items → 通过（空数组）；semi 项进 objective 不触发', () => {
    const rules = {
      max_score: 100,
      objective_items: [
        { id: 'a1', group: '登录功能', item: '存在 login.js', rule_type: 'file_exists', params: { path: 'login.js' }, max_score: 40 },
        { id: 'a2', group: '组件复用', item: '组件数量达标', rule_type: 'count_regex', params: { path: 'src' }, max_score: 20 },
      ],
      subjective_items: [{ id: 's1', item: '界面美观', max_score: 20 }, { id: 's2', item: '代码可读性', max_score: 20 }],
    };
    expect(findMisplacedSubjective(rules, fixedItems)).toEqual([]);
  });

  it('旧数据（无 automation_level，兜底 deterministic）→ 不触发校验', () => {
    const oldFixed = [{ item: '界面美观', maxScore: 20 }];
    const rules = {
      max_score: 100,
      objective_items: [{ id: 'a1', group: '界面美观', item: '界面美观（颜色）', rule_type: 'contains_text', params: { path: 'a' }, max_score: 100 }],
      subjective_items: [],
    };
    expect(findMisplacedSubjective(rules, oldFixed)).toEqual([]);
  });

  it('fixedItems 为 null / rules 非法 → 空数组（不抛错）', () => {
    expect(findMisplacedSubjective({ max_score: 100, objective_items: [] }, null)).toEqual([]);
    expect(findMisplacedSubjective(null, fixedItems)).toEqual([]);
    expect(findMisplacedSubjective({ max_score: 100 }, fixedItems)).toEqual([]);
  });
});

describe('attachNegativeFeedback — 负例验证反馈接线（Team A，纯函数）', () => {
  it('weakRules 非空时挂载到反馈对象，保留既有字段（result/deductions/defectItems）', () => {
    const feedback = attachNegativeFeedback(
      {
        result: { totalScore: 80 },
        defectItems: ['标准包缺陷候选（保留项）'],
        deductions: [{ id: 'a1', item: '存在 package.json', score: 0, max_score: 5, evidence: '缺少' }],
      },
      [
        { id: 'a1', item: '存在 package.json', reason: '缺陷变体上规则仍得 5/5 分：无法区分真实实现与表面实现' },
        { id: 'a2', item: '依赖包含 vue', reason: '缺陷变体上规则仍得 5/5 分' },
      ],
    );
    expect(feedback.weakRules).toHaveLength(2);
    expect(feedback.weakRules[0]).toEqual({
      id: 'a1',
      item: '存在 package.json',
      reason: '缺陷变体上规则仍得 5/5 分：无法区分真实实现与表面实现',
    });
    expect(feedback.result.totalScore).toBe(80);
    expect(feedback.defectItems).toHaveLength(1);
    expect(feedback.deductions).toHaveLength(1);
  });

  it('无 weakRules / 非数组 / null 反馈 → weakRules 恒为空数组，不污染既有反馈', () => {
    const f1 = attachNegativeFeedback({ error: '规则解析失败' }, undefined);
    expect(f1.weakRules).toEqual([]);
    expect(f1.error).toBe('规则解析失败');
    const f2 = attachNegativeFeedback({ deductions: [] }, 'not-an-array');
    expect(f2.weakRules).toEqual([]);
    expect(f2.deductions).toEqual([]);
    const f3 = attachNegativeFeedback(null, null);
    expect(f3).toEqual({ weakRules: [] });
  });
});
