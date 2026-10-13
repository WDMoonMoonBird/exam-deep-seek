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
// ⑥ 请求页三件套防呆（★R2-B47 U-1 根治）：views/teacher/** 中**发起数据请求**的页面必须
//   ①loading 有复位路径（finally 或 catch 内复位）②有列表空态分支 ③依赖路由参数时从 route 取且有重入处理
//   豁免：Layout.vue（壳组件：只渲染菜单/通知，不含列表与空态语义；已在此显式声明）
const TEACHER_DIR = path.join(CLIENT, 'src', 'views', 'teacher');
const TEACHER_EXEMPT = ['Layout.vue'];
const teacherFiles = fs.existsSync(TEACHER_DIR)
  ? fs.readdirSync(TEACHER_DIR).filter((f) => f.endsWith('.vue') && !TEACHER_EXEMPT.includes(f))
  : [];
const missing = { loading: [], empty: [], route: [] };
for (const f of teacherFiles) {
  const txt = read(path.join(TEACHER_DIR, f)) || '';
  const requests = /request\.(get|post|put|delete|patch)|api\/[a-zA-Z]+\.js/.test(txt);
  if (!requests) continue;
  const hasFinally = /finally\s*\{/.test(txt);
  const hasCatch = /catch\s*[({]/.test(txt);
  // 命名约定：loading 态 ref 以 loading 开头（loading / loadingDetail / loadingList…）⇒ 复位语句须命中其中之一
  const resetsLoading = /\b[a-zA-Z_$]*loading[a-zA-Z_$]*\.value\s*=\s*false/i.test(txt);
  if (!(resetsLoading && (hasFinally || hasCatch))) missing.loading.push(f);
  const hasEmpty = /<a-empty|ListPage|empty-title|暂无/.test(txt);
  if (!hasEmpty) missing.empty.push(f);
  const usesRoute = /route\.(params|query)/.test(txt);
  if (usesRoute) {
    const fromRoute = /useRoute\(/.test(txt);
    // ★必须显式处理"路由重入"（参数变化/组件复用）：watch(() => route.*) / onBeforeRouteUpdate / onActivated
    const reentry = /watch\(\s*\(\)\s*=>\s*\[?\s*route\.|onBeforeRouteUpdate|onActivated/.test(txt);
    const naiveCapture = /^\s*const\s+\w+\s*=\s*\+?route\.(params|query)\./m.test(txt);
    if (!(fromRoute && reentry && !naiveCapture)) missing.route.push(f);
  }
}
check('⑥a 请求页 loading 必须有复位路径（finally / catch + loading.value=false）',
  missing.loading.length === 0,
  '缺复位=' + (missing.loading.join(',') || '(none)') + ' 扫描页=' + teacherFiles.length);
check('⑥b 请求页必须有列表空态分支（<a-empty / ListPage / empty-title / 暂无）',
  missing.empty.length === 0,
  '缺空态=' + (missing.empty.join(',') || '(none)'));
check('⑥c 依赖路由参数的页必须从 useRoute 取且有重入处理（watch route.* / onBeforeRouteUpdate / onActivated）',
  missing.route.length === 0,
  '不合规=' + (missing.route.join(',') || '(none)'));

// ⑦ 错误自愈与错误边界（★R2-B52）：懒加载 chunk 失败 ⇒ reload-once（防循环）+ 错误边界在 transition 之外 + 全局错误不静默
//   —— 用**注入桩件**跑纯逻辑（不真实发起网络、不导航），再校验两处 Layout/main.js 的接线契约。
const recovery = await import(path.join(CLIENT, 'src', 'components', 'errorRecovery.js'));
const mkStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), _map: map };
};
let reloadCalls = 0;
const spyReload = () => { reloadCalls += 1; };
const bus = { notices: [] };
const notify = (t) => bus.notices.push(String(t));
const storage = mkStorage();
const chunkErr = () => new Error('Failed to fetch dynamically imported module: /exam/assets/ReviewClass-abc123.js');
// ① 首次 chunk 失败 ⇒ 恰一次 reload + 写防循环键
reloadCalls = 0; bus.notices.length = 0;
const r1 = recovery.handleRouterError(chunkErr(), { fullPath: '/teacher/review/class/9' }, { storage, reload: spyReload, notify });
check('⑦a chunk 失败 ⇒ reload 恰一次 + 写入 chunk-reload:fullPath 防循环键',
  r1.reloaded === true && r1.reason === 'reload_once' && reloadCalls === 1 && storage.getItem(recovery.reloadKeyOf('/teacher/review/class/9')) !== null,
  JSON.stringify({ ...r1, reloadCalls, key: recovery.reloadKeyOf('/teacher/review/class/9') }));
// ② 同路径第二次失败 ⇒ 不再 reload，转为可见错误（不循环刷新）
reloadCalls = 0; bus.notices.length = 0;
const r2 = recovery.handleRouterError(chunkErr(), { fullPath: '/teacher/review/class/9' }, { storage, reload: spyReload, notify });
check('⑦b 同路径第二次失败 ⇒ 不再 reload（防循环）且给出可见提示（错误 UI 而非空白）',
  r2.reloaded === false && r2.reason === 'already_reloaded' && reloadCalls === 0 && bus.notices.length === 1,
  JSON.stringify({ ...r2, reloadCalls, notices: bus.notices.slice(0, 1) }));
// ③ 后续导航到**另一个路由**仍可正常渲染（=用户症状核心：不得被上一次失败卡死）
reloadCalls = 0;
const r3 = recovery.handleRouterError(chunkErr(), { fullPath: '/teacher/students' }, { storage, reload: spyReload, notify });
const boundaryOk = recovery.boundaryState(chunkErr(), '/teacher/review/class/9');
const ebTxt = read(path.join(CLIENT, 'src', 'components', 'ErrorBoundary.vue')) || '';
const resetsOnNav = /watch\(resetOf, \(\) => \{ state\.value = null; \}\)/.test(ebTxt);
check('⑦c 后续导航不被卡死：新路由有自己的自愈预算（不被上一路径标记抑制）+ 边界随路由变化复位',
  r3.reloaded === true && reloadCalls === 1 && resetsOnNav && boundaryOk.failed === true,
  JSON.stringify({ r3, reloadCalls, resetsOnNav }));
// ④ 正常路径（非 chunk 错误）⇒ 不刷新页面、不写键（无多余 reload）
reloadCalls = 0;
const before = storage._map.size;
const r4 = recovery.handleRouterError(new Error('普通业务异常'), { fullPath: '/teacher/teams' }, { storage, reload: spyReload, notify });
check('⑦d 非 chunk 错误 ⇒ 零 reload、不写防循环键（正常路径无多余刷新）',
  r4.handled === false && reloadCalls === 0 && storage._map.size === before,
  JSON.stringify({ ...r4, reloadCalls, keys: storage._map.size }));
// ⑤ 四类 chunk 措辞都要识别（跨浏览器/打包器）
const patterns = ['Failed to fetch dynamically imported module: /a.js', 'Importing a module script failed.', 'Loading chunk 12 failed.', 'error loading dynamically imported module'];
const allChunk = patterns.every((m) => recovery.isChunkLoadError(new Error(m)) === true);
check('⑦e 四类动态导入失败措辞全部识别为可自愈（且普通错误不误判）',
  allChunk && recovery.isChunkLoadError(new Error('题目保存失败')) === false,
  'patterns=' + patterns.length + ' allChunk=' + allChunk);
// ⑥ 接线契约：错误边界在 transition **之外** + 去掉 out-in + main.js 在 mount 前安装 + 全局 handler 齐备
const layoutTeacher = read(path.join(CLIENT, 'src', 'views', 'teacher', 'Layout.vue')) || '';
const layoutAdmin = read(path.join(CLIENT, 'src', 'views', 'admin', 'Layout.vue')) || '';
const mainJs = read(path.join(CLIENT, 'src', 'main.js')) || '';
// 作用域限定在 router-view 那一块（Layout 里还有其它 <transition>，例如移动端抽屉 ⇒ 不能按全文首/末位判断）
const routerViewScope = (txt) => {
  const rv = txt.indexOf('<router-view');
  if (rv < 0) return null;
  const rvEnd = txt.indexOf('</router-view>', rv);
  const b = txt.lastIndexOf('<ErrorBoundary>', rv);
  const bEnd = txt.indexOf('</ErrorBoundary>', rv);
  const t = txt.indexOf('<transition', rv);
  const tEnd = txt.indexOf('</transition>', rv);
  return { rv, rvEnd, b, bEnd, t, tEnd, inner: txt.slice(rv, rvEnd < 0 ? rv + 400 : rvEnd) };
};
const boundaryOutside = (txt) => {
  const s = routerViewScope(txt);
  if (!s) return false;
  return s.b >= 0 && s.b < s.rv && s.bEnd > s.rvEnd && s.t > s.b && s.t > s.rv && s.tEnd > s.t && s.tEnd < s.bEnd;
};
check('⑦f 两处 Layout：ErrorBoundary 包住 router-view 且位于 transition 之外（不会被 out-in 卡住）',
  boundaryOutside(layoutTeacher) && boundaryOutside(layoutAdmin),
  'teacher=' + boundaryOutside(layoutTeacher) + ' admin=' + boundaryOutside(layoutAdmin));
const outIn = /mode="out-in"/;
const scopeTeacher = routerViewScope(layoutTeacher);
const scopeAdmin = routerViewScope(layoutAdmin);
const routerOutIn = (scope) => !!scope && outIn.test(scope.inner);
check('⑦g 两处 Layout 的 router-view 过渡均已去掉 mode=out-in（消除「进入组件解析失败即永久空白」的过渡死锁类）',
  !routerOutIn(scopeTeacher) && !routerOutIn(scopeAdmin),
  'teacherRouterOutIn=' + routerOutIn(scopeTeacher) + ' adminRouterOutIn=' + routerOutIn(scopeAdmin));
const recSrc = read(path.join(CLIENT, 'src', 'components', 'errorRecovery.js')) || '';
check('⑦h main.js 在 mount 之前安装错误自愈；模块含 app.config.errorHandler + unhandledrejection + chunk-reload 键（不静默）',
  /installErrorRecovery\(/.test(mainJs) && mainJs.indexOf('installErrorRecovery(') < mainJs.indexOf("app.mount('#app')")
    && /app\.config\.errorHandler/.test(recSrc) && /unhandledrejection/.test(recSrc) && /chunk-reload:/.test(recSrc)
    && /onErrorCaptured/.test(read(path.join(CLIENT, 'src', 'components', 'ErrorBoundary.vue')) || ''),
  'installedBeforeMount=' + (mainJs.indexOf('installErrorRecovery(') < mainJs.indexOf("app.mount('#app')")));

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
