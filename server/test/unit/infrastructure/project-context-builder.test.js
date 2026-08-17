/**
 * project-context-builder.test.js —— 实训题评分上下文构建器单元测试（离线，纯函数）。
 * 覆盖：文件树构建（临时目录）、白名单过滤（各语言/大小阈值/未知扩展名兜底）、
 * 目录权重、文件树文本序列化、AST 骨架提取（含 vue）、token 估算与预算截断。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildFileTree,
  SOURCE_WHITELIST,
  filterProjectFiles,
  DIR_WEIGHTS,
  computeWeight,
  buildFileTreeText,
  extractSkeleton,
  estimateTokens,
  BUDGET_TOKENS,
  truncateToBudget,
} from '../../../src/services/projectContextBuilder.js';

/** 创建临时目录（测试后清理） */
function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pcb-test-'));
}

describe('buildFileTree — 文件树构建', () => {
  it('递归收集：目录在前、同级按名排序、目录也入列表、path 为相对路径', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src', 'utils'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'zdir'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'a.java'), 'x');
      fs.writeFileSync(path.join(dir, 'b.js'), 'x');
      fs.writeFileSync(path.join(dir, 'src', 'index.js'), 'export const a = 1;');
      fs.writeFileSync(path.join(dir, 'src', 'utils', 'helper.ts'), 'export const h = 2;');
      fs.writeFileSync(path.join(dir, 'zdir', 'c.py'), 'x');

      const tree = buildFileTree(dir);
      const paths = tree.map((t) => t.path);
      // 前序 DFS：父目录先于子项；同级目录在前、按名排序
      expect(paths).toEqual([
        'src', 'src/utils', 'src/utils/helper.ts', 'src/index.js',
        'zdir', 'zdir/c.py',
        'a.java', 'b.js',
      ]);
      const srcDir = tree.find((t) => t.path === 'src');
      expect(srcDir.dir).toBe(true);
      expect(srcDir.ext).toBe('');
      const helper = tree.find((t) => t.path === 'src/utils/helper.ts');
      expect(helper.dir).toBe(false);
      expect(helper.ext).toBe('ts');
      expect(helper.size).toBe('export const h = 2;'.length);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('跳过 node_modules/.git/dist/build/.idea/.vscode/target 与隐藏文件', () => {
    const dir = tmpdir();
    try {
      for (const skip of ['node_modules', '.git', 'dist', 'build', '.idea', '.vscode', 'target']) {
        fs.mkdirSync(path.join(dir, skip), { recursive: true });
        fs.writeFileSync(path.join(dir, skip, 'inner.js'), 'skip');
      }
      fs.mkdirSync(path.join(dir, '.hidden-dir'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.hidden-dir', 'x.js'), 'skip');
      fs.writeFileSync(path.join(dir, '.env.local'), 'SECRET=1');
      fs.writeFileSync(path.join(dir, 'keep.js'), 'export const k = 1;');

      const tree = buildFileTree(dir);
      expect(tree.map((t) => t.path)).toEqual(['keep.js']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('目录 size 为该目录下全部文件大小之和', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'abc');       // 3
      fs.writeFileSync(path.join(dir, 'src', 'b.js'), 'hello');     // 5
      fs.mkdirSync(path.join(dir, 'src', 'sub'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'sub', 'c.js'), 'xy'); // 2
      const tree = buildFileTree(dir);
      const src = tree.find((t) => t.path === 'src');
      expect(src.size).toBe(10);
      const sub = tree.find((t) => t.path === 'src/sub');
      expect(sub.size).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('目录不存在 / 传入文件路径 → 空数组', () => {
    expect(buildFileTree('/nonexistent-pcb-xyz')).toEqual([]);
    expect(buildFileTree('')).toEqual([]);
    const dir = tmpdir();
    try {
      const f = path.join(dir, 'single.js');
      fs.writeFileSync(f, 'x');
      expect(buildFileTree(f)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('SOURCE_WHITELIST — 全语言白名单', () => {
  it('前端/后端/脚本/配置各语言均在', () => {
    const frontend = ['js', 'ts', 'jsx', 'tsx', 'vue', 'svelte', 'html', 'css', 'scss', 'sass', 'less'];
    const backend = ['java', 'py', 'go', 'c', 'cpp', 'h', 'hpp', 'cc', 'cxx', 'cs', 'rb', 'php', 'rs', 'kt', 'kts', 'swift', 'm', 'mm'];
    const scripts = ['sh', 'bash', 'zsh', 'ps1', 'sql'];
    const config = ['json', 'yml', 'yaml', 'xml', 'toml', 'ini', 'properties', 'env', 'gradle'];
    for (const ext of [...frontend, ...backend, ...scripts, ...config]) {
      expect(SOURCE_WHITELIST.has(ext)).toBe(true);
    }
  });
  it('未知扩展名不在白名单', () => {
    expect(SOURCE_WHITELIST.has('md')).toBe(false);
    expect(SOURCE_WHITELIST.has('png')).toBe(false);
    expect(SOURCE_WHITELIST.has('zip')).toBe(false);
  });
});

describe('filterProjectFiles — L0 白名单过滤', () => {
  it('白名单文件保留并带 weight；目录保留且不计入 dropped', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'main.js'), 'export const a = 1;');
      fs.writeFileSync(path.join(dir, 'src', 'App.vue'), '<template></template>');
      fs.writeFileSync(path.join(dir, 'src', 'style.css'), 'body {}');
      fs.writeFileSync(path.join(dir, 'tests', 'a.test.js'), 'test("x", () => {});');
      fs.writeFileSync(path.join(dir, 'Main.java'), 'public class Main {}');
      fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:22');

      const { kept, dropped } = filterProjectFiles(buildFileTree(dir), dir);
      const keptPaths = kept.map((k) => k.path);
      expect(keptPaths).toContain('src');
      expect(keptPaths).toContain('tests');
      expect(keptPaths).toContain('src/main.js');
      expect(keptPaths).toContain('src/App.vue');
      expect(keptPaths).toContain('src/style.css');
      expect(keptPaths).toContain('tests/a.test.js');
      expect(keptPaths).toContain('Main.java');
      expect(keptPaths).toContain('Dockerfile');
      expect(dropped).toHaveLength(0);
      // 权重：src 目录 3，tests 目录 0，根文件 3
      expect(kept.find((k) => k.path === 'src').weight).toBe(3);
      expect(kept.find((k) => k.path === 'tests').weight).toBe(0);
      expect(kept.find((k) => k.path === 'Dockerfile').weight).toBe(3);
      expect(kept.find((k) => k.path === 'tests/a.test.js').weight).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('配置类文件 > 64KB 丢弃；源码类 > 256KB 保留但 fold=true', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      const bigConfig = path.join(dir, 'big-config.json');
      fs.writeFileSync(bigConfig, Buffer.alloc(64 * 1024 + 10, 0x7b)); // '{' 填充
      const bigSource = path.join(dir, 'src', 'big.js');
      fs.writeFileSync(bigSource, Buffer.alloc(256 * 1024 + 100, 0x61)); // 'a' 填充
      const smallConfig = path.join(dir, 'small.json');
      fs.writeFileSync(smallConfig, '{}');

      const { kept, dropped } = filterProjectFiles(buildFileTree(dir), dir);
      expect(dropped.map((d) => d.path)).toEqual(['big-config.json']);
      expect(dropped[0].reason).toBe('config-too-large');
      const big = kept.find((k) => k.path === 'src/big.js');
      expect(big).toBeDefined();
      expect(big.fold).toBe(true);
      const small = kept.find((k) => k.path === 'small.json');
      expect(small).toBeDefined();
      expect(small.fold).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('未知扩展名：UTF-8 文本且含源码特征保留，二进制/无特征丢弃', () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'logic.weird'), 'function foo() { return 1; }');
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'plain text without features');
      fs.writeFileSync(path.join(dir, 'data.bin'), Buffer.from([0, 1, 2, 3, 255, 254]));
      const { kept, dropped } = filterProjectFiles(buildFileTree(dir), dir);
      expect(kept.map((k) => k.path)).toEqual(['logic.weird']);
      const droppedPaths = dropped.map((d) => d.path);
      expect(droppedPaths).toContain('notes.txt');
      expect(droppedPaths).toContain('data.bin');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('缺省 rootDir 时未知扩展名文件一律丢弃', () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'logic.weird'), 'function foo() { return 1; }');
      const { kept, dropped } = filterProjectFiles(buildFileTree(dir));
      expect(kept).toHaveLength(0);
      expect(dropped.map((d) => d.path)).toEqual(['logic.weird']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('kept 条目包含 path/name/size/ext/fold/weight 字段', () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 1;');
      const { kept } = filterProjectFiles(buildFileTree(dir), dir);
      const f = kept.find((k) => k.path === 'a.js');
      expect(f).toMatchObject({
        path: 'a.js',
        name: 'a.js',
        size: 'const a = 1;'.length,
        ext: 'js',
        fold: false,
        weight: 3,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('DIR_WEIGHTS / computeWeight — 目录权重', () => {
  it('权重表导出正确', () => {
    expect(DIR_WEIGHTS.src).toBe(3);
    expect(DIR_WEIGHTS.app).toBe(3);
    expect(DIR_WEIGHTS.lib).toBe(3);
    expect(DIR_WEIGHTS.components).toBe(2);
    expect(DIR_WEIGHTS.services).toBe(2);
    expect(DIR_WEIGHTS.tests).toBe(0);
    expect(DIR_WEIGHTS.docs).toBe(0);
    expect(DIR_WEIGHTS.public).toBe(0);
  });
  it('首段目录命中权重；无匹配默认 1', () => {
    expect(computeWeight('src/utils/x.js', 'x.js')).toBe(3);
    expect(computeWeight('components/Button.jsx', 'Button.jsx')).toBe(2);
    expect(computeWeight('utils/helper.js', 'helper.js')).toBe(2);
    expect(computeWeight('tests/a.test.js', 'a.test.js')).toBe(0);
    expect(computeWeight('other/whatever.js', 'whatever.js')).toBe(1);
  });
  it('根文件 → 3；main/index 开头文件名 → 3；main* 目录 → 3', () => {
    expect(computeWeight('Dockerfile', 'Dockerfile')).toBe(3);
    expect(computeWeight('', 'README.md')).toBe(3);
    expect(computeWeight('src/main.js', 'main.js')).toBe(3);
    expect(computeWeight('src/index.ts', 'index.ts')).toBe(3);
    expect(computeWeight('mainapp/x.js', 'x.js')).toBe(3);
  });
  it('目录条目自身即首段：根目录 tests → 0', () => {
    expect(computeWeight('tests', 'tests', true)).toBe(0);
    expect(computeWeight('src', 'src', true)).toBe(3);
  });
});

describe('buildFileTreeText — 文件树文本序列化', () => {
  it('生成 tree 风格文本：目录/文件名 [大小KB] (权重)', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src', 'utils'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'index.js'), Buffer.alloc(1024));
      fs.writeFileSync(path.join(dir, 'src', 'utils', 'helper.ts'), Buffer.alloc(512));
      fs.writeFileSync(path.join(dir, 'tests', 'a.test.js'), 'hello');
      fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:22');

      const text = buildFileTreeText(buildFileTree(dir), { withSizes: true });
      expect(text).toBe([
        '├── src/ [1.5KB] (3)',
        '│   ├── utils/ [0.5KB] (3)',
        '│   │   └── helper.ts [0.5KB] (3)',
        '│   └── index.js [1.0KB] (3)',
        '├── tests/ [0.0KB] (0)',
        '│   └── a.test.js [0.0KB] (0)',
        '└── Dockerfile [0.0KB] (3)',
      ].join('\n'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('withSizes=false 时省略 [大小KB]', () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'a.js'), 'x');
      const text = buildFileTreeText(buildFileTree(dir), { withSizes: false });
      expect(text).toBe('└── a.js (3)');
      expect(text).not.toContain('KB');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('空列表 → 空字符串', () => {
    expect(buildFileTreeText([], { withSizes: true })).toBe('');
  });

  it('kept 条目自带 weight 时直接使用', () => {
    const dir = tmpdir();
    try {
      fs.writeFileSync(path.join(dir, 'a.js'), 'x');
      const { kept } = filterProjectFiles(buildFileTree(dir), dir);
      const text = buildFileTreeText(kept, { withSizes: false });
      expect(text).toBe('└── a.js (3)');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extractSkeleton — AST 骨架提取', () => {
  it('js：注释/import/函数/类/方法/属性/箭头函数', () => {
    const code = `// 顶部注释
/* 块注释
   第二行 */
import fs from 'node:fs';
import { x } from './x.js';
export function add(a, b) { return a + b; }
class Foo extends Bar {
  constructor(x) { this.x = x; }
  method(y) { return y; }
  prop = 1;
}
const obj = {
  foo() { return 1; },
  bar: (n) => n * 2,
};
const arrow = (p, q) => p + q;`;
    const sk = extractSkeleton(code, 'js');
    expect(sk).toContain('// 顶部注释');
    expect(sk).toContain('// 块注释');
    expect(sk).toContain("import fs from 'node:fs';");
    expect(sk).toContain("import { x } from './x.js';");
    expect(sk).toContain('export function add(a, b) { return a + b; }');
    expect(sk).toContain('function add(a, b)');
    expect(sk).toContain('class Foo');
    expect(sk).toContain('constructor(x)');
    expect(sk).toContain('method(y)');
    expect(sk).toContain('prop');
    expect(sk).toContain('foo()');
    expect(sk).toContain('bar: (n) =>');
    expect(sk).toContain('const arrow = (p, q) =>');
  });

  it('vue：仅提取 <script> 部分', () => {
    const code = `<template>
  <div>{{ msg }}</div>
</template>
<script setup>
// vue 注释
import { ref } from 'vue';
const msg = ref('hello');
function sayHi(name) { return 'hi ' + name; }
</script>`;
    const sk = extractSkeleton(code, 'vue');
    expect(sk).toContain('// vue 注释');
    expect(sk).toContain("import { ref } from 'vue';");
    expect(sk).toContain('function sayHi(name)');
    expect(sk).not.toContain('<template>');
    expect(sk).not.toContain('{{ msg }}');
  });

  it('tsx：typescript + jsx 解析不抛错', () => {
    const code = `interface Props { name: string }
export function App({ name }: Props) {
  return <div>{name}</div>;
}
const Count = () => <span>0</span>;`;
    const sk = extractSkeleton(code, 'tsx');
    expect(sk).toContain('export function App({ name }: Props) {');
    expect(sk).toContain('function App({...})');
    expect(sk).toContain('const Count = () =>');
  });

  it('java/py/go：正则兜底提取函数与类声明行', () => {
    const java = `public class Main {
  public static void main(String[] args) {
    System.out.println("hi");
  }
  private int helper(int x) { return x; }
}`;
    const skJava = extractSkeleton(java, 'java');
    expect(skJava).toContain('public class Main {');
    expect(skJava).toContain('public static void main(String[] args) {');
    expect(skJava).toContain('private int helper(int x) { return x; }');

    const py = `class Dog:
    def bark(self):
        return "woof"

def add(a, b):
    return a + b`;
    const skPy = extractSkeleton(py, 'py');
    expect(skPy).toContain('class Dog:');
    expect(skPy).toContain('def bark(self):');
    expect(skPy).toContain('def add(a, b):');

    const go = `package main

func main() {
	fmt.Println("hi")
}`;
    const skGo = extractSkeleton(go, 'go');
    expect(skGo).toContain('func main() {');
  });

  it('解析失败 → 逐行注释化（// 前缀，截断 100 字符），绝不抛错', () => {
    const sk = extractSkeleton('function ( {', 'js');
    expect(sk).toBe('// function ( {');
    // 超长行截断
    const longLine = 'function ( {' + 'x'.repeat(300) + '}';
    const sk2 = extractSkeleton(longLine, 'js');
    expect(sk2.startsWith('// function ( {')).toBe(true);
    expect(sk2.length).toBeLessThanOrEqual(107); // '// ' + 100 + 换行余量
  });

  it('去重：重复声明只保留一次', () => {
    const code = `function f() {}
function f() {}
const g = () => 1;
const g = () => 2;`;
    const sk = extractSkeleton(code, 'js');
    const fCount = sk.split('\n').filter((l) => l === 'function f()').length;
    const gCount = sk.split('\n').filter((l) => l === 'const g = () =>').length;
    expect(fCount).toBe(1);
    expect(gCount).toBe(1);
  });
});

describe('estimateTokens / BUDGET_TOKENS — token 估算', () => {
  it('中文字符按 1.5 字符/token，其余按 3.5 字符/token（向上取整）', () => {
    expect(estimateTokens('你好世界')).toBe(Math.ceil(4 / 1.5));          // 3
    expect(estimateTokens('abcdef')).toBe(Math.ceil(6 / 3.5));            // 2
    expect(estimateTokens('你好世界abcdef')).toBe(Math.ceil(4 / 1.5 + 6 / 3.5)); // 5
  });
  it('空串 → 0', () => {
    expect(estimateTokens('')).toBe(0);
  });
  it('BUDGET_TOKENS = 120000', () => {
    expect(BUDGET_TOKENS).toBe(120000);
  });
});

describe('truncateToBudget — 预算截断', () => {
  it('未超预算 → 原样返回，truncated=false', () => {
    const r = truncateToBudget('short text', 1000);
    expect(r).toEqual({ text: 'short text', truncated: false });
  });
  it('刚好等于预算 → 不截断', () => {
    const text = 'a'.repeat(3500); // 3500 / 3.5 = 1000 tokens
    const r = truncateToBudget(text, 1000);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe(text);
  });
  it('超预算 → 按比例截断到 80% 预算并附截断标记', () => {
    const text = 'a'.repeat(7000); // 2000 tokens
    const r = truncateToBudget(text, 1000);
    expect(r.truncated).toBe(true);
    expect(r.text.endsWith('⚠️ 以下内容因预算限制被截断')).toBe(true);
    expect(r.text.length).toBeLessThan(text.length);
    // 截断后整体估算不超预算
    expect(estimateTokens(r.text)).toBeLessThanOrEqual(1000);
    // 比例约为 80%（含标记，允许小幅波动）：80% × 2000 tokens = 800 tokens ≈ 2800 字符 = 40% 原文
    expect(r.text.length).toBeGreaterThan(7000 * 0.35);
    expect(r.text.length).toBeLessThan(7000 * 0.45);
  });
  it('空字符串 → 不截断', () => {
    expect(truncateToBudget('', 10)).toEqual({ text: '', truncated: false });
  });
});
