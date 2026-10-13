#!/usr/bin/env node
/**
 * R2-B38（t6）：前端核验脚本（一键可跑）—— 构建 + chunk + 裸根路径 + 路由/菜单联动。
 *
 * 用法：node client/scripts/verify-frontend.mjs [--no-build] [--base=/exam/]
 *   ① 构建：默认执行 `npm run build`（--no-build 则直接校验现有 dist，供 CI 复用）
 *   ② chunk：dist/assets 必须有「批改记录」页 chunk（GradingRuns-*.js 与 .css）
 *   ③ 裸根路径（BASE_URL 铁律）：dist/index.html 的 src/href 不得出现裸根（/assets、/favicon…），
 *      必须是 base 前缀（默认 /exam/）或相对路径/外链；dist/assets/*.js 内不得出现裸根资源字面量
 *   ④ 路由/菜单：router 的 admin 子路由 grading-runs → views/admin/GradingRuns.vue；Layout.vue 菜单项
 *      key="/admin/grading-runs" + 文本「批改记录」；且 GradingRuns.vue 自身无裸根资源引用
 *   ⑤ 路由级防呆（R2-B46）：教师复审路由（review/project/:submissionId 与 review/:id）**从 router 解析**到的
 *      组件文件必须含「AI 总评」⇒ 只把一个页面改好、另一个漏掉（或把总评从某页移除）都会被拦住
 * 退出码：0=全部通过；1=有失败项（逐项打印 PASS/FAIL，便于 CI 判读）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(__dirname, '..');
const DIST = path.join(CLIENT, 'dist');
const argv = process.argv.slice(2);
const noBuild = argv.includes('--no-build');
const baseArg = argv.find((a) => a.startsWith('--base='));
const BASE = (baseArg ? baseArg.slice('--base='.length) : '/exam/');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')); };
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

// ① 构建
if (!noBuild) {
  console.log('[1/4] npm run build（vite）…');
  try {
    execFileSync('npm', ['run', 'build'], { cwd: CLIENT, stdio: 'inherit' });
    check('① 构建 npm run build', true, 'rc=0');
  } catch (err) {
    check('① 构建 npm run build', false, 'rc=' + (err && err.status));
  }
} else {
  check('① 构建（--no-build：跳过，直接校验现有 dist）', fs.existsSync(DIST), DIST);
}

// ② chunk
const assetsDir = path.join(DIST, 'assets');
const assets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
const pageJs = assets.filter((f) => /^GradingRuns-.*\.js$/.test(f) && !/-legacy-/.test(f));
const pageCss = assets.filter((f) => /^GradingRuns-.*\.css$/.test(f) && !/-legacy-/.test(f));
const allJs = assets.filter((f) => f.endsWith('.js'));
// ★必须「被入口引用」才算真存在（把 chunk 改名/删掉 ⇒ 引用断链 ⇒ 必须失败）
const referencedBy = (name) => allJs.filter((g) => g !== name && (read(path.join(assetsDir, g)) || '').includes(name));
const missingRefs = pageJs.filter((f) => referencedBy(f).length === 0);
check('② 页面 chunk 存在且被入口引用（GradingRuns-*.js + *.css；非 legacy）',
  pageJs.length >= 1 && pageCss.length >= 1 && missingRefs.length === 0,
  'js=' + pageJs.join(',') + ' css=' + pageCss.join(',') + (missingRefs.length ? ' 未被引用=' + missingRefs.join(',') : ' 引用链完整'));

// ③ 裸根路径（BASE_URL 铁律）
const indexHtml = read(path.join(DIST, 'index.html')) || '';
const localRefs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const bareRoot = localRefs.filter((u) => u.startsWith('/') && !u.startsWith(BASE));
const external = localRefs.filter((u) => /^https?:\/\//.test(u) || u.startsWith('data:'));
check('③a index.html 无裸根资源引用（非 base 前缀的 /…）', bareRoot.length === 0, 'bare=' + JSON.stringify(bareRoot) + ' base=' + BASE + ' refs=' + localRefs.length);
const bareInJs = [];
for (const f of assets.filter((x) => x.endsWith('.js'))) {
  const txt = read(path.join(assetsDir, f)) || '';
  for (const pat of ['"/assets/', "'/assets/", 'url(/assets', '"/favicon', "'/favicon"]) {
    if (txt.includes(pat)) bareInJs.push(f + ' ⇒ ' + pat);
  }
}
check('③b dist/assets/*.js 无裸根资源字面量', bareInJs.length === 0, bareInJs.join(' | '));
const routerTxt = read(path.join(CLIENT, 'src/router/index.js')) || '';
const pageTxt = read(path.join(CLIENT, 'src/views/admin/GradingRuns.vue')) || '';
const pageBare = [/src="\/(?!\/)/, /href="\/(?!\/)/, /url\(\s*['"]?\/(?!\/)/].filter((re) => re.test(pageTxt));
check('③c 页面源码无裸根资源引用', pageBare.length === 0, 'patterns=' + pageBare.length);

// ④ 路由 + 菜单
check('④a 路由：admin 子路由 grading-runs → views/admin/GradingRuns.vue',
  /path:\s*'grading-runs'\s*,\s*component:\s*\(\)\s*=>\s*import\('..\/views\/admin\/GradingRuns\.vue'\)/.test(routerTxt));
const layoutTxt = read(path.join(CLIENT, 'src/views/admin/Layout.vue')) || '';
check('④b 菜单：Layout.vue 含 key="/admin/grading-runs" 且文本「批改记录」',
  /key="\/admin\/grading-runs"/.test(layoutTxt) && /<span>批改记录<\/span>/.test(layoutTxt));
check('④c 页面走既有 axios 实例（src/api/request.js）', pageTxt.includes("api/request.js") || pageTxt.includes('request.get('));

// ⑤ 路由级防呆（★R2-B46 根治）：教师复审路由解析到的组件必须都带「AI 总评」——
//   B43 的缺陷就是「组件改对了、页面装错了」（总评只在 review/:id 的 ReviewDetail.vue，教师实际走 review/project/:submissionId）。
//   此处不硬编码组件路径，而是**从 router 解析**：路由改名/换组件也会被同一断言覆盖。
const routerFile = path.join(CLIENT, 'src', 'router', 'index.js');
const routerSrc = read(routerFile) || '';
const resolveRouteComponent = (routePath) => {
  const idx = routerSrc.indexOf("path: '" + routePath + "'");
  if (idx < 0) return { file: null, reason: 'route_not_found:' + routePath };
  const seg = routerTxt.slice(idx, idx + 600);
  const m = /component:\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/.exec(seg);
  if (!m) return { file: null, reason: 'component_not_found:' + routePath };
  return { file: path.resolve(path.dirname(routerFile), m[1]), raw: m[1] };
};
for (const [label, routePath] of [
  ['⑤a 项目题复审路由', 'review/project/:submissionId'],
  ['⑤b 通用复审路由', 'review/:id'],
]) {
  const hit = resolveRouteComponent(routePath);
  const txt = hit.file ? (read(hit.file) || '') : '';
  // ★必须命中**渲染出来的**「AI 总评」文本节点（不能只写在注释里），并确认该页消费同一解析器 ⇒ 判定的是「功能在」而非「字样在」
  const rendered = />\s*AI 总评\s*</.test(txt);
  const usesParser = txt.includes('parseCheckerFeedback');
  const ok = !!hit.file && rendered && usesParser;
  check(label + '（' + routePath + '）→ 组件渲染「AI 总评」且消费同一解析器',
    ok,
    hit.file ? path.relative(CLIENT, hit.file)
      + (ok ? '' : (rendered ? '' : ' 未见渲染的「AI 总评」') + (usesParser ? '' : ' 未引用 parseCheckerFeedback') + ' ⇒ 教师打开该页看不到总评')
      : '路由解析失败：' + hit.reason);
}

const failed = results.filter((r) => !r.ok);
console.log('');
console.log('SUMMARY checks=' + results.length + ' failed=' + failed.length + (failed.length ? ' :: ' + failed.map((f) => f.name).join(' | ') : ''));
process.exit(failed.length ? 1 : 0);
