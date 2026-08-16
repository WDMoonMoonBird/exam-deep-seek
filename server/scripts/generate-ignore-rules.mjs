#!/usr/bin/env node
/**
 * generate-ignore-rules.mjs — 生成 server/config/upload-ignore.rules
 *
 * 用途：为统一过滤引擎（任务 A，读取 gitignore 语法的 upload-ignore.rules）
 *       生成"依赖目录 / 构建产物 / 二进制文件 / 锁文件"过滤规则。
 * 来源：github/gitignore 官方模板库（raw.githubusercontent.com/github/gitignore/main/...），
 *       规则随社区模板维护；PHP / React 官方无模板，使用内置补充规则。
 *
 * 提取启发式（筛选集均为人工核对，可结合代码审查）：
 *   - 保留：依赖/构建目录（node_modules/、target/、bin/、obj/、dist/、build/、
 *           .gradle/、Pods/、venv/、vendor/、third_party/、.dart_tool/ 等）、
 *           二进制/编译产物扩展名（*.jar、*.class、*.dll、*.so、*.dylib、*.exe、
 *           *.pyc、*.o、*.a、*.lib、*.war、*.zip、*.png、*.jpg、*.pdf 等）、
 *           锁文件/依赖清单（package-lock.json、yarn.lock、pnpm-lock.yaml、
 *           Gemfile.lock、Cargo.lock、poetry.lock、composer.lock、gradle.lockfile 等）
 *   - 剔除：任何可能命中源码的模式（*.java、*.py、*.js、*.ts、*.c、*.cpp、*.h、
 *           *.html、*.css、*.json、*.xml、*.yml、*.properties、*.sql、*.md、
 *           !src/、!lib/、!.gitignore、src/、lib/、docs/、test/、assets/ 等），
 *           以及所有以 ! 开头的取反规则（会改变其它规则的语义）。
 *   对无法明确归类的模式一律保守剔除（默认丢弃）。
 *
 * 用法：
 *   node scripts/generate-ignore-rules.mjs            # 规则文件不存在时生成；已存在则跳过
 *   node scripts/generate-ignore-rules.mjs --update   # 强制重新拉取模板并重新生成
 *   node scripts/generate-ignore-rules.mjs --dry-run  # 只打印到 stdout，不写文件（可配合 --update）
 * 环境变量：GITIGNORE_PROXY 覆盖代理地址（默认 http://127.0.0.1:7890，经 curl -x 访问）
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(__dirname, '../config/upload-ignore.rules');
const PROXY = process.env.GITIGNORE_PROXY || 'http://127.0.0.1:7890';
const BASE = 'https://raw.githubusercontent.com/github/gitignore/main/';

const DRY_RUN = process.argv.includes('--dry-run');
const UPDATE = process.argv.includes('--update');

/* ==================== 筛选集（人工核对） ==================== */

/** 二进制/编译产物/生成物 扩展名：*.ext 模式保留 */
const KEEP_EXT = new Set([
  // 编译产物 / 二进制
  'class', 'jar', 'war', 'ear', 'aab', 'apk', 'exe', 'dll', 'so', 'dylib',
  'o', 'obj', 'ko', 'elf', 'a', 'lib',
  'gch', 'pch', 'ilk', 'pdb',
  'nupkg', 'snupkg', 'appx', 'appxbundle',
  'msi', 'cab', 'vsix', 'pfx', 'mdf', 'ldf',
  'tsbuildinfo',
  // 压缩包 / 归档 / 打包产物
  'zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'bz2', 'xz', 'dmg', 'iso',
  'egg', 'gem', 'rbc', 'mo', 'phar',
  // 图片 / 媒体 / 文档（二进制资产）
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'icns', 'webp', 'svg',
  'mp3', 'mp4', 'avi', 'mov', 'wmv', 'mkv', 'flac', 'wav', 'ogg', 'webm',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  'epub', 'mobi',
  // 数据库 / 密钥 / 调试符号
  'sqlite', 'sqlite3', 'dbf', 'hprof', 'jks', 'keystore',
  'dsym', 'ipa', 'hmap', 'unitypackage', 'framework',
  // 语言/生态生成物
  'pyc', 'pyo', 'pyd', 'pyz', 'test', 'out',
  'log', 'tmp', 'app', 'env',
]);

/** 源码/配置扩展名：*.ext 模式一律剔除（误伤红线） */
const DROP_EXT = new Set([
  // 源码扩展名
  'java', 'py', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'c', 'cpp', 'cc', 'cxx',
  'h', 'hpp', 'hh', 'hxx', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'kts',
  'scala', 'dart', 'm', 'mm', 'vue', 'svelte',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'json', 'xml', 'yml', 'yaml', 'toml', 'ini', 'conf', 'config', 'properties',
  'sql', 'md', 'markdown', 'txt', 'rst', 'tex',
  'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'pl', 'pm', 'lua', 'r', 'groovy', 'gradle',
  'cmake', 'csproj', 'sln', 'slnx', 'vcxproj', 'vbproj', 'fsproj', 'xcodeproj',
  'xcworkspace', 'storyboard', 'xib', 'plist', 'pbxproj', 'workspace', 'iml',
  'jsp', 'asp', 'aspx', 'cshtml', 'ipynb',
  // 易误判、语义不属于"依赖/构建产物/二进制"的扩展名
  'd', 'mod', 'smod', 'spec', 'manifest', 'pot', 'user', 'userprefs', 'rsp',
  'su', 'hex', 'ctxt', 'e2e', 'sap', 'psess', 'vsp', 'vspx', 'tlog', 'svclog',
  'binlog', 'dwo', 'bak', 'swp', 'aof', 'rdb', 'pid', 'seed', 'lock', 'map',
  'nar', 'idb', 'iobj', 'ipdb', 'tlb', 'pidb', 'aps', 'ncb', 'opendb', 'opensdf',
  'sdf', 'cache', 'cachefile', 'dotcover', 'coverage', 'coveragexml',
  'msix', 'msm', 'msp', 'appxupload', 'ndf', 'suo', 'trx', 'symbols',
]);

/** 依赖/构建/缓存 目录 token：目录模式保留 */
const KEEP_DIR_TOKENS = new Set([
  // 主流生态依赖/构建目录
  'node_modules', 'target', 'build', 'builds', 'dist', 'out', 'output', 'obj',
  'bin', 'debug', 'release', 'log', 'temp',
  'pods', 'deriveddata', 'carthage', 'testing',
  'cmakefiles', 'cmakescripts', '_deps', 'dsym', 'xcuserdata',
  // 跨生态依赖/第三方
  'vendor', 'third_party', 'thirdparty', 'deps', 'external', 'bundle',
  // 工具缓存 / 虚拟环境 / 构建缓存
  '.gradle', '.idea', '.vscode', '.vs', '.cxx', '.externalnativebuild',
  '.dart_tool', '__pycache__', '.venv', 'venv', 'env',
  '.pytest_cache', '.mypy_cache', '.next', '.nuxt', '.vite',
  '.kotlin', '.bundle', '.eggs', '.egg-info',
  'coverage', 'htmlcov', '.build', '.buildlog',
]);

/** 源码/内容 目录 token：目录模式剔除 */
const DROP_DIR_TOKENS = new Set([
  'src', 'lib', 'lib64', 'include', 'inc', 'app', 'apps', 'assets', 'public',
  'static', 'docs', 'doc', 'rdoc', 'yardoc', '_yardoc', 'test', 'tests', 'spec',
  'specs', '__tests__', 'pages', 'components', 'api', 'routes', 'views',
  'templates', 'migrations', 'seeds', 'scripts', 'tools', 'util', 'utils',
  'helpers', 'core', 'modules', 'config', 'conf', 'share', 'site', 'data',
  'server', 'client', 'frontend', 'backend', 'web', 'www', 'packages',
  'examples', 'example', 'samples', 'sample',
]);

/** 无路径分隔的裸目录名（匹配任意深度的同名目录/文件，均为构建产物） */
const KEEP_BARE = new Set([
  // E 终审后保留的裸名：均为构建产物强信号；debug/out/dist 等易误伤源码的裸名已移除
  'target', 'build', 'obj', 'node_modules', '.gradle', '.dart_tool', 'Pods', 'DerivedData',
  // 以下裸名不得再出现（E 终审实证误伤）：debug、out、dist、log、bin、*.lock
]);

/** 裸点文件/点目录（构建缓存、环境、生成标记） */
const KEEP_DOT = new Set([
  '.Python', '.coverage', '.next', '.nuxt', '.output', '.cache',
  '.env', '.packages', '.flutter-plugins', '.gradle', '.venv', '.DS_Store',
]);

/** 精确文件名（生成产物/系统杂项，非源码） */
const KEEP_EXACT = new Set([
  'Thumbs.db',
]);

/** 锁文件/依赖清单（文本但属依赖描述，保留不落盘） */
const LOCKFILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'pnpm-lock.yml',
  'bun.lockb', 'packages.lock.json', 'project.lock.json',
  'project.fragment.lock.json',
  'Gemfile.lock', 'Cargo.lock', 'poetry.lock', 'Pipfile.lock', 'composer.lock',
  'gradle.lockfile', 'Podfile.lock', 'Package.resolved', 'go.sum',
  'pubspec.lock',
]);

/** 特殊全模式正则（特征明确、语义为生成物/二进制，先于扩展名判断） */
const KEEP_PATTERN = [
  /^\*\.py\[codz\]$/,              // Python 编译缓存 *.py[codz]
  /^\*\$py\.class$/,                // Jython 编译类
  /^\*\.so\.\*$/,                  // 版本化共享库
  /^\*~$/,                            // 编辑器备份文件
  /^~\$\*$/,                         // Office 临时锁文件
  /^\.coverage\./,                   // Python 覆盖率文件
  /^\/?\[Ll\]ibrary\/$/,           // Unity Library 缓存目录
  /^build-\*\/$/,                     // C/C++ 构建目录 build-*/
  /mutants\.out/,                     // Rust mutation 测试输出
  /\.unitypackage\.meta$/,           // Unity 包 meta
];

/** 冗余/低价值模式：与已保留规则重复或过窄，明确剔除 */
const DROP_PATTERN = [
  /^\*\*\/android\/\*\*\/gradle-wrapper\.jar$/, // Gradle wrapper jar 通常需提交，不忽略
  /^\*\*\/ios\/Flutter\/app\.zip$/,              // Flutter 内部产物，冗余
  /^\*\*\/\.paket\/paket\.exe$/,                 // Paket 私有，冗余
  /^\*\*\/Pods\/$/,                                // 已被 Pods/ 覆盖
  /^\*\*\/xcuserdata\/$/,                          // 已被 xcuserdata/ 覆盖
  /^\*\*\/__pycache__\/$/,                         // 已被 __pycache__/ 覆盖
  /^\*\*\/build\/$/,                               // 已被 build/ 覆盖
  /^\*\.env$/,                                     // 已被 .env 覆盖
  /^flutter_.*\.png$/,                                // Flutter 图标，低价值
  /^fastlane\//,                                      // fastlane 截图，低价值
  /^\.cache\/$/,                                     // 已被 .cache 覆盖
  /^\.gradle\/$/,                                    // 已被 .gradle 覆盖
  /^CMakeFiles\/$/,                                   // 已被 CMakeFiles 覆盖
  /^Testing\/$/,                                      // 已被 Testing 覆盖
  /^dist\/$/,                                         // 已被 dist 覆盖
  /^target\/$/,                                       // 已被 target 覆盖
  /^\/coverage\/$/,                                  // 已被 coverage/ 覆盖
  /^ENV\/$/,                                          // 与 env/ 重复
];

/* ==================== 模板清单（官方模板 + 内置补充） ==================== */

const TEMPLATES = [
  { name: 'Node.js', paths: ['Node.gitignore', 'Node.js.gitignore'],
    supplement: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'pnpm-lock.yml', 'bun.lockb'] },
  { name: 'Java', paths: ['Java.gitignore'], supplement: [] },
  { name: 'Python', paths: ['Python.gitignore'], supplement: ['poetry.lock', 'Pipfile.lock'] },
  { name: 'VisualStudio', paths: ['VisualStudio.gitignore'],
    supplement: ['project.lock.json', 'project.fragment.lock.json', 'packages.lock.json'] },
  { name: 'VisualStudioCode', paths: ['Global/VisualStudioCode.gitignore', 'VisualStudioCode.gitignore'], supplement: [] },
  { name: 'Go', paths: ['Go.gitignore'], supplement: ['go.sum'] },
  { name: 'Rust', paths: ['Rust.gitignore'], supplement: ['Cargo.lock'] },
  { name: 'Flutter', paths: ['Flutter.gitignore'], supplement: [] },
  { name: 'Android', paths: ['Android.gitignore'], supplement: [] },
  { name: 'Swift', paths: ['Swift.gitignore'], supplement: ['Podfile.lock', 'Package.resolved'] },
  { name: 'Objective-C', paths: ['Objective-C.gitignore'], supplement: ['Podfile.lock', 'Package.resolved'] },
  { name: 'Kotlin', paths: ['Kotlin.gitignore'], supplement: [] },
  { name: 'Dart', paths: ['Dart.gitignore'], supplement: [] },
  { name: 'Ruby', paths: ['Ruby.gitignore'], supplement: ['Gemfile.lock'] },
  { name: 'PHP', paths: ['PHP.gitignore', 'community/PHP/PHP.gitignore'],
    supplement: ['composer.lock', 'composer.phar', '*.phar'],
    note: '官方模板库无 PHP.gitignore，使用内置 composer 生态补充规则' },
  { name: 'C++', paths: ['C%2B%2B.gitignore', 'Cpp.gitignore'], supplement: [] },
  { name: 'C', paths: ['C.gitignore'], supplement: [] },
  { name: 'CMake', paths: ['CMake.gitignore'], supplement: [] },
  { name: 'Unity', paths: ['Unity.gitignore'], supplement: [] },
  { name: 'Gradle', paths: ['Gradle.gitignore'], supplement: ['gradle.lockfile'] },
  { name: 'Maven', paths: ['Maven.gitignore'], supplement: [] },
  { name: 'Vue', paths: ['community/JavaScript/Vue.gitignore', 'Vue.gitignore', 'Vue.js.gitignore'],
    supplement: [], note: '官方 Vue 模板仅含 test/、docs/_book 等源码/文档规则，已剔除；依赖规则复用 Node.js' },
  { name: 'React', paths: ['community/JavaScript/React.gitignore', 'React.gitignore', 'ReactNative.gitignore'],
    supplement: [], note: '官方模板库无 React.gitignore（社区建议复用 Node.gitignore），无独立规则' },
];

/** 跨生态通用规则（依赖目录 / 通用锁文件 / 二进制资产 / 系统杂项），最先输出 */
const COMMON_RULES = [
  'vendor/',
  'third_party/',
  'Pods/',
  'DerivedData/',
  '*.lock',
  '.DS_Store',
  'Thumbs.db',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.pdf',
  '*.7z',
];

/* ==================== 分类逻辑 ==================== */

function normalizeToken(t) {
  // 字符类折叠为单个代表字符：[Dd]ebug → debug、[Aa]ssets → assets；再去掉 * ?
  return t.replace(/\[[^\]]*\]/g, (m) => m[1].toLowerCase()).replace(/[*?]/g, '').toLowerCase();
}

function extractExt(comp) {
  const m = comp.match(/\*\.([A-Za-z0-9\[\]]+)$/);
  if (m) return m[1].replace(/[\[\]]/g, '').toLowerCase();
  const m2 = comp.match(/\.([A-Za-z0-9]+)$/);
  if (m2) return m2[1].toLowerCase();
  return null;
}

/** 返回 'keep' | null */
function classify(p) {
  if (KEEP_PATTERN.some((re) => re.test(p))) return 'keep';
  if (DROP_PATTERN.some((re) => re.test(p))) return null;
  if (KEEP_EXACT.has(p) || LOCKFILES.has(p)) return 'keep';

  const isDir = p.endsWith('/');
  const rest = p.replace(/^(\*\*\/|\*\/|\/+)+/, '');
  // 目录内容模式（**/bin/*、.vscode/* 等）：按目录 token 判定
  if (/\/\*$/.test(rest)) {
    const dirToken = normalizeToken(rest.slice(0, -2));
    if (DROP_DIR_TOKENS.has(dirToken)) return null;
    return KEEP_DIR_TOKENS.has(dirToken) ? 'keep' : null;
  }
  const comps = rest.split('/').filter((c) => c && c !== '*' && c !== '**');
  const lastComp = comps[comps.length - 1] ?? rest;
  const token = normalizeToken(lastComp);

  if (comps.length <= 1) {
    // 无路径分隔的简单模式
    if (KEEP_BARE.has(p) || KEEP_DOT.has(p)) return 'keep';
    if (isDir) {
      if (DROP_DIR_TOKENS.has(token)) return null;
      return KEEP_DIR_TOKENS.has(token) ? 'keep' : null;
    }
    const ext = extractExt(p);
    if (ext) {
      if (DROP_EXT.has(ext)) return null;
      return KEEP_EXT.has(ext) ? 'keep' : null;
    }
    return null;
  }

  // 含路径分隔的模式：路径中出现源码目录则剔除
  if (comps.some((c) => DROP_DIR_TOKENS.has(normalizeToken(c)))) return null;
  const ext2 = extractExt(lastComp);
  if (ext2) {
    if (DROP_EXT.has(ext2)) return null;
    if (KEEP_EXT.has(ext2)) return 'keep';
  }
  // 全路径均为已知依赖/构建目录 → 保留
  if (comps.every((c) => KEEP_DIR_TOKENS.has(normalizeToken(c)))) return 'keep';
  return null;
}

/* ==================== 拉取与生成 ==================== */

async function fetchTemplate(name, paths) {
  for (const p of paths) {
    try {
      const { stdout } = await execFileP('curl', ['-sS', '-f', '-L', '-x', PROXY, '--max-time', '40', BASE + p], {
        maxBuffer: 4 * 1024 * 1024,
      });
      if (stdout && stdout.trim().length > 0 && !/^404: Not Found/.test(stdout.trim())) return stdout;
    } catch {
      // 404 / 网络错误 → 尝试下一个候选名
    }
  }
  return null;
}

function extractRules(content) {
  const rules = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    if (classify(line) === 'keep') rules.push(line);
  }
  return rules;
}

function buildHeader(tplNames) {
  return [
    '# ============================================================================',
    '# upload-ignore.rules — 上传内容过滤规则（依赖 / 构建产物 / 二进制 / 锁文件）',
    '#',
    '# 用途：统一过滤引擎读取本文件（gitignore 语法），在上传/落盘时过滤依赖目录、',
    '#       构建产物、二进制文件与锁文件，保留源代码与配置。',
    '#       注意：本文件禁止加入任何可能命中源码的模式',
    '#       （*.java /*.py /*.js /*.ts /*.c /*.cpp /*.h /*.html /*.css /*.json',
    '#        /*.xml /*.yml /*.properties /*.sql /*.md 等）。',
    '#',
    '# 来源：github/gitignore 官方模板库（https://github.com/github/gitignore）',
    `# 模板：${tplNames.join(' ')}`,
    '# 生成：server/scripts/generate-ignore-rules.mjs --update',
    `# 生成时间：${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}（UTC）`,
    '# ============================================================================',
  ];
}

async function main() {
  if (!UPDATE && !DRY_RUN && fs.existsSync(OUT_FILE)) {
    console.log(`已存在: ${OUT_FILE}（跳过；如需重新生成请加 --update）`);
    return;
  }

  // 并行拉取所有模板
  const results = await Promise.all(
    TEMPLATES.map(async (tpl) => {
      const content = await fetchTemplate(tpl.name, tpl.paths);
      return { ...tpl, content };
    })
  );

  // 逐生态提取规则（保留模板内出现顺序），全局去重
  const seen = new Set();
  const sections = [];

  const commonKept = [];
  for (const r of COMMON_RULES) {
    if (!seen.has(r)) { seen.add(r); commonKept.push(r); }
  }
  sections.push({ title: '通用（跨生态：依赖目录 / 锁文件 / 二进制资产 / 系统杂项）', rules: commonKept });

  for (const tpl of results) {
    const rules = [];
    if (tpl.content) {
      for (const r of extractRules(tpl.content)) {
        if (!seen.has(r)) { seen.add(r); rules.push(r); }
      }
    }
    for (const r of tpl.supplement ?? []) {
      if (!seen.has(r)) { seen.add(r); rules.push(r); }
    }
    sections.push({ title: tpl.name, rules, note: tpl.note, fetched: Boolean(tpl.content) });
  }

  const out = [];
  out.push(...buildHeader(results.map((t) => t.name)));
  out.push('');

  for (const s of sections) {
    out.push(`# ==== ${s.title} ====`);
    if (s.rules.length === 0) {
      out.push(`# （本生态无独立规则${s.note ? `：${s.note}` : ''}）`);
    } else {
      out.push(...s.rules);
      if (s.note) out.push(`# 说明：${s.note}`);
    }
  }

  const content = out.join('\n').replace(/\n+$/, '\n');
  const ruleCount = sections.reduce((n, s) => n + s.rules.length, 0);

  if (DRY_RUN) {
    console.log(`# [dry-run] 共 ${ruleCount} 条规则（含 ${sections.length} 个分组），不写文件：`);
    console.log(content);
  } else {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, content);
    console.log(`已生成: ${OUT_FILE}（${ruleCount} 条规则，${sections.length} 个分组，${content.split('\n').length} 行）`);
  }

  // 拉取失败的模板给出告警
  for (const tpl of results) {
    if (!tpl.content) console.warn(`[warn] ${tpl.name}: 模板拉取失败（404 或网络错误），${tpl.supplement?.length ? '使用内置补充规则' : '跳过'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
