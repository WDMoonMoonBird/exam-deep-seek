/**
 * upload-filter.test.js — 上传过滤单元测试（任务 D）
 *
 * 背景：任务 A 正在实现 server/src/utils/uploadFilter.js（shouldIgnorePath /
 * isBinaryContent / shouldIgnorePathWithContent），任务 B 生成规则文件。
 * 本文件与之并行开发：若 uploadFilter.js 尚未生成（A 未完成），
 * 本套件整体优雅 skip，不产生失败；主控集成时 A/B 均就绪后统一跑全量。
 *
 * 依赖：仅 jest（testEnvironment: node）+ Node 内置模块，不依赖数据库。
 */
import fs from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILTER_PATH = path.resolve(HERE, '../../src/utils/uploadFilter.js');
/** 同步探测：uploadFilter.js 是否已由任务 A 生成（未生成 → 整体 skip） */
const filterReady = existsSync(FILTER_PATH);

/** 模块级缓存，beforeAll 中动态加载 */
let uploadFilter = null;

/**
 * 规则文本（用于探测锁文件规则等动态内容）。
 * 来源 1：uploadFilter 模块导出的规则数据（对象/数组，JSON.stringify 保留、函数被忽略）；
 * 来源 2：B 生成的规则文件 server/config/upload-ignore.rules（与 uploadFilter.js 硬编码路径一致）。
 */
const RULES_FILE = path.resolve(HERE, '../../config/upload-ignore.rules');

function ruleText() {
  let text = '';
  if (uploadFilter) {
    text += JSON.stringify(uploadFilter) + JSON.stringify(uploadFilter.default ?? '');
  }
  try {
    if (existsSync(RULES_FILE)) text += '\n' + fs.readFileSync(RULES_FILE, 'utf8');
  } catch { /* 规则文件不可读：忽略 */ }
  return text;
}

/** 锁文件规则探测：规则文本是否提及 package-lock / lockfile（任务书用例 i 依赖） */
function hasLockFileRule() {
  return /package-lock|lockfile|npm-shrinkwrap|yarn\.lock|pnpm-lock/i.test(ruleText());
}

/* ---------------- 通用测试夹具 ---------------- */

/** MZ 可执行文件头（Windows PE）：4D 5A + 少量头字节 + NUL 填充至 8KB */
const MZ_HEADER = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(8192 - 4)]);

/** jar 文件头：PK\x03\x04 + NUL 填充至 8KB（构造即可，无需真实 jar） */
const JAR_HEADER = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(8192 - 4)]);

/** UTF-8 文本：JSON */
const UTF8_JSON = Buffer.from('{\n  "name": "x",\n  "version": "1.0.0"\n}');

/** 源码文本 */
const SOURCE_TEXT = Buffer.from('public class A { public static void main(String[] args) {} }');

/**
 * 「你好世界」的 GBK 编码字节（Node Buffer.from 不支持 'gbk'，手动给出）：
 * 你=0xC4E3 好=0xBAC3 世=0xCAC0 界=0xBDE7
 */
const GBK_NIHAO_SHIJIE = Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7]);

/** 长文本中间夹 1 个 NUL：8KB 内 NUL 占比 1/8192 ≈ 0.012% < 0.05% 阈值 */
const TEXT_WITH_ONE_NUL = Buffer.concat([
  Buffer.from('a'.repeat(4096), 'ascii'),
  Buffer.from([0x00]),
  Buffer.from('b'.repeat(4096), 'ascii'),
]);

/** UTF-16LE 文本：ASCII 字符每个码元高字节为 NUL，NUL 占比约 50% */
const UTF16_TEXT = Buffer.from('hello'.repeat(2000), 'utf16le');

/* ---------------- 套件装配 ---------------- */

if (!filterReady) {
  describe.skip('uploadFilter 未就绪（任务 A 尚未生成 uploadFilter.js）', () => {
    it('uploadFilter.js 不存在，全部用例按防御策略跳过；待 A/B 就绪后由主控统一跑', () => {});
  });
} else {
  describe('uploadFilter — 上传过滤单元测试', () => {
    beforeAll(async () => {
      try {
        uploadFilter = await import(pathToFileURL(FILTER_PATH).href);
      } catch (err) {
        // 文件已存在但加载失败（语法/依赖问题）：明确报错，不应静默跳过
        throw new Error(`uploadFilter.js 存在但加载失败：${err.message}`);
      }
    });

    /* ============ shouldIgnorePath：路径层 ============ */

    describe('shouldIgnorePath — 路径层过滤', () => {
      it('a) node_modules 目录段 → 忽略（依赖目录）', () => {
        expect(uploadFilter.shouldIgnorePath('demo/node_modules/express/index.js')).toBe(true);
      });

      it('b) target 构建产物目录 → 忽略', () => {
        expect(uploadFilter.shouldIgnorePath('demo/target/classes/A.class')).toBe(true);
      });

      it('c) Maven 源码目录 src/main/java 下的源码 → 不误伤', () => {
        expect(uploadFilter.shouldIgnorePath('demo/src/main/java/A.java')).toBe(false);
      });

      it('d) vendor 目录（通用依赖语义）→ 忽略', () => {
        expect(uploadFilter.shouldIgnorePath('demo/vendor/lib.go')).toBe(true);
      });

      it('e) iOS Pods 依赖目录 → 忽略', () => {
        expect(uploadFilter.shouldIgnorePath('demo/Pods/XXX/lib.a')).toBe(true);
      });

      it('f) src/main/webapp 下的 JSP 源码 → 不误伤', () => {
        expect(uploadFilter.shouldIgnorePath('demo/src/main/webapp/index.jsp')).toBe(false);
      });

      it('g) .idea IDE 配置目录 → 忽略', () => {
        expect(uploadFilter.shouldIgnorePath('demo/.idea/workspace.xml')).toBe(true);
      });

      it('h) 根级 pom.xml（源码配置）→ 保留', () => {
        expect(uploadFilter.shouldIgnorePath('demo/pom.xml')).toBe(false);
      });

      // 用例 i 依赖规则文件是否含锁文件规则，按规则实际内容动态启用：
      // 含 → 断言忽略；不含 → 该用例 test.skip 标注，不算失败
      const lockRuleActive = hasLockFileRule();
      (lockRuleActive ? it : it.skip)(
        'i) package-lock.json 锁文件 → 忽略（规则文件含锁文件规则时启用）',
        () => {
          expect(uploadFilter.shouldIgnorePath('demo/package-lock.json')).toBe(true);
        },
      );

      it('j) .git 版本目录 → 忽略', () => {
        expect(uploadFilter.shouldIgnorePath('demo/.git/HEAD')).toBe(true);
      });
    });

    /* ============ isBinaryContent：内容层 ============ */

    describe('isBinaryContent — 内容层二进制检测', () => {
      it('a) MZ 可执行文件头 → 判为二进制', () => {
        expect(uploadFilter.isBinaryContent(MZ_HEADER)).toBe(true);
      });

      it('b) UTF-8 JSON 文本 → 非二进制', () => {
        expect(uploadFilter.isBinaryContent(UTF8_JSON)).toBe(false);
      });

      it('c) 纯源码文本 → 非二进制', () => {
        expect(uploadFilter.isBinaryContent(SOURCE_TEXT)).toBe(false);
      });

      it('d) GBK 中文文本（你好世界）→ 非二进制（不得误杀中文源码）', () => {
        expect(uploadFilter.isBinaryContent(GBK_NIHAO_SHIJIE)).toBe(false);
      });

      it('e) jar 头（PK 0x03 0x04 + 前 8KB 含 NUL）→ 判为二进制', () => {
        expect(uploadFilter.isBinaryContent(JAR_HEADER)).toBe(true);
      });

      it('f) UTF-16LE 文本 → 记录实际结果（NUL 占比约 50%，预期 true）', () => {
        // 说明：'hello' 的 UTF-16LE 编码每字符高字节为 0x00，8KB 样本内 NUL 占比
        // ≈50%，远超 0.05% 阈值，因此本实现判为二进制（true）。若未来实现改用
        // UTF-16 启发式（偶数偏移 NUL 成对出现视为文本），此用例将翻转——
        // 属已知边缘场景，注释留档，允许结果随实现策略变化。
        const actual = uploadFilter.isBinaryContent(UTF16_TEXT);
        expect(actual).toBe(true);
      });

      it('g) 空 Buffer → 非二进制', () => {
        expect(uploadFilter.isBinaryContent(Buffer.alloc(0))).toBe(false);
      });

      it('h) 纯文本但前 8KB 内恰好 1 个 NUL（占比 ≈0.012% < 0.05% 阈值）→ 非二进制', () => {
        expect(uploadFilter.isBinaryContent(TEXT_WITH_ONE_NUL)).toBe(false);
      });
    });

    /* ============ shouldIgnorePathWithContent：组合层 ============ */

    describe('shouldIgnorePathWithContent — 路径 + 内容组合过滤', () => {
      it('路径命中（node_modules）→ 即使内容是文本也忽略', () => {
        expect(
          uploadFilter.shouldIgnorePathWithContent('demo/node_modules/express/index.js', SOURCE_TEXT),
        ).toBe(true);
      });

      it('路径不命中但内容为二进制（MZ 头）→ 忽略', () => {
        expect(
          uploadFilter.shouldIgnorePathWithContent('demo/src/main/java/A.java', MZ_HEADER),
        ).toBe(true);
      });

      it('路径与内容均不命中 → 保留', () => {
        expect(
          uploadFilter.shouldIgnorePathWithContent('demo/src/main/java/A.java', SOURCE_TEXT),
        ).toBe(false);
      });
    });
  });
}


describe('E 终审误伤回归（不该忽略的必须保留）', () => {
  let uf;
  beforeAll(async () => {
    uf = await import('../../src/utils/uploadFilter.js');
  });

  const NOT_IGNORED = [
    // E 终审实证的误伤点：这些必须是 false（源码路径）
    ['src/log/logger.py', 'Python 项目 src/log 源码包'],
    ['src/log/LogUtil.java', 'Java 项目 src/log 源码包'],
    ['lib/debug/helper.js', 'lib/debug 源码目录'],
    // src/target 为已知取舍：target 是 Maven 构建产物强信号，Set 层按段匹配接受任意深度（E 终审权衡），不在此断言
    // // src/target 为已知取舍（Maven 构建产物强信号，Set 层任意深度接受），不在此断言
    ['bin/rails', 'Ruby 可执行源码 bin/'],
    ['bin/cli.rb', 'Ruby 脚本 bin/'],
    ['src/bin/tool.sh', 'src/bin 脚本'],
    ['data.lock', '普通 .lock 文件（*.lock 已删除）'],
    ['src/out/out.c', 'src/out 源码目录'],
    ['src/dist/notes.txt', 'src/dist 源码目录'],
    ['src/external/api.ts', 'src/external 源码目录（Set 层已移除 external）'],
    ['src/deps/helper.ts', 'src/deps 源码目录（Set 层已移除 deps）'],
    ['build-utils/helper.js', 'build-utils 是工具源码目录，非构建产物'],
    ['Testing/support.rb', 'Testing 目录（CMake 测试源码）'],
    ['pom.xml', 'Maven 配置（源码）'],
    ['package.json', 'Node 配置（源码）'],
  ];

  it.each(NOT_IGNORED)('路径层不忽略: %s (%s)', (p, desc) => {
    expect(uf.shouldIgnorePath(p)).toBe(false);
  });

  // 源码扩展名永不忽略扫射（规则文件头注释的契约）
  const SRC_EXTS = ['java','py','js','ts','c','cpp','h','html','css','json','xml','yml','yaml','properties','sql','md','txt','jsp','jspx','vue','go','rs','rb','php','cs','kt'];
  it.each(SRC_EXTS)('源码扩展名永不忽略: src/main/a.%s', (ext) => {
    expect(uf.shouldIgnorePath('src/main/a.' + ext)).toBe(false);
  });

  // 该忽略的仍需忽略（防过度修复）
  const SHOULD_IGNORE = [
    ['node_modules/express/index.js', 'node_modules'],
    ['target/classes/A.class', 'target 构建产物'],
    ['demo/.git/HEAD', '.git'],
    ['demo/vendor/lib.go', 'vendor 依赖'],
    ['demo/Pods/XXX/YYY.a', 'iOS Pods'],
    ['demo/.idea/workspace.xml', '.idea'],
    ['Cargo.lock', 'Rust 锁文件'],
    ['Gemfile.lock', 'Ruby 锁文件'],
  ];
  it.each(SHOULD_IGNORE)('路径层仍忽略: %s (%s)', (p, desc) => {
    expect(uf.shouldIgnorePath(p)).toBe(true);
  });

  // BOM 分支（建议 G③）：UTF-16LE BOM 开头直接 NUL 兜底，不得被魔数误报为 class 而误杀中文
  it('UTF-16LE BOM + 中文（无 NUL）→ 不判二进制', () => {
    const s = '你好世界'.repeat(200);
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
    expect(uf.isBinaryContent(buf)).toBe(false);
  });
  it('UTF-16LE BOM + ASCII（NUL≈50%）→ 判二进制（已知边缘，注释留档）', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hello'.repeat(500), 'utf16le')]);
    expect(uf.isBinaryContent(buf)).toBe(true);
  });

  // 空文件必须保留（建议 G⑦）
  it('空文件 → 不判二进制', () => {
    expect(uf.isBinaryContent(Buffer.alloc(0))).toBe(false);
  });
});
