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
// ★R2-B54：router-view 的 slot 内**不允许**任何 transition（路由过渡已根除），外层仍须有错误边界包住整个 router-view
const boundaryOutside = (txt) => {
  const s = routerViewScope(txt);
  if (!s) return false;
  const outerOpensBefore = s.b >= 0 && s.b < s.rv;
  const outerClosesAfter = txt.lastIndexOf('</ErrorBoundary>') > s.rvEnd;
  const noTransitionInSlot = !/<transition\b/.test(String(txt).slice(s.rv, s.rvEnd < 0 ? s.rv + 600 : s.rvEnd));
  return outerOpensBefore && outerClosesAfter && noTransitionInSlot;
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

// ⑧ 实时通道（socket.io）端点与可观测性（★R2-B53）：默认 path=/exam/socket.io（与生产 nginx 专用 location 一致）+ 可配置 + 失败不阻塞渲染
const socketMod = await import(path.join(CLIENT, 'src', 'composables', 'socketConfig.js'));
const reviewSrc = read(path.join(CLIENT, 'src', 'views', 'teacher', 'Review.vue')) || '';
const reviewClassSrc = read(path.join(CLIENT, 'src', 'views', 'teacher', 'ReviewClass.vue')) || '';
const srcFiles = [];
const walkSrc = (dir) => { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); const st = fs.statSync(p); if (st.isDirectory()) walkSrc(p); else if (p.endsWith('.vue') || p.endsWith('.js')) srcFiles.push(read(p) || ''); } };
walkSrc(path.join(CLIENT, 'src'));
const rootPathResidue = srcFiles.filter((t) => /path:\s*'\/socket\.io'/.test(t)).length;
// ★必须是不带 env 覆盖的 createTeacherSocket(io)（覆盖会改写 path ⇒ 那时生效值取决于 env，不再等于"与生产一致"）
const usesBareFactory = (t) => /createTeacherSocket\(\s*io\s*\)/.test(t);
check('⑧a 两处教师页以 createTeacherSocket(io) 建连（不带覆盖 ⇒ 生效 path=默认=/exam/socket.io），且全仓无根路径 /socket.io 残留',
  usesBareFactory(reviewSrc) && usesBareFactory(reviewClassSrc) && rootPathResidue === 0 && socketMod.DEFAULT_SOCKET_PATH === '/exam/socket.io',
  'review=' + usesBareFactory(reviewSrc) + ' reviewClass=' + usesBareFactory(reviewClassSrc) + ' rootResidue=' + rootPathResidue + ' default=' + socketMod.DEFAULT_SOCKET_PATH);
const epDefault = socketMod.resolveSocketEndpoint({});
const epOverride = socketMod.resolveSocketEndpoint({ VITE_WS_PATH: '/custom/socket.io', VITE_WS_URL: 'https://ws.example.com' });
check('⑧b 端点可经 VITE_WS_PATH / VITE_WS_URL 覆盖（默认与生产一致；url 缺省=同源代理）',
  epDefault.options.path === '/exam/socket.io' && epDefault.url === undefined
    && epOverride.options.path === '/custom/socket.io' && epOverride.url === 'https://ws.example.com'
    && Array.isArray(epDefault.options.transports) && epDefault.options.transports.includes('websocket'),
  JSON.stringify({ def: epDefault, ovr: epOverride }));
const logs = [];
const fakeSocket = { handlers: {}, on(ev, fn) { this.handlers[ev] = fn; } };
socketMod.attachSocketLogging(fakeSocket, { log: { info: (t) => logs.push('I:' + t), warn: (t) => logs.push('W:' + t) } });
fakeSocket.handlers.connect(); fakeSocket.handlers.connect();
fakeSocket.handlers.connect_error(new Error('x')); fakeSocket.handlers.connect_error(new Error('y'));
const idempotent = socketMod.attachSocketLogging(fakeSocket, { log: { info: () => logs.push('I:dup'), warn: () => logs.push('W:dup') } });
check('⑧c 连接事件可观测且不刷屏（connect/connect_error 各一次；重复挂载幂等）',
  logs.filter((l) => l.startsWith('I:')).length === 1 && logs.filter((l) => l.startsWith('W:')).length === 1 && idempotent === true,
  JSON.stringify({ logs }));
let threw = false; let nullReturn = false;
try { nullReturn = socketMod.createTeacherSocket(() => { throw new Error('boom'); }, { log: { info() {}, warn() {} } }) === null; } catch { threw = true; }
const noBlockingAwait = !/await\s+connectSocket\s*\(/.test(reviewSrc) && !/await\s+connectSocket\s*\(/.test(reviewClassSrc);
const guardedCall = /try \{[\s\S]{0,200}createTeacherSocket/.test(reviewSrc) && /try \{[\s\S]{0,200}createTeacherSocket/.test(reviewClassSrc);
check('⑧d 连接失败不影响渲染：建连异常被吞（返回 null 不抛）+ 无顶层 await + 两处调用均在 try/catch 内',
  threw === false && nullReturn === true && noBlockingAwait && guardedCall,
  JSON.stringify({ threw, nullReturn, noBlockingAwait, guardedCall }));

// ⑨ 路由过渡根除 + UI 友好文案 + keyed 边界（★R2-B54）
const stripComments = (t) => String(t).replace(/<!--[\s\S]*?-->/g, '');
const vueFiles = [];
const walkVue = (dir) => { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); const st = fs.statSync(p); if (st.isDirectory()) walkVue(p); else if (p.endsWith('.vue')) vueFiles.push(p); } };
walkVue(path.join(CLIENT, 'src'));
const routeTransitionFiles = [];
for (const p of vueFiles) {
  const t = stripComments(read(p) || '');
  const re = /<transition\b[^>]*>/g; let m;
  while ((m = re.exec(t)) !== null) {
    const end = t.indexOf('</transition>', m.index);
    const span = t.slice(m.index, end < 0 ? t.length : end + 13);
    if (span.includes('<component :is="Component"') || span.includes('<router-view')) routeTransitionFiles.push(path.relative(CLIENT, p));
  }
}
check('⑨a 全仓不存在「包住路由组件」的 <transition>（含 App.vue 顶层；注释不算）',
  routeTransitionFiles.length === 0,
  'violations=' + (routeTransitionFiles.join(',') || '(none)') + ' scanned=' + vueFiles.length);
const uiRel = [
  'src/views/teacher/Students.vue', 'src/views/teacher/ReviewClass.vue', 'src/views/teacher/Review.vue',
  'src/views/admin/GradingRuns.vue', 'src/components/ErrorBoundary.vue',
  // ★R2-B55 扩展：composables/** 与 components/checker/**
  'src/composables/useProjectUpload.js', 'src/composables/question/usePromptPreview.js',
  'src/composables/project/useSaveQuestion.js', 'src/composables/project/useStudentSubmission.js',
  'src/composables/project/useZipUpload.js', 'src/composables/project/useChecker.js',
  'src/composables/review/useReviewAiPrompt.js', 'src/components/checker/CheckerWizard.vue',
];
const rawInUi = [];
for (const rel of uiRel) {
  // 先剥注释（HTML/块/行）⇒ 注释里提到 err.message 不算违规
  const code = String(read(path.join(CLIENT, rel)) || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const lines = code.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/console\./.test(line)) return;
    const m2 = line.match(/(?:err|e|error)\??\.message/);
    if (!m2) return;
    const before = line.slice(0, line.indexOf(m2[0]));
    if (/data\??\.$/.test(before)) return;   // 服务端业务文案（response.data.message）允许
    rawInUi.push(rel + ':' + (i + 1));
  });
}
check('⑨b 面向用户文案不得插值原始 JS 错误（console 行与服务端 data.message 除外）',
  rawInUi.length === 0,
  'rawInUi=' + (rawInUi.join(',') || '(none)'));
const layoutRel = ['src/App.vue', 'src/views/teacher/Layout.vue', 'src/views/admin/Layout.vue', 'src/views/student/Layout.vue'];
const keyedMissing = []; const outerMissing = [];
for (const rel of layoutRel) {
  const t = stripComments(read(path.join(CLIENT, rel)) || '');
  const rv = t.indexOf('<router-view');
  const rvEnd = t.indexOf('</router-view>', rv);
  const slot = rv < 0 ? '' : t.slice(rv, rvEnd < 0 ? t.length : rvEnd);
  // ②v-slot 内必须是 **keyed** ErrorBoundary，且该处**无** transition
  const keyed = /<ErrorBoundary\s+:reset-key="route\.fullPath"/.test(slot) && slot.indexOf('<component :is="Component"') > slot.indexOf('<ErrorBoundary');
  const noTransitionInSlot = !/<transition\b/.test(slot);
  if (!(keyed && noTransitionInSlot)) keyedMissing.push(rel);
  // ③外层错误边界仍在 router-view 之外
  const b = t.lastIndexOf('<ErrorBoundary>', rv);
  const outerClosesAfter = t.lastIndexOf('</ErrorBoundary>') > rvEnd;   // 外层边界闭合在 router-view 之后（inner 是 keyed 那个）
  if (!(b >= 0 && b < rv && outerClosesAfter)) outerMissing.push(rel);
}
check('⑨c 四个入口 v-slot 内为 keyed <ErrorBoundary :reset-key=route.fullPath> 且无 transition；外层边界仍在 router-view 之外',
  keyedMissing.length === 0 && outerMissing.length === 0,
  'keyedMissing=' + (keyedMissing.join(',') || '(none)') + ' outerMissing=' + (outerMissing.join(',') || '(none)'));
// ④可执行：抽取各页 friendlyLoadError 函数体执行（桩件 console）⇒ 固定文案、原始错误只进 console、不抛
const extractFn = (src, header) => { const i = src.indexOf(header); if (i < 0) return null; const b = src.indexOf('{', i); let d = 0; for (let k = b; k < src.length; k += 1) { if (src[k] === '{') d += 1; else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(b + 1, k); } } return null; };
const rawErr = new Error("Cannot read properties of null (reading 'parentNode')");
const friendlyResults = [];
for (const rel of ['src/views/teacher/Students.vue', 'src/views/teacher/ReviewClass.vue', 'src/views/teacher/Review.vue']) {
  const src = read(path.join(CLIENT, rel)) || '';
  const bodyTxt = extractFn(src, 'function friendlyLoadError(');
  if (!bodyTxt) { friendlyResults.push(rel + ':NO_FN'); continue; }
  const logged = [];
  const fn = new Function('console', 'err', bodyTxt);
  let out1 = ''; let threw = false;
  try { out1 = fn({ error: (...a) => logged.push(a) }, rawErr); } catch { threw = true; }
  // 再调一次（模拟「加载中导航离开后再触发」⇒ 仍应友好、不抛）
  try { fn({ error: (...a) => logged.push(a) }, rawErr); } catch { threw = true; }
  const friendly = out1 === '数据加载失败，请重试';
  const noLeak = !String(out1).includes('parentNode') && !String(out1).includes('Cannot read');
  const loggedRaw = logged.length === 2 && logged.every((a) => a.indexOf(rawErr) >= 0);
  friendlyResults.push(rel + ':' + (friendly && noLeak && loggedRaw && !threw ? 'OK' : 'BAD'));
}
check('⑨d 可执行（抽取真实函数体）：返回固定友好文案、不含原始错误、原始错误进 console、两次调用不抛（导航离开场景）',
  friendlyResults.every((r) => r.endsWith(':OK')),
  friendlyResults.join(' | '));

// ⑨e（★R2-B55）：**全仓** UI sink 规则 —— 非 console 行里若同时出现「UI 出口」与「原始错误 .message / String(err)」⇒ 违规
//   UI 出口：antd message.* / notify( / .value = / :message|:sub-title|:description / {{ 插值 / Toast / alert(
const UI_SINKS = /message\.(error|warning|info)\(|notify\(|\.value\s*=|:message=|:sub-title=|:description=|\{\{|Toast|alert\(|errorText|errMsg/;
const RAW_MSG = /(?:err|e|error|reason)\??\.message|String\((?:err|e|error)\)/;
const sinkViolations = [];
const allCode = [];
const walkAll = (dir) => { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); const st = fs.statSync(p); if (st.isDirectory()) walkAll(p); else if (/\.(vue|js)$/.test(p)) allCode.push(p); } };
walkAll(path.join(CLIENT, 'src'));
for (const p of allCode) {
  const code = String(read(p) || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  code.split(/\r?\n/).forEach((line, i) => {
    if (/console\.|log\.(warn|error|info)/.test(line)) return;
    if (!UI_SINKS.test(line) || !RAW_MSG.test(line)) return;
    const m3 = line.match(RAW_MSG);
    const before = m3 ? line.slice(0, line.indexOf(m3[0])) : '';
    if (/data\??\.$/.test(before)) return;   // 服务端业务文案豁免
    sinkViolations.push(path.relative(CLIENT, p) + ':' + (i + 1));
  });
}
// ★R2-B55：本批 inScope 不含 client/src/views/ ⇒ 已存在的越界文件按**文件级棘轮**记录在案（新增违规仍会失败）
const OUT_OF_SCOPE_OFFENDERS = [];   // ★R2-B57：ProjectReviewNew.vue 的 4 处已改用 errorCopyOf ⇒ 棘轮收紧为 0（全仓零违规）
const offenders = [...new Set(sinkViolations.map((v) => v.split(':')[0]))];
const unexpected = offenders.filter((f) => !OUT_OF_SCOPE_OFFENDERS.includes(f));
check('⑨e 全仓（剥注释）：UI 出口处不得出现原始错误 .message / String(err)（服务端 data.message 豁免）',
  unexpected.length === 0,
  'newViolations=' + (unexpected.join(',') || '(none)')
    + ' knownOutOfScope=' + offenders.filter((f) => OUT_OF_SCOPE_OFFENDERS.includes(f)).map((f) => f + '(' + sinkViolations.filter((v) => v.startsWith(f + ':')).length + ')').join(',')
    + ' scanned=' + allCode.length);
// ⑨f 接线契约：新修文件必须走统一出口 errorCopyOf（且 errorRecovery 的 notify 收敛为「请重试 + 路由」）
const copyUsers = ['src/composables/useProjectUpload.js', 'src/composables/question/usePromptPreview.js', 'src/composables/project/useSaveQuestion.js', 'src/composables/project/useStudentSubmission.js', 'src/composables/project/useZipUpload.js', 'src/composables/project/useChecker.js', 'src/composables/review/useReviewAiPrompt.js', 'src/components/checker/CheckerWizard.vue'];
const notUsingCopy = copyUsers.filter((rel) => !/errorCopyOf\(/.test(String(read(path.join(CLIENT, rel)) || '')) || !/errorCopy\.js/.test(String(read(path.join(CLIENT, rel)) || '')));
const recSrc2 = String(read(path.join(CLIENT, 'src', 'components', 'errorRecovery.js')) || '');
const notifyOk = /notify\('页面加载出错了，请重试（路由：' \+ fullPath \+ '）'\)/.test(recSrc2) && (recSrc2.match(/请重试（路由：/g) || []).length >= 3 && !/notify\('[^']*' \+ \(\(err && err\.message\)/.test(recSrc2);
check('⑨f 新修文件统一走 errorCopyOf（含 errorCopy.js 导入）；errorRecovery 的 notify 收敛为「请重试 + 路由」（保留路由信息）',
  notUsingCopy.length === 0 && notifyOk,
  'notUsingCopy=' + (notUsingCopy.join(',') || '(none)') + ' notifyOk=' + notifyOk);
// ⑨g 可执行（★R2-B55 测试②）：模拟上传/校验失败 ⇒ UI 文案友好、原始错误进 console、无原文泄漏
const copyMod = await import(path.join(CLIENT, 'src', 'composables', 'errorCopy.js'));
const seen = [];
const stubLog = { error: (...a) => seen.push(a) };
const rawErr2 = new Error("Cannot read properties of null (reading 'parentNode')");
const ui1 = copyMod.errorCopyOf(rawErr2, { tag: 'useZipUpload.js 上传压缩包', action: '上传', log: stubLog });
const ui2 = copyMod.errorCopyOf({ response: { data: { message: '文件格式不正确' } } }, { tag: 'CheckerWizard.vue JSON 校验', action: 'JSON 校验', log: stubLog });
const ui3 = copyMod.errorCopyOf({ code: 'ENOENT' }, { tag: 'useProjectUpload.js 解析题目文件', action: '解析', log: stubLog });
check('⑨g 可执行：模拟上传/校验失败 ⇒ UI 固定友好（服务端业务文案优先）、原始错误三次都进 console、不泄漏原文',
  ui1 === '上传失败，请重试' && ui2 === '文件格式不正确' && ui3 === '解析失败，请重试'
    && seen.length === 3 && seen.every((a) => a.indexOf(rawErr) >= 0 || a[1] && a[1].err !== undefined)
    && ![ui1, ui2, ui3].some((t) => String(t).includes('parentNode') || String(t).includes('Cannot read') || String(t).includes('[object Object]')),
  JSON.stringify({ ui1, ui2, ui3, logged: seen.length }));

// ⑩ 三端「我的信息 + 修改密码」对齐（★R2-B56）
const threeLayouts = { teacher: 'src/views/teacher/Layout.vue', student: 'src/views/student/Layout.vue', admin: 'src/views/admin/Layout.vue' };
const layoutGaps = [];
for (const [who, rel] of Object.entries(threeLayouts)) {
  const t = stripComments(read(path.join(CLIENT, rel)) || '');
  const hasMenu = /key="profile"/.test(t) && />\s*我的信息\s*</.test(t);
  const hasCard = /<ProfileCard\b/.test(t) && /<StatusTag|ProfileCard/.test(t);
  const pwdFields = (t.match(/a-input-password/g) || []).length >= 3 && /原密码/.test(t) && /新密码/.test(t) && /确认新密码/.test(t);
  const hasApi = /request\.put\('\/auth\/password'/.test(t);
  const shape = /:width="520"/.test(t) && /:destroyOnClose="true"/.test(t) && /@cancel="resetPwdForm"/.test(t) && /function resetPwdForm\(/.test(t);
  const icon = /UserOutlined/.test(t);
  if (!(hasMenu && hasCard && pwdFields && hasApi && shape && icon)) {
    layoutGaps.push(who + ':' + JSON.stringify({ hasMenu, hasCard, pwdFields, hasApi, shape, icon }));
  }
}
check('⑩a 三端 Layout（teacher/student/admin）都含「我的信息」菜单项 + ProfileCard + 三字段密码表单 + /auth/password + 520/destroyOnClose/重置',
  layoutGaps.length === 0,
  'gaps=' + (layoutGaps.join(' | ') || '(none)'));
// ⑩b ProfileCard 的 role 文案/色调（抽取真实 computed 表达式求值；teacher/student 逐字不变）
const pcSrc = String(read(path.join(CLIENT, 'src', 'components', 'ProfileCard.vue')) || '');
const roleTextExpr = (pcSrc.match(/const roleText = computed\(\(\) => \(([\s\S]*?)\)\);/) || [])[1];
const roleToneExpr = (pcSrc.match(/const roleTone = computed\(\(\) => \(([\s\S]*?)\)\)/) || [])[1];
const roleOf = (role) => {
  const fn = new Function('props', 'return { text: ' + roleTextExpr + ', tone: ' + roleToneExpr + ' };');
  return fn({ role });
};
const rTeacher = roleOf('teacher'); const rStudent = roleOf('student'); const rAdmin = roleOf('admin');
check('⑩b ProfileCard：admin ⇒ 「管理员」(brand)；teacher ⇒ 「教师」(brand)、student ⇒ 「学生」(accent) 逐字不变',
  rTeacher.text === '教师' && rTeacher.tone === 'brand' && rStudent.text === '学生' && rStudent.tone === 'accent'
    && rAdmin.text === '管理员' && rAdmin.tone === 'brand',
  JSON.stringify({ rTeacher, rStudent, rAdmin }));
// ⑩c 抽取管理员 changePassword **真实函数体**执行（桩件 request/message）⇒ 校验、请求体、成功清空
const adminSrc = String(read(path.join(CLIENT, 'src', 'views', 'admin', 'Layout.vue')) || '');
const pwdBody = extractFn(adminSrc, 'async function changePassword(');
const pwdPolicyMod = await import(path.join(CLIENT, 'src', 'composables', 'passwordPolicy.js'));   // ★R2-B58
const runPwd = (form) => { const calls = { put: [], warn: [], success: [], error: [], resets: 0 };
  const pwdForm = { ...form };
  // 真实函数体是**语句**（不是表达式）⇒ 包成 async IIFE 执行（返回其 Promise）
  // ★R2-B58：changePassword 现在先走本地规则校验 ⇒ 必须把真实 localPasswordIssue 注入沙箱
  const stub = new Function('pwdForm', 'message', 'request', 'changingPwd', 'resetPwdForm', 'errorCopyOf', 'localPasswordIssue', 'return (async () => {' + pwdBody + '})();');
  const changingPwd = { value: false };
  const p = stub(pwdForm, { warn: (t) => calls.warn.push(t), success: (t) => calls.success.push(t), error: (t) => calls.error.push(t) },
    { put: (url, body) => { calls.put.push([url, body]); return Promise.resolve({}); } }, changingPwd,
    () => { calls.resets += 1; pwdForm.oldPassword = ''; pwdForm.newPassword = ''; pwdForm.confirmPassword = ''; },
    (err, opts) => copyMod.errorCopyOf(err, { ...(opts || {}), log: { error() {} } }),
    pwdPolicyMod.localPasswordIssue);
  return { p, calls, changingPwd, pwdForm };
};
// ★R2-B58：夹具改用**合规**口令（≥8 位、含字母与数字、与原密码不同），并额外覆盖「本地先拦长度」一态
const caseEmpty = runPwd({ oldPassword: '', newPassword: '', confirmPassword: '' }); await caseEmpty.p;
const caseShort = runPwd({ oldPassword: 'W67-strong-1', newPassword: 'Ab1cdef', confirmPassword: 'Ab1cdef' }); await caseShort.p;
const caseMismatch = runPwd({ oldPassword: 'W67-strong-1', newPassword: 'W67-strong-2', confirmPassword: 'W67-strong-3' }); await caseMismatch.p;
const caseOk = runPwd({ oldPassword: 'W67-strong-1', newPassword: 'W67-strong-2', confirmPassword: 'W67-strong-2' }); await caseOk.p;
const okBody = caseOk.calls.put[0] ? caseOk.calls.put[0][1] : null;
const bodyKeys = okBody ? Object.keys(okBody).sort().join(',') : '(none)';
check('⑩c 真实函数体执行：空值/过短/不一致 ⇒ 零请求 + 本地文案；合规 ⇒ 恰一次 PUT /auth/password 且请求体键恰为 oldPassword,newPassword（无 confirmPassword）+ 成功清空收起 + loading 复位',
  caseEmpty.calls.put.length === 0 && caseEmpty.calls.warn.length === 1 && caseEmpty.calls.warn[0] === '请填写密码'
    && caseShort.calls.put.length === 0 && caseShort.calls.warn[0] === '新密码至少 8 位'
    && caseMismatch.calls.put.length === 0 && caseMismatch.calls.warn.length === 1 && caseMismatch.calls.warn[0] === '两次新密码不一致'
    && caseOk.calls.put.length === 1 && caseOk.calls.put[0][0] === '/auth/password' && bodyKeys === 'newPassword,oldPassword'
    && caseOk.calls.success.length === 1 && caseOk.calls.success[0] === '密码修改成功'
    && caseOk.calls.resets === 1 && caseOk.pwdForm.oldPassword === '' && caseOk.pwdForm.newPassword === '' && caseOk.pwdForm.confirmPassword === ''
    && caseOk.changingPwd.value === false,
  JSON.stringify({ empty: caseEmpty.calls, mismatch: caseMismatch.calls.warn, put: caseOk.calls.put, bodyKeys, resets: caseOk.calls.resets, loading: caseOk.changingPwd.value }));

// ⑪ 自助改密码规则三端一致（★R2-B58）：规则提示 + 提交前本地拦截 + 与后端文案逐字对齐
const pwdPolicy = await import(path.join(CLIENT, 'src', 'composables', 'passwordPolicy.js'));
const pwdLayouts = ['src/views/teacher/Layout.vue', 'src/views/student/Layout.vue', 'src/views/admin/Layout.vue'];
const pwdGaps = [];
for (const rel of pwdLayouts) {
  const t = stripComments(read(path.join(CLIENT, rel)) || '');
  const hasHint = /\{\{\s*PASSWORD_RULE_TEXT\s*\}\}/.test(t);
  const usesPolicy = /localPasswordIssue\(pwdForm\)/.test(t) && /passwordPolicy\.js/.test(t);
  const keepsServerMsg = /errorCopyOf\(e, \{ tag:/.test(t);
  if (!(hasHint && usesPolicy && keepsServerMsg)) pwdGaps.push(rel + JSON.stringify({ hasHint, usesPolicy, keepsServerMsg }));
}
check('⑪a 三端「我的信息」密码表单：规则提示 + 提交前 localPasswordIssue 拦截 + 后端业务消息仍走 errorCopyOf 上屏',
  pwdGaps.length === 0,
  'gaps=' + (pwdGaps.join(' | ') || '(none)'));
// ⑪b 可执行：规则文案与后端**逐字一致**（读后端源码比对）+ 逐条边界
const authSrc = String(read(path.join(CLIENT, '..', 'server', 'src', 'controllers', 'authController.js')) || '');
const backendHas = (msg) => authSrc.includes("'" + msg + "'") || authSrc.includes('"' + msg + '"');
const cases = [
  [{ oldPassword: 'W67-strong-1', newPassword: 'Ab1cdef', confirmPassword: 'Ab1cdef' }, pwdPolicy.PWD_MSG.tooShort],
  [{ oldPassword: 'W67-strong-1', newPassword: 'Abcdefgh', confirmPassword: 'Abcdefgh' }, pwdPolicy.PWD_MSG.needLetterDigit],
  [{ oldPassword: 'W67-strong-1', newPassword: '12345678', confirmPassword: '12345678' }, pwdPolicy.PWD_MSG.needLetterDigit],
  [{ oldPassword: 'W67-strong-1', newPassword: 'W67-strong-1', confirmPassword: 'W67-strong-1' }, pwdPolicy.PWD_MSG.sameAsOld],
  [{ oldPassword: 'W67-strong-1', newPassword: 'W67-strong-2', confirmPassword: 'W67-strong-3' }, pwdPolicy.PWD_MSG.mismatch],
  [{ oldPassword: '', newPassword: '', confirmPassword: '' }, pwdPolicy.PWD_MSG.empty],
  [{ oldPassword: 'W67-strong-1', newPassword: 'W67-strong-2', confirmPassword: 'W67-strong-2' }, ''],
];
const caseResults = cases.map(([form, want]) => (pwdPolicy.localPasswordIssue(form) === want ? "OK" : "BAD:" + pwdPolicy.localPasswordIssue(form)));
const ruleTextOk = /密码至少 8 位/.test(pwdPolicy.PASSWORD_RULE_TEXT) && pwdPolicy.PWD_MIN_LEN === 8;
const sameWording = [pwdPolicy.PWD_MSG.tooShort, pwdPolicy.PWD_MSG.needLetterDigit, pwdPolicy.PWD_MSG.sameAsOld].every((m) => backendHas(m) || authSrc.includes(m.split(' ')[0]));
check('⑪b 可执行：本地校验六态正确（含边界 7/8 位、纯字母、纯数字、与原密码相同、两次不一致、合法）且文案与后端一致',
  caseResults.every((r) => r === 'OK') && ruleTextOk && sameWording,
  JSON.stringify({ caseResults, ruleText: pwdPolicy.PASSWORD_RULE_TEXT, sameWording }));
// ⑪c 顺序：后端必须是 锁定判定 ⇒ 强度校验 ⇒ 原密码校验（bcrypt）⇒ 落库；强度失败不得计入错误次数
// ★R2-B58：必须只看 **changePassword 函数体内部**的调用顺序（同名函数/注释在上面出现会造成误判）
const cpBody = extractFn(authSrc, 'export const changePassword = async (req, res) => {') || '';
const iLock = cpBody.indexOf('lockRemainingMs(userId)');
const iStrength = cpBody.indexOf('validateSelfServicePassword(oldPassword, newPassword)');
const iCompare = cpBody.indexOf("bcrypt.compareSync(String(oldPassword");
const iNote = cpBody.indexOf('noteOldPasswordFailure(userId)');
const iClear = cpBody.indexOf('clearOldPasswordFailures(userId)');
const orderOk = iLock > 0 && iLock < iStrength && iStrength < iCompare && iCompare < iNote && iNote < iClear;
const strengthNotCounted = cpBody.indexOf('noteOldPasswordFailure') > cpBody.indexOf('strength.ok') && (cpBody.match(/noteOldPasswordFailure/g) || []).length === 1;
check('⑪c 后端顺序：锁定判定 ⇒ 强度校验 ⇒ 原密码校验 ⇒ 失败计数 ⇒ 成功清零；强度失败不计入错误次数',
  orderOk && strengthNotCounted,
  JSON.stringify({ iLock, iStrength, iCompare, iNote, iClear, orderOk, strengthNotCounted }));

// ⑫ 入口版本探测 + 当前版本可见（★R2-B59）
const appVerSrc = String(read(path.join(CLIENT, 'src', 'composables', 'appVersion.js')) || '');
const viteSrc = String(read(path.join(CLIENT, 'vite.config.js')) || '');
const mainSrc = String(read(path.join(CLIENT, 'src', 'main.js')) || '');
const pcSrc2 = String(read(path.join(CLIENT, 'src', 'components', 'ProfileCard.vue')) || '');
check('⑫a 构建期版本常量已注入（vite define：v-<yyyyMMddHHmm> 形式，由日期各部分拼出）',
  /define:\s*\{[^}]*__BUILD_VERSION__:\s*JSON\.stringify\(BUILD_STAMP\)/.test(viteSrc)
    && /BUILD_STAMP\s*=\s*'v-'\s*\+\s*__now\.getFullYear\(\)/.test(viteSrc)
    && /getMonth\(\)\s*\+\s*1/.test(viteSrc) && /getMinutes\(\)/.test(viteSrc),
  'define=' + /__BUILD_VERSION__/.test(viteSrc) + ' stamp=' + /BUILD_STAMP/.test(viteSrc));
check('⑫b main.js 在 mount **之后**安装版本探测；提示为**非打断式**（message.info + 点击刷新 ⇒ reload）且失败静默',
  /import \{ installVersionWatcher \}/.test(mainSrc) && mainSrc.indexOf('installVersionWatcher(') > mainSrc.indexOf("app.mount('#app')")
    && /message\.info\(\{/.test(mainSrc) && /点击刷新/.test(mainSrc) && /window\.location\.reload\(\)/.test(mainSrc)
    && /duration:\s*0/.test(mainSrc) && /catch \{ \/\* 提示失败不得反过来影响渲染 \*\/ \}/.test(mainSrc),
  'afterMount=' + (mainSrc.indexOf('installVersionWatcher(') > mainSrc.indexOf("app.mount('#app')")));
check('⑫c 三端共用的 ProfileCard 资料区展示版本短码（小字）⇒ 三端一并可见',
  /\{\{\s*versionLabel\s*\}\}/.test(pcSrc2) && /<dt>版本<\/dt>/.test(pcSrc2) && /appVersionLabel\(\)/.test(pcSrc2) && /pc-ver/.test(pcSrc2),
  'row=' + /<dt>版本<\/dt>/.test(pcSrc2) + ' label=' + /versionLabel/.test(pcSrc2));
check('⑫d 探测模块零依赖（未引入新依赖）且暴露四态所需 API',
  !/^\s*import\s/m.test(appVerSrc) && /installVersionWatcher|checkForNewVersion|appVersionLabel|DEFAULT_CHECK_INTERVAL_MS|MIN_CHECK_GAP_MS/.test(appVerSrc),
  'hasImport=' + /^\s*import\s/m.test(appVerSrc));
// ⑫e 可执行：四态 + 健壮性（注入 fetch/doc/storage/notify 桩件；不发真实网络）
const appVer = await import(path.join(CLIENT, 'src', 'composables', 'appVersion.js'));
const vStore = (() => { const m2 = new Map(); return { getItem: (k) => (m2.has(k) ? m2.get(k) : null), setItem: (k, v) => m2.set(k, String(v)), _m: m2 }; })();
const vDoc = { querySelector: () => ({ getAttribute: () => '/exam/assets/index-aaaaaaa1.js' }) };
const vHtml = (h) => '<html><script type="module" crossorigin src="/exam/assets/index-' + h + '.js"></script></html>';
const vRes = (html, ok) => ({ ok: ok !== false, text: async () => html });
let vNotes = 0;
const vNotify = () => { vNotes += 1; };
const s1 = await appVer.checkForNewVersion({ fetchImpl: () => vRes(vHtml('aaaaaaa1')), doc: vDoc, storage: vStore, notify: vNotify, now: () => 1000 });
const s2 = await appVer.checkForNewVersion({ fetchImpl: () => vRes(vHtml('bbbbbbb2')), doc: vDoc, storage: vStore, notify: vNotify, now: () => 2000 });
const s3 = await appVer.checkForNewVersion({ fetchImpl: () => vRes(vHtml('bbbbbbb2')), doc: vDoc, storage: vStore, notify: vNotify, now: () => 100000 });
const s4 = await appVer.checkForNewVersion({ fetchImpl: () => vRes(vHtml('bbbbbbb2')), doc: vDoc, storage: vStore, notify: vNotify, now: () => 200000 });
const s5 = await appVer.checkForNewVersion({ fetchImpl: () => vRes('<html>bad</html>'), doc: vDoc, storage: vStore, notify: vNotify, now: () => 300000 });
const s6 = await appVer.checkForNewVersion({ fetchImpl: () => { throw new Error('offline'); }, doc: vDoc, storage: vStore, notify: vNotify, now: () => 400000 });
const s7 = await appVer.checkForNewVersion({ fetchImpl: () => vRes('', false), doc: vDoc, storage: vStore, notify: vNotify, now: () => 500000 });
check('⑫e 可执行四态：相同 ⇒ 不提示；去抖（1s 内二次检测 ⇒ throttled）；不同 ⇒ 提示恰一次；同版本再次检测 ⇒ 不再提示；坏 HTML/离线/HTTP 错 ⇒ 静默忽略',
  s1.status === 'same' && s2.status === 'throttled'
    && s3.status === 'newer' && s3.notified === true
    && s4.status === 'newer' && s4.notified === false && s4.reason === 'already_notified'
    && s5.status === 'ignored' && s6.status === 'ignored' && s7.status === 'ignored' && vNotes === 1,
  JSON.stringify({ s1, s2, s3, s4, s5, s6, s7, vNotes, label: appVer.appVersionLabel(vDoc) }));

// ⑬ 原始 HTML 注入面已审计（★R2-B60）：危险 sink 清零 + v-html/innerHTML 仅允许「已清洗或静态」表达式 + 清洗器确用 DOMPurify
const srcJs = [];
const walkSink = (dir) => { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); const st = fs.statSync(p); if (st.isDirectory()) walkSink(p); else if (/\.(vue|js)$/.test(p)) srcJs.push(p); } };
walkSink(path.join(CLIENT, 'src'));
const codeOfFile = (p) => String(read(p) || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sinkHits = [];
const newFnFiles = [];
for (const p of srcJs) {
  const t = codeOfFile(p);
  if (/document\.write\s*\(|outerHTML|insertAdjacentHTML|\beval\s*\(/.test(t)) sinkHits.push(path.relative(CLIENT, p));
  if (/new Function\s*\(/.test(t)) newFnFiles.push(path.relative(CLIENT, p));
}
check('⑬a 危险 sink 清零：client/src 无 document.write / outerHTML / insertAdjacentHTML / eval( 用法',
  sinkHits.length === 0,
  'hits=' + (sinkHits.join(',') || '(none)'));
check('⑬b new Function 仅限浏览器能力探测（domain/browserCompat.js），不得用于渲染用户内容',
  newFnFiles.length === 1 && newFnFiles[0] === 'src/domain/browserCompat.js',
  'files=' + (newFnFiles.join(',') || '(none)'));
const RAW_HTML_OK = /^(safe[A-Za-z]*|sec\.content|_sanHtml\()/;
const rawHtmlBad = [];
let rawHtmlCount = 0;
for (const p of srcJs) {
  const t = codeOfFile(p);
  const exprs = [...t.matchAll(/v-html="([^"]+)"/g)].map((m) => m[1].trim()).concat([...t.matchAll(/innerHTML:\s*_sanHtml\(/g)].map(() => '_sanHtml('));
  rawHtmlCount += exprs.length;
  for (const ex of exprs) { if (!RAW_HTML_OK.test(ex)) rawHtmlBad.push(path.relative(CLIENT, p) + String.fromCharCode(58) + ex); }
}
check('⑬c 所有 v-html / innerHTML 表达式均在白名单内（已清洗或内置静态内容）——新增未清洗用法即失败',
  rawHtmlBad.length === 0,
  'count=' + rawHtmlCount + ' bad=' + (rawHtmlBad.join(' | ') || '(none)'));
const ump = String(read(path.join(CLIENT, 'src', 'composables', 'submit', 'useSubmitPage.js')) || '');
const qp = String(read(path.join(CLIENT, 'src', 'composables', 'question', 'questionPure.js')) || '');
check('⑬d 清洗器确用 DOMPurify（safeMaterial/safeSqContent 与 _sanHtml 两条链路）',
  /import DOMPurify/.test(ump) && /DOMPurify\.sanitize\(/.test(ump) && /DOMPurify\.sanitize\(/.test(qp),
  'useSubmitPage=' + /import DOMPurify/.test(ump) + ' questionPure=' + /DOMPurify\.sanitize\(/.test(qp));
const viteCfg = read(path.join(CLIENT, 'vite.config.js')) || '';
check('⑧e 开发代理就位：vite.config.js 含 /exam/socket.io 代理（ws:true + 去前缀）',
  // ★锚定"代理键"位置（避免 rewrite 行里的同名字符串让断言恒真），并要求 target/ws/去前缀齐备
  /[\n\r]\s*'\/exam\/socket\.io'\s*:\s*\{/.test(viteCfg) && /target:\s*'http:\/\/127\.0\.0\.1:3002'/.test(viteCfg)
  && /ws:\s*true/.test(viteCfg) && viteCfg.includes("replace('/exam/socket.io', '/socket.io')"),
  'hasPath=' + viteCfg.includes("'/exam/socket.io'") + ' ws=' + /ws:\s*true/.test(viteCfg));
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

// ⑭ 按班看失分项分布（★R2-B68 WAVE3）：后端聚合口径（可执行）+ 页面入口/空态/错误态契约
const B68_REPO = path.join(CLIENT, '..');
const b68SvcPath = path.join(B68_REPO, 'server', 'src', 'application', 'queries', 'classLossDistribution.js');
const b68SvcTxt = read(b68SvcPath) || '';
const b68Mod = await import(b68SvcPath);
const b68Subs = [
  { checkerId: 'ck1', canonicalSha256: 'a1', aiFeedback: JSON.stringify({ source: 'dsh-checker', breakdown: [
    { item: 'P01', title: '命名规范', status: 'miss', score: 0, maxScore: 10 },
    { item: 'P02', title: '空值处理', status: 'hit', score: 10, maxScore: 10 },
  ] }) },
  { checkerId: 'ck1', canonicalSha256: 'a1', aiFeedback: JSON.stringify({ source: 'dsh-checker', breakdown: [
    { item: 'P01', title: '命名规范', status: 'miss', score: 0, maxScore: 10 },
    { item: 'P02', title: '空值处理', status: 'hit', score: 8, maxScore: 10 },
  ] }) },
  { aiFeedback: JSON.stringify({ source: 'dsh-checker', breakdown: [
    { item: 'P01', title: '命名规范', status: 'hit', score: 10, maxScore: 10 },
    { item: 'P03', title: '异常分支', status: 'unknown', score: 0, maxScore: 5 },
  ] }) },
  { aiFeedback: 'not-json' },
  { aiFeedback: null },
];
const b68Agg = b68Mod.aggregateLossByItem(b68Subs);
const b68Empty = b68Mod.aggregateLossByItem([]);
check('⑭a 聚合口径（可执行）：分子/分母与失分率正确、按失分率降序、未判定不计入分母、坏 JSON/空输入不抛（含空数据）',
  b68Agg.items.length === 3
    && b68Agg.items[0].item === 'P01' && b68Agg.items[0].numerator === 2 && b68Agg.items[0].denominator === 3 && Math.abs(b68Agg.items[0].lossRate - 0.6667) < 1e-4
    && b68Agg.items[1].item === 'P02' && b68Agg.items[1].denominator === 2 && b68Agg.items[1].lossRate === 0
    && b68Agg.items[2].item === 'P03' && b68Agg.items[2].unknown === 1 && b68Agg.items[2].denominator === 0 && b68Agg.items[2].lossRate === null
    && b68Agg.totals.hits === 3 && b68Agg.totals.misses === 2 && b68Agg.totals.unknown === 1 && b68Agg.versions.length === 1
    && b68Empty.items.length === 0 && b68Empty.totals.submissionsScanned === 0,
  JSON.stringify({ first: b68Agg.items[0], last: b68Agg.items[2], totals: b68Agg.totals, emptyItems: b68Empty.items.length }));
const b68TeacherRoute = read(path.join(B68_REPO, 'server', 'src', 'routes', 'teacher.js')) || '';
const b68AdminRoutes = read(path.join(B68_REPO, 'server', 'src', 'interface', 'http', 'routes', 'admin.js')) || '';
const b68TeacherCtrl = read(path.join(B68_REPO, 'server', 'src', 'interface', 'http', 'controllers', 'teacher', 'loss-distribution.js')) || '';
const b68AdminCtrl = read(path.join(B68_REPO, 'server', 'src', 'interface', 'http', 'controllers', 'admin', 'grading-runs', 'loss-distribution.js')) || '';
check('⑭b 后端接线：教师路由 + 管理员路由（注册在 /:id 之前）齐备，权限口径复用 resolveVisibleClassScope（403 fail-closed）',
  /router\.get\('\/assignments\/:id\/loss-distribution'/.test(b68TeacherRoute)
    // 注册顺序：router.get('/loss-distribution' …) 必须在 router.get('/:id' …) 之前（注释里出现 '/:id' 不算）
    && b68AdminRoutes.indexOf("router.get('/loss-distribution'") > 0
    && b68AdminRoutes.indexOf("router.get('/loss-distribution'") < b68AdminRoutes.indexOf("router.get('/:id'")
    && /resolveVisibleClassScope/.test(b68TeacherCtrl) && /code: 1003/.test(b68TeacherCtrl)
    && /loadClassLossDistribution/.test(b68TeacherCtrl) && /loadClassLossDistribution/.test(b68AdminCtrl)
    && !/\$executeRawUnsafe|\$queryRawUnsafe|prisma\.[a-zA-Z]+\.(create|update|delete)/.test(b68SvcTxt + b68TeacherCtrl + b68AdminCtrl)
    // 版本块走参数化只读 $queryRaw（Client DMMF 不含 grading_rulers/assignment_question_rulers）⇒ 断言「有只读 raw、无写 raw」
    && /\$queryRaw/.test(b68SvcTxt) && !/\$executeRaw/.test(b68SvcTxt + b68TeacherCtrl + b68AdminCtrl)
    && !/^\s*import\s/m.test(b68SvcTxt),   // 服务零 import（prisma 注入）⇒ 纯函数可被本脚本直接 import
  'teacherRoute=' + /loss-distribution/.test(b68TeacherRoute) + ' adminOrder=' + b68AdminRoutes.indexOf("router.get('/loss-distribution'") + '<' + b68AdminRoutes.indexOf("router.get('/:id'") + ' svcImports=' + /^\s*import\s/m.test(b68SvcTxt));
const b68Drawer = read(path.join(CLIENT, 'src', 'components', 'LossDistributionDrawer.vue')) || '';
const b68ReviewClass = read(path.join(CLIENT, 'src', 'views', 'teacher', 'ReviewClass.vue')) || '';
const b68GradingRuns = read(path.join(CLIENT, 'src', 'views', 'admin', 'GradingRuns.vue')) || '';
check('⑭c 页面契约：两处入口按钮 + 共享抽屉（teacher/admin 双角色）+ 空态 + errorCopyOf 口径（无 err.message 上屏）',
  /失分项分布/.test(b68ReviewClass) && /LossDistributionDrawer/.test(b68ReviewClass) && /role="teacher"/.test(b68ReviewClass)
    && /失分项分布/.test(b68GradingRuns) && /LossDistributionDrawer/.test(b68GradingRuns) && /role="admin"/.test(b68GradingRuns)
    && /<a-empty/.test(b68Drawer) && /errorCopyOf\(/.test(b68Drawer) && /errorCopy\.js/.test(b68Drawer)
    && /loss-distribution/.test(b68Drawer) && /numerator|denominator/.test(b68Drawer)
    && !/(?:err|e|error)\??\.message/.test(b68Drawer.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')),
  'reviewClass=' + /LossDistributionDrawer/.test(b68ReviewClass) + ' gradingRuns=' + /LossDistributionDrawer/.test(b68GradingRuns) + ' drawerEmpty=' + /<a-empty/.test(b68Drawer));

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// ⑮ 裸请求静态门禁（★W1 / t1）：**未就地处理的请求调用 = 0** —— 防"API 失败 ⇒ 整页被错误边界替换"复发
//
// 规则（口径写死在此，供 CI 与人工判读；改动必须同步改本注释与自检样例）：
//   · 命中定义（client/src/**/*.{js,vue}）：
//       ① request.<get|post|put|delete|patch>(…) 调用（含 await 与非 await 形态）；
//       ② await <api 封装函数>(…) —— 封装清单从 client/src/api/*.js 的 export 声明**自动收集**
//          （api 层只是端点定义 / Promise 透传，本身不处理错误 ⇒ ① 在 api/*.js 内豁免，
//            但 ② 把"经封装层取数"的调用方重新纳入判据，不留后门）。
//   · 合规（命中处必须满足其一）：
//       ⓐ 位于**带 catch 的 try 块**内 —— 失败被就地处理，不会冒泡到错误边界；
//       ⓒ 作为 safeLoad(...) / safeSubmit(...)（composables/useSafeRequest.js 约定）的实参 —— 失败只提示、不抛。
//     ★只有 try/finally（无 catch）**不算**合规：它不吸收错误，失败照旧冒泡 ⇒ 正是本类缺陷的温床
//       （已复现：Teams.vue / Questions.vue / ReviewClass.vue 曾是 try/finally 裸 await ⇒ 失败即整页被替换）。
//   · 豁免：client/src/api/*.js（端点定义层，见 ②）。清单写死，其余任何文件都不豁免。
//   · 自检样例（每次运行都跑，任一不满足即门禁自身失效 ⇒ FAIL）：
//       反例 ×3 必须报红：裸 await / 仅 try-finally / 裸的 api 封装调用；
//       正例 ×4 必须无事：try/catch 内、safeLoad 实参、多行 safeSubmit 实参、api/*.js 豁免位。
//   · 真实仓库命中数必须为 0（明细逐条打在 FAIL 输出里，可直接定位）。
//   · ★口径例外（W1-r2 登记，⑮j 自检其登记与自身兜底都在）：以下两处**不经 axios 实例**，因此不受本门禁的
//       "已规范化"覆盖 —— 后人不得据此认为"全仓请求都已规范化"：
//       ① `client/src/composables/submit/useDraftSave.js` —— 关闭/崩溃时的 **keepalive** 落盘（window.fetch + keepalive:true，
//          页面卸载阶段不能用 axios 实例；自身已 `.catch(() => {})` 兜底，失败不留未处理 rejection）；
//       ② `client/src/composables/question/useExamImport.js` —— 试卷解析的 **SSE 流式**请求（fetch + ReadableStream，
//          需要逐段读响应体；自身已 try/catch 且失败落到 uploadError，不冒泡到错误边界）。
//       若将来要统一，请迁移为 request 实例上的 stream/keepalive 封装，而不是把这两处从门禁里"删掉了事"。
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** 把注释与字符串替换成等长空白（保留行号/列位），使扫描是"语法级"的而不是"文本级"的 */
function maskCode(src) {
  const text = String(src || '');
  const arr = text.split('');
  const blank = (from, to) => { for (let k = from; k < to && k < arr.length; k += 1) { if (arr[k] !== '\n') arr[k] = ' '; } };
  let i = 0; const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { const s = i; while (i < n && text[i] !== '\n') i += 1; blank(s, i); continue; }
    if (c === '/' && text[i + 1] === '*') { const s = i; i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i += 1; i += 2; blank(s, Math.min(i, n)); continue; }
    if (c === "'" || c === '"' || c === String.fromCharCode(96)) {
      const s = i; const q = c; i += 1;
      while (i < n) { if (text[i] === '\\') { i += 2; continue; } if (text[i] === q) { i += 1; break; } i += 1; }
      blank(s, Math.min(i, n)); continue;
    }
    i += 1;
  }
  return arr.join('');
}

/** 该 { 对应的块后面是否跟 catch（⇒ 这个 try 能吸收错误） */
function blockHasCatch(code, open) {
  let depth = 0;
  for (let k = open; k < code.length; k += 1) {
    if (code[k] === '{') depth += 1;
    else if (code[k] === '}') { depth -= 1; if (depth === 0) return /^\s*catch\b/.test(code.slice(k + 1, k + 30)); }
  }
  return false;
}

/** 命中点外围的调用名（识别 safeLoad/safeSubmit(...) 实参）：由内向外逐层取 callee */
function enclosingCallees(code, idx, limit) {
  const out = [];
  let depth = 0;
  let k = idx - 1;
  const max = limit || 8;
  while (k >= 0 && out.length < max) {
    const c = code[k];
    if (c === ')') depth += 1;
    else if (c === '(') {
      if (depth === 0) {
        const m = /([A-Za-z_$][\w$]*)\s*$/.exec(code.slice(Math.max(0, k - 60), k));
        out.push(m ? m[1] : '?');
      } else depth -= 1;
    }
    k -= 1;
  }
  return out;
}

// api 封装函数清单（从 client/src/api/*.js 的 export 自动收集；request.js 只导出实例，跳过）
const API_WRAPPER_NAMES = (() => {
  const dir = path.join(CLIENT, 'src', 'api');
  const names = [];
  if (!fs.existsSync(dir)) return names;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js') || f === 'request.js') continue;
    const t = read(path.join(dir, f)) || '';
    for (const m of t.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.push(m[1]);
    for (const m of t.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g)) names.push(m[1]);
  }
  return [...new Set(names)];
})();

/**
 * 扫描一个文件：返回 { total, safe, guarded, exempt, naked[] }；naked[] 每项 = { line, text }（可直接打印定位）
 */
function scanUnguardedRequests(relPath, source) {
  const rel = String(relPath || '').split(path.sep).join('/');
  const isApiLayer = rel.indexOf('src/api/') === 0;      // 端点定义层：① 豁免（其调用方由 ② 覆盖）
  const raw = String(source || '');
  const code = maskCode(raw);
  const rawLines = raw.split(/\r?\n/);
  const hitRe = new RegExp(
    'await\\s+request\\s*\\.\\s*(get|post|put|delete|patch)'
    + '|request\\s*\\.\\s*(get|post|put|delete|patch)\\s*\\('
    + (API_WRAPPER_NAMES.length ? '|await\\s+(?:' + API_WRAPPER_NAMES.join('|') + ')\\s*\\(' : ''),
    'g',
  );
  const out = { total: 0, safe: 0, guarded: 0, exempt: 0, naked: [] };
  const stack = [];
  let next = hitRe.exec(code);
  let i = 0;
  while (i < code.length && next) {
    if (next.index === i) {
      out.total += 1;
      const lineNo = code.slice(0, i).split('\n').length;
      const text = (rawLines[lineNo - 1] || '').trim().slice(0, 120);
      const callees = enclosingCallees(code, i);
      const inGuardedTry = stack.some((s) => s.kind === 'try' && s.catchOk === true);
      if (callees.some((c) => /^safe[A-Z]/.test(c))) out.safe += 1;
      else if (inGuardedTry) out.guarded += 1;
      else if (isApiLayer) out.exempt += 1;
      else out.naked.push({ line: lineNo, text });
      i += next[0].length;
      next = hitRe.exec(code);
      continue;
    }
    const c = code[i];
    if (c === '{') {
      const isTry = /(?:^|[^\w$.])try\s*$/.test(code.slice(Math.max(0, i - 12), i));
      stack.push(isTry ? { kind: 'try', catchOk: blockHasCatch(code, i) } : { kind: 'block' });
    } else if (c === '}') stack.pop();
    i += 1;
  }
  return out;
}

// ── ⑮a 门禁自检样例（恒真校验：反例必红、正例必绿）──────────────────────────────────────────────
const FIX_BAD_PLAIN = ['async function fetch() {', "  const r = await request.get('/admin/teachers');", '  list.value = r.data;', '}'].join('\n');
const FIX_BAD_FINALLY = ['async function f() {', '  try {', "    await request.get('/x');", '  } finally {', '    loading.value = false;', '  }', '}'].join('\n');
const FIX_WRAPPER = API_WRAPPER_NAMES[0] || 'uploadPackage';
const FIX_BAD_WRAPPER = ['async function g() {', '  const r = await ' + FIX_WRAPPER + '(1);', '  return r;', '}'].join('\n');
const FIX_OK_CATCH = ['async function ok() {', '  try {', "    const r = await request.get('/x');", '    return r;', '  } catch (e) {', "    message.error('失败');", '  }', '}'].join('\n');
const FIX_OK_SAFELOAD = ["const r = await safeLoad(() => request.get('/x'));"];
const FIX_OK_SAFESUBMIT = ['const r = await safeSubmit(', "  () => request.post('/x', { a: 1 }),", "  { action: '保存' },", ');'];
const FIX_OK_API_LAYER = ['export function getX() {', "  return request.get('/x');", '}'].join('\n');
const selfBadPlain = scanUnguardedRequests('src/views/__fixture_bad__.vue', FIX_BAD_PLAIN);
const selfBadFinally = scanUnguardedRequests('src/views/__fixture_bad__.vue', FIX_BAD_FINALLY);
const selfBadWrapper = scanUnguardedRequests('src/views/__fixture_bad__.vue', FIX_BAD_WRAPPER);
const selfOkCatch = scanUnguardedRequests('src/views/__fixture_ok__.vue', FIX_OK_CATCH);
const selfOkSafeLoad = scanUnguardedRequests('src/views/__fixture_ok__.vue', FIX_OK_SAFELOAD);
const selfOkSafeSubmit = scanUnguardedRequests('src/views/__fixture_ok__.vue', FIX_OK_SAFESUBMIT);
const selfOkApiLayer = scanUnguardedRequests('src/api/__fixture__.js', FIX_OK_API_LAYER);
check('⑮a 门禁自检：反例必红（裸 await / 仅 try-finally / 裸的 api 封装调用）+ 正例必绿（try-catch / safeLoad / safeSubmit / api 层豁免）',
  selfBadPlain.naked.length === 1 && selfBadFinally.naked.length === 1 && selfBadWrapper.naked.length === 1
    && selfOkCatch.naked.length === 0 && selfOkSafeLoad.naked.length === 0 && selfOkSafeSubmit.naked.length === 0
    && selfOkApiLayer.naked.length === 0 && selfOkApiLayer.exempt === 1,
  JSON.stringify({
    badPlain: selfBadPlain.naked.length, badFinally: selfBadFinally.naked.length, badWrapper: selfBadWrapper.naked.length,
    okCatch: selfOkCatch.naked.length, okSafeLoad: selfOkSafeLoad.naked.length, okSafeSubmit: selfOkSafeSubmit.naked.length,
    apiLayerNaked: selfOkApiLayer.naked.length, apiLayerExempt: selfOkApiLayer.exempt, wrapperProbe: FIX_WRAPPER,
  }));

// ── ⑮b 真实仓库：未就地处理的请求调用必须为 0 ───────────────────────────────────────────────────
const unguarded = [];
const scanTally = { total: 0, safe: 0, guarded: 0, exempt: 0 };
for (const p of allCode) {
  const rel = path.relative(CLIENT, p).split(path.sep).join('/');
  const res = scanUnguardedRequests(rel, read(p) || '');
  scanTally.total += res.total;
  scanTally.safe += res.safe;
  scanTally.guarded += res.guarded;
  scanTally.exempt += res.exempt;
  for (const n of res.naked) unguarded.push(rel + ':' + n.line + '  ' + n.text);
}
check('⑮b 全仓（client/src：视图 / 组合式函数 / 组件）不存在未被就地处理的请求调用（带 catch 的 try 或 safeLoad/safeSubmit）',
  unguarded.length === 0,
  'naked=' + (unguarded.length ? unguarded.join(' | ') : '(none)')
    + ' 命中总计=' + scanTally.total + '（safe*=' + scanTally.safe + ' try/catch=' + scanTally.guarded + ' api端点定义层豁免=' + scanTally.exempt + '）扫描文件=' + allCode.length);

// ── ⑮c 可执行：拦截器规范化 + safe* 约定（假响应对象，不发真实网络）────────────────────────────────
const apiErrMod = await import(path.join(CLIENT, 'src', 'api', 'apiError.js'));
const reqMod = await import(path.join(CLIENT, 'src', 'api', 'request.js'));
const safeMod = await import(path.join(CLIENT, 'src', 'composables', 'useSafeRequest.js'));
const respHandlers = reqMod.default.interceptors.response.handlers[0];
const onFulfilled = respHandlers.fulfilled;
const onRejected = respHandlers.rejected;
// 全局提示器换成可计数桩件（node 无 document，antd message 会异步抛错；见 request.js setErrorNotifier 注释）
const toasts = [];
reqMod.setErrorNotifier((text) => toasts.push(String(text)));
const fake400 = { response: { status: 400, data: { code: 1004, message: '题目不存在或无权访问' } }, config: { url: '/teacher/questions/9' } };
const fake404 = { response: { status: 404, data: {} }, config: { url: '/teacher/teams/7' } };
const fake403 = { response: { status: 403, data: null }, config: { url: '/admin/teachers' } };
const fakeNet = { message: 'Network Error', config: { url: '/admin/teachers' } };
const fake500 = { response: { status: 500, data: '<html>500</html>' }, config: { url: '/admin/teachers' } };
const catchOf = async (p) => { try { await p; return null; } catch (e) { return e; } };
const e400 = await catchOf(onRejected(fake400));
const e404 = await catchOf(onRejected(fake404));
const e403 = await catchOf(onRejected(fake403));
const eNet = await catchOf(onRejected(fakeNet));
const e500 = await catchOf(onRejected(fake500));
const envelopeRejected = await catchOf(onFulfilled({ status: 200, data: { code: 1007, message: '以下题目未上传标准工程包', data: { requiresConfirmation: true } }, config: { url: '/teacher/assignments' } }));
check('⑮c 可执行：任何失败都被规范化成 ApiError{status,code,message,url}（400+业务码 / 404 / 403 / 网络 / 500+HTML / 业务码≠0 信封）且保留 response/cause',
  !!e400 && e400.isApiError === true && e400.status === 400 && e400.code === 1004 && e400.message === '题目不存在或无权访问' && e400.url === '/teacher/questions/9'
    && !!e400.response && !!e400.cause
    && !!e404 && e404.status === 404 && e404.message === '请求的内容不存在或已被删除' && e404.uiSafe === true
    && !!e403 && e403.status === 403 && e403.message === '没有权限执行该操作'
    && !!eNet && eNet.status === 0 && eNet.message === '网络异常，请检查网络后重试' && eNet.uiSafe === true
    && apiErrMod.normalizeApiError(new TypeError('boom')).uiSafe === false
    && apiErrMod.normalizeApiError(new TypeError('boom')).message === '请求失败，请重试'
    && !!e500 && e500.status === 500 && e500.message === '服务出错了，请稍后重试' && !String(e500.message).includes('html')
    && !!envelopeRejected && envelopeRejected.isApiError === true && envelopeRejected.code === 1007
    && envelopeRejected.response.data.code === 1007 && envelopeRejected.response.data.data.requiresConfirmation === true
    && apiErrMod.normalizeApiError(e404) === e404,
  JSON.stringify({
    e400: e400 && e400.toString(), e404: e404 && e404.toString(), e403: e403 && e403.toString(),
    net: eNet && eNet.toString(), e500: e500 && e500.toString(), envelope: envelopeRejected && envelopeRejected.toString(),
  }));
check('⑮c2 可执行：拦截器提示次数正确且 1007 软警告（HTTP 400 + requiresConfirmation）**不弹报错**（确认框分支不被破坏）',
  toasts.length === 5 && !toasts.some((t) => t.includes('未上传标准工程包')),
  JSON.stringify({ toasts }));
const softWarn = await catchOf(onRejected({ response: { status: 400, data: { code: 1007, message: '以下题目未上传标准工程包', data: { requiresConfirmation: true } } }, config: { url: '/teacher/assignments' } }));
const softWarnOk = !!softWarn && softWarn.code === 1007 && toasts.length === 5;
check('⑮c3 可执行：1007 软警告（HTTP 400）reject 后提示数不增（由页面确认框承接，不误导为"报错"）',
  softWarnOk && softWarn.response.data.code === 1007 && softWarn.response.data.data.requiresConfirmation === true,
  JSON.stringify({ toasts: toasts.length, code: softWarn && softWarn.code }));
// ── ⑮c4 控制流码回放（★W1-r2 / t4）：**HTTP 2xx + code ∈ 控制流集合 + 载荷齐备 ⇒ RESOLVED；401/404/429 同码仍 REJECTED**
//   背景（真实回归）：t1 把"200 + code≠0 一律 reject"写死 ⇒ Login.vue 的 if (res.code === 1002) 不可达 ⇒ 多学校学生无法登录。
//   同一个 code 1002 在本仓有四种语义（200 选校 / 401 未登录 / 404 记录不存在 / 429 改密锁定），故判据必须绑 HTTP 状态。
const settle = async (p) => { try { return { resolved: true, value: await p }; } catch (e) { return { resolved: false, error: e }; } };
const LOGIN_1002_ENVELOPE = {
  status: 200,
  data: { code: 1002, message: '该学号存在多个学校，请选择所在学校', data: { schools: [{ name: '示例大学', officialCode: 'A001' }, { name: '第二大学', officialCode: 'B002' }] } },
  config: { url: '/auth/login' },
};
const toastsBeforeCf = toasts.length;
const cf200 = await settle(onFulfilled(LOGIN_1002_ENVELOPE));                               // 200 + 1002 + schools ⇒ 必须 resolve
const cf200ToastDelta = toasts.length - toastsBeforeCf;
const cf200NoPayload = await settle(onFulfilled({ status: 200, data: { code: 1002, message: '该学号存在多个学校，请选择所在学校', data: { schools: [] } }, config: { url: '/auth/login' } }));
const cf401Redirects = [];
const toastsBefore401 = toasts.length;
reqMod.setAuthRedirect(() => cf401Redirects.push(1));
reqMod.resetAuthExpired();
const cf401 = await settle(onRejected({ response: { status: 401, data: { code: 1002, message: '未登录或 Token 过期' } }, config: { url: '/teacher/classes' } }));
const cf401Toasts = toasts.slice(toastsBefore401);   // ★立刻取快照：后面 404/429 的提示也会进同一个 toasts
const cf404 = await settle(onRejected({ response: { status: 404, data: { code: 1002, message: '运行记录不存在：归档目录与数据库行都不存在' } }, config: { url: '/admin/grading-runs/x' } }));
const cf429 = await settle(onRejected({ response: { status: 429, data: { code: 1002, message: '原密码错误次数过多，请 5 分钟后再试' } }, config: { url: '/auth/password' } }));
check('⑮c4 可执行：控制流码判据 = HTTP 2xx + code + 载荷齐备 ⇒ RESOLVED 且零提示；401/404/429 + 同码 ⇒ 仍 REJECTED（401 走鉴权出口）；载荷不齐（schools 空）⇒ 不算控制流',
  cf200.resolved === true && !!cf200.value && cf200.value.code === 1002 && Array.isArray(cf200.value.data.schools) && cf200.value.data.schools.length === 2
    && cf200ToastDelta === 0
    && cf200NoPayload.resolved === false && cf200NoPayload.error.status === 200 && cf200NoPayload.error.code === 1002
    && cf401.resolved === false && cf401.error.status === 401 && cf401Redirects.length === 1
    && cf401Toasts.join('|') === '登录已过期，请重新登录'   // 401 的用户可见文案统一（★W4：ApiError.message 也已统一，原文只在 response/cause —— 见 ⑮d）
    && cf404.resolved === false && cf404.error.status === 404 && cf404.error.code === 1002 && cf404.error.message === '运行记录不存在：归档目录与数据库行都不存在'
    && cf429.resolved === false && cf429.error.status === 429 && cf429.error.code === 1002,
  JSON.stringify({
    cf200: cf200.resolved ? { code: cf200.value.code, schools: cf200.value.data.schools.length } : cf200.error.toString(),
    cf200ToastDelta,
    cf200NoPayload: cf200NoPayload.resolved ? 'RESOLVED(✗应为失败)' : cf200NoPayload.error.toString(),
    cf401: cf401.resolved ? 'RESOLVED(✗)' : cf401.error.toString(), cf401Redirects: cf401Redirects.length, cf401Toast: cf401Toasts,
    cf404: cf404.resolved ? 'RESOLVED(✗)' : cf404.error.toString(),
    cf429: cf429.resolved ? 'RESOLVED(✗)' : cf429.error.toString(),
  }));

// ── ⑮c5 A/B 自证（新旧实现回放**同一份**登录响应）──────────────────────────────────────────────────
//   legacyHead = t1 之前的实现：业务码 ≠ 0 ⇒ 提示后**仍 resolve**（分支可达，但会误弹一次提示）
//   legacyT1   = t1 之后的实现（本次修复前）：信封**一律 reject** ⇒ Login 的 1002 分支**不可达**（多学校登录失败的根因）
//   current    = 本次修复：2xx + 控制流码 + 载荷齐备 ⇒ resolve 且不提示
const legacyHeadReplay = async (res) => {           // 逐字等价于 HEAD 版 request.js 的成功分支
  const body = res.data;
  if (body.code !== 0) toasts.push(body.message || '请求失败');   // 旧实现：toast 后照旧返回
  return body;
};
const legacyT1Replay = async (res) => {             // 逐字等价于 t1 版 request.js 的成功分支（信封一律 reject）
  throw apiErrMod.apiErrorFromEnvelope(res, res.config);
};
const loginBranchReachable = (outcome) => outcome.resolved === true && !!outcome.value && outcome.value.code === 1002
  && Array.isArray(outcome.value.data && outcome.value.data.schools) && outcome.value.data.schools.length > 0;
const toastMark = toasts.length;
const abHead = await settle(legacyHeadReplay(LOGIN_1002_ENVELOPE));
const headToasts = toasts.length - toastMark;
const abT1 = await settle(legacyT1Replay(LOGIN_1002_ENVELOPE));
const abCurrent = await settle(onFulfilled(LOGIN_1002_ENVELOPE));
const currentToasts = toasts.length - toastMark - headToasts;
check('⑮c5 A/B 自证（同一份登录响应回放）：HEAD 版=分支可达但误提示一次；t1 版=分支**不可达**（回归根因）；本次修复=分支可达且零提示',
  loginBranchReachable(abHead) === true && headToasts === 1
    && loginBranchReachable(abT1) === false && abT1.error.isApiError === true && abT1.error.code === 1002
    && loginBranchReachable(abCurrent) === true && currentToasts === 0,
  JSON.stringify({
    head: { reachable: loginBranchReachable(abHead), toasts: headToasts },
    t1: { reachable: loginBranchReachable(abT1), err: abT1.resolved ? 'RESOLVED(✗)' : abT1.error.toString() },
    current: { reachable: loginBranchReachable(abCurrent), toasts: currentToasts },
  }));
// ── ⑮d 401 统一语义（★W4/t6 改为**真实形态回放**）──────────────────────────────────────────────────
//   F6（W3b 复审）：旧 ⑮d 用空 message 假响应，掩盖了"401 的 ApiError.message 仍是服务端原文"这一事实。
//   现在回放 middleware/auth.js 的**三种真实 401 文案**，并对每条断言：
//     · reject + status 401 + 保留原文（response.data.message 与 cause）；
//     · **用户可见文案三者恒等**且等于 AUTH_EXPIRED_MESSAGE（ApiError.message 与 errorCopyOf 出口两条都查）；
//     · 原文只进 console（errorCopyOf 的 log.error 收到含该错误的载荷），绝不出现在可见文案里；
//     · 401 既有语义不变：仍走 handleAuthExpired（清态 + 跳登录），且并发多个 401 **只处置一次**。
const REAL_401_SHAPES = [
  { url: '/teacher/classes', raw: '未登录或 Token 过期', from: 'middleware/auth.js:10,37' },
  { url: '/teacher/students', raw: '用户不存在', from: 'middleware/auth.js:18' },
  { url: '/student/assignments', raw: '登录状态已失效（密码已变更），请重新登录', from: 'middleware/auth.js:31' },
];
const redirects = [];
const toastsBefore401Real = toasts.length;
reqMod.setAuthRedirect(() => redirects.push(1));
reqMod.resetAuthExpired();
const rows401 = [];
for (const shape of REAL_401_SHAPES) {
  const seen = [];
  const err = await catchOf(onRejected({ response: { status: 401, data: { code: 1002, message: shape.raw, data: null } }, config: { url: shape.url } }));
  const uiCopy = err ? copyMod.errorCopyOf(err, { tag: 'verify ⑮d ' + shape.url, log: { error: (...a) => seen.push(a) } }) : '(未 reject)';
  rows401.push({
    url: shape.url, from: shape.from,
    status: err && err.status, code: err && err.code,
    apiMessage: err && err.message,
    rawKept: !!(err && err.response && err.response.data && err.response.data.message === shape.raw),
    causeKept: !!(err && err.cause),
    uiCopy,
    consoleHasErr: seen.length === 1 && !!seen[0][1] && seen[0][1].err === err,
    rawOnScreen: String(uiCopy).includes(shape.raw),
  });
}
const toasts401 = toasts.slice(toastsBefore401Real);
const visibleCopies = rows401.map((r) => r.apiMessage);
const uiCopies = rows401.map((r) => r.uiCopy);
check('⑮d 可执行：401 用户可见文案**恒为统一口径**（三种真实服务端原文下一致：ApiError.message 与 errorCopyOf 出口两条都查）；原文只留在 response/cause 并进 console；仍走 handleAuthExpired 且并发只处置一次',
  rows401.length === 3
    && rows401.every((r) => r.status === 401 && r.code === 1002)
    && new Set(visibleCopies).size === 1 && visibleCopies.every((t) => t === '登录已过期，请重新登录')
    && uiCopies.every((t) => t === '登录已过期，请重新登录')
    && rows401.every((r) => r.rawKept && r.causeKept && r.consoleHasErr && r.rawOnScreen === false)
    && toasts401.length === 1 && toasts401[0] === '登录已过期，请重新登录'
    && redirects.length === 1,
  JSON.stringify({ rows: rows401, toasts: toasts401, redirects: redirects.length, distinctVisible: new Set(visibleCopies).size }));
// safeLoad / safeSubmit：失败**不抛**、文案走 errorCopyOf 口径、同一次失败不重复提示
const notices = [];
const errLogs = [];
const runner = safeMod.createSafeRunner({ tag: 'verify ⑮', action: '加载', notify: (t) => notices.push(String(t)), log: { error: () => errLogs.push(1) } });
// ★关键：复用**同一个** ApiError 实例（拦截器已提示并登记）⇒ safe* 必须保持沉默（一次失败只提示一次）
const rFailIntercepted = await runner.safeLoad(() => Promise.reject(e400));
const rFailRaw = await runner.safeSubmit(() => { throw new TypeError('boom'); });
const rOk = await runner.safeLoad(() => Promise.resolve({ code: 0, data: { list: [1, 2] }, message: 'ok' }));
const stillNeedsNotice = apiErrMod.shouldNotify(rFailIntercepted.error);
const quietRunner = safeMod.createSafeRunner({ tag: 'verify ⑮', action: '加载', notify: () => {}, log: { error: () => {} } });
const rCurated = await quietRunner.safeLoad(() => onRejected(fake403));
check('⑮e 可执行：safeLoad/safeSubmit 失败**不抛**且返回 {ok,data,error,loading,message}；提示不重复；成功按约定解包 data',
  rFailIntercepted.ok === false && rFailIntercepted.error === e400 && rFailIntercepted.loading === false
    && rFailIntercepted.data === null && rFailIntercepted.message === '题目不存在或无权访问'
    && rFailIntercepted.error.status === 400 && rFailIntercepted.error.url === '/teacher/questions/9'
    && rFailRaw.ok === false && rFailRaw.error.isApiError === true && rFailRaw.error.status === 0 && rFailRaw.message === '加载失败，请重试'
    && rOk.ok === true && Array.isArray(rOk.data.list) && rOk.data.list.length === 2 && rOk.error === null && rOk.message === ''
    && rCurated.ok === false && rCurated.message === '没有权限执行该操作'
    && notices.length === 1 && errLogs.length === 2 && stillNeedsNotice === false,
  JSON.stringify({ failIntercepted: { ok: rFailIntercepted.ok, msg: rFailIntercepted.message, status: rFailIntercepted.error && rFailIntercepted.error.status }, failRaw: { ok: rFailRaw.ok, msg: rFailRaw.message, status: rFailRaw.error && rFailRaw.error.status, uiSafe: rFailRaw.error && rFailRaw.error.uiSafe }, ok: { ok: rOk.ok, data: rOk.data }, curated: rCurated.message, notices, errLogs: errLogs.length }));
// useSafeRequest：ref 形态（loading 必复位、error 落库、data 解包）
const sr = safeMod.useSafeRequest({ tag: 'verify ⑮', notify: () => {}, log: { error: () => {} } });
const srFail = await sr.safeLoad(() => onRejected(fake500));
const srFailSnap = { ok: srFail.ok, status: sr.error.value && sr.error.value.status, loading: sr.loading.value, msg: sr.message.value, data: sr.data.value };
const srOk = await sr.safeLoad(() => Promise.resolve({ code: 0, data: 7 }));
check('⑮f 可执行：useSafeRequest 的 data/error/loading/message 四要素 ref 全部按约定落位（失败路径 loading 必复位）',
  srFailSnap.ok === false && srFailSnap.status === 500 && srFailSnap.loading === false && srFailSnap.msg === '服务出错了，请稍后重试'
    && srFailSnap.data === null && srOk.ok === true && sr.data.value === 7 && sr.error.value === null && sr.message.value === '',
  JSON.stringify({ failSnap: srFailSnap, ok: { ok: srOk.ok, data: sr.data.value, error: sr.error.value, msg: sr.message.value } }));
// 错误边界：可复制的字符串堆栈（路由 + 组件名 + 错误消息 + 堆栈）
const ebErr = new TypeError("Cannot read properties of null (reading 'x')");
const ebOpts = { route: '/admin/teachers', component: 'Teachers.vue', info: 'onErrorCaptured', at: '2026-01-01T00:00:00.000Z' };
const ebDiag = recovery.diagnosticTextOf(ebErr, ebOpts);
const ebState = recovery.boundaryState(ebErr, '/admin/teachers', ebOpts);
const ebSrc = read(path.join(CLIENT, 'src', 'components', 'ErrorBoundary.vue')) || '';
check('⑮g 错误边界可诊断：诊断串含 路由/组件/错误消息/堆栈（可直接复制），错误页提供 复制诊断信息 + 返回上一页 + 回首页',
  ebDiag.includes('路由：/admin/teachers') && ebDiag.includes('组件：Teachers.vue')
    && ebDiag.includes('onErrorCaptured') && ebDiag.includes('Cannot read properties of null')
    && ebDiag.includes(recovery.DIAG_BEGIN) && ebDiag.includes(recovery.DIAG_END) && ebDiag.split('\n').length >= 9
    && ebState.diagnostics === ebDiag && ebState.component === 'Teachers.vue' && ebState.failed === true
    && /复制诊断信息/.test(ebSrc) && /返回上一页/.test(ebSrc) && /回首页/.test(ebSrc) && /navigator\.clipboard/.test(ebSrc)
    && /diagnostics/.test(ebSrc),
  JSON.stringify({ lines: ebDiag.split('\n').length, component: ebState.component, hasCopy: /复制诊断信息/.test(ebSrc), hasBack: /返回上一页/.test(ebSrc), hasHome: /回首页/.test(ebSrc) }));

/** ⑮i 辅助：三次调用共两次失败 ⇒ 提示文案固定且去重（notices 里同一条只出现一次） */
const mgShows = (notices) => notices.length >= 1 && notices.every((t) => t === '代码编辑器加载失败，本页其余内容仍可查看；刷新页面可重试')
  && new Set(notices).size === 1;

// ── ⑮h 故障③（W3 回归）回归锚点：**真实回放** Login.vue 的 1002 分支（与故障①②同级）──────────────────
//   "真实回放"= 抽取 Login.vue 里 handleLogin 的**真实函数体**执行，喂给它的 post 结果是**真拦截器**算出来的
//   （⑮c4 的 cf200.value），不是手写桩；再对同一份响应喂"t1 行为（reject）"做对照 ⇒ 证明回归在 UI 层的表现。
const loginSrc = read(path.join(CLIENT, 'src', 'views', 'Login.vue')) || '';
const loginBody = extractFn(loginSrc, 'async function handleLogin');
const replayLogin = async (postImpl) => {
  const calls = { setAuth: [], push: [] };
  const refs = { username: { value: 'S001' }, password: { value: 'pw' }, errorMsg: { value: '' }, loading: { value: false }, schoolOptions: { value: [] }, selectedCode: { value: '' } };
  const stub = new Function(
    'username', 'password', 'errorMsg', 'nextTick', 'usernameInputRef', 'passwordInputRef', 'loading', 'request', 'schoolOptions', 'selectedCode', 'userStore', 'router',
    'return (async () => {' + loginBody + '})();',
  );
  await stub(refs.username, refs.password, refs.errorMsg, () => Promise.resolve(), { value: null }, { value: null }, refs.loading,
    { post: postImpl }, refs.schoolOptions, refs.selectedCode,
    { setAuth: (...a) => calls.setAuth.push(a) }, { push: (...a) => calls.push.push(a) });
  return { calls, refs };
};
const loginReplayOk = await replayLogin(() => Promise.resolve(cf200.value));
const loginReplayRegressed = await replayLogin(() => Promise.reject(abT1.error));
check('⑮h 故障③（W3 回归）回归锚点：真实回放 Login.vue 的 handleLogin —— 控制流信封 ⇒ 走到选校（schools 就位、未直接登录/跳转、无报错）；t1 行为（reject）⇒ 停在登录页报错（选校页不可达）',
  !!loginBody
    && loginReplayOk.refs.schoolOptions.value.length === 2 && loginReplayOk.refs.selectedCode.value === 'A001'
    && loginReplayOk.calls.setAuth.length === 0 && loginReplayOk.calls.push.length === 0 && loginReplayOk.refs.errorMsg.value === ''
    && loginReplayRegressed.refs.schoolOptions.value.length === 0 && loginReplayRegressed.calls.push.length === 0
    && loginReplayRegressed.refs.errorMsg.value === '该学号存在多个学校，请选择所在学校',
  JSON.stringify({
    ok: { schools: loginReplayOk.refs.schoolOptions.value.length, code: loginReplayOk.refs.selectedCode.value, setAuth: loginReplayOk.calls.setAuth.length, push: loginReplayOk.calls.push.length, err: loginReplayOk.refs.errorMsg.value },
    regressed: { schools: loginReplayRegressed.refs.schoolOptions.value.length, err: loginReplayRegressed.refs.errorMsg.value },
  }));

// ── ⑮i Monaco 初始化兜底（★W1-r2）：全仓不得再有裸 await initMonaco()；safeInitMonaco 三态可执行 ──────
const monacoGuard = await import(path.join(CLIENT, 'src', 'composables', 'monacoGuard.js'));
const unguardedMonaco = [];
for (const p of allCode) {
  const rel = path.relative(CLIENT, p).split(path.sep).join('/');
  // 剥注释后再扫：文档注释里提到写法（如 monacoGuard.js 的说明）不算违规
  const codeOnly = String(read(p) || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (/await\s+initMonaco\s*\(/.test(codeOnly)) unguardedMonaco.push(rel);
}
const mgNotices = [];
const mgLogs = [];
const mgOpts = { tag: 'verify ⑮i', notify: (t) => mgNotices.push(String(t)), log: { error: () => mgLogs.push(1) } };
monacoGuard.resetMonacoNotice();
const mgOk = await monacoGuard.safeInitMonaco(() => Promise.resolve(), mgOpts);
const mgFail1 = await monacoGuard.safeInitMonaco(() => { throw new Error('loader init failed'); }, mgOpts);
const mgFail2 = await monacoGuard.safeInitMonaco(() => Promise.reject(new Error('monaco/vs 404')), mgOpts);
const mgShownAfterTwo = monacoGuard.isMonacoNoticeShown();
monacoGuard.resetMonacoNotice();
const mgFail3 = await monacoGuard.safeInitMonaco(() => { throw new Error('again'); }, mgOpts);
check('⑮i Monaco 兜底：全仓 0 处裸 await initMonaco()；safeInitMonaco 成功=true / 失败**不抛**且一次故障只提示一次（复位后可再提示）',
  unguardedMonaco.length === 0 && mgOk === true && mgFail1 === false && mgFail2 === false && mgFail3 === false
    && mgShows(mgNotices) && mgLogs.length === 3 && mgShownAfterTwo === true,
  'unguarded=' + (unguardedMonaco.join(',') || '(none)') + ' :: ' + JSON.stringify({ ok: mgOk, fail: [mgFail1, mgFail2, mgFail3], notices: mgNotices, logs: mgLogs.length, shownAfterTwo: mgShownAfterTwo }));

// ── ⑮j 口径例外登记（★W1-r2）：不经 axios 实例的两处请求必须显式登记，避免后人误以为"全仓请求都已规范化" ──
const selfSrc = read(path.join(CLIENT, 'scripts', 'verify-frontend.mjs')) || '';
const draftSaveSrc = read(path.join(CLIENT, 'src', 'composables', 'submit', 'useDraftSave.js')) || '';
const examImportSrc = read(path.join(CLIENT, 'src', 'composables', 'question', 'useExamImport.js')) || '';
check('⑮j 口径例外已登记：⑮ 注释显式列出「keepalive 落盘（useDraftSave.js）」与「SSE 流式解析（useExamImport.js）」，且两处自身都有兜底（不冒泡、不把失败当成功）',
  /口径例外/.test(selfSrc) && /useDraftSave\.js/.test(selfSrc) && /useExamImport\.js/.test(selfSrc)
    && /keepalive/.test(selfSrc) && /SSE/.test(selfSrc)
    && /keepalive: true/.test(draftSaveSrc) && /window\.fetch\(/.test(draftSaveSrc) && /catch\(\(\) => \{\}\)/.test(draftSaveSrc)
    && /parse-exam-stream/.test(examImportSrc) && /resp\.ok/.test(examImportSrc) && /uploadError\.value/.test(examImportSrc),
  JSON.stringify({ selfDoc: [/口径例外/, /useDraftSave\.js/, /useExamImport\.js/, /keepalive/, /SSE/].map((r) => r.test(selfSrc)), keepaliveGuard: /catch\(\(\) => \{\}\)/.test(draftSaveSrc), streamGuard: /uploadError\.value/.test(examImportSrc) }));

// ── ⑮k 5xx 文案口径（★W1-r2）：服务端 5xx 原文一律不上屏（客户端兜底）+ 服务端 500 固定文案（含后续项登记）──
const copy5xx = copyMod.errorCopyOf(apiErrMod.normalizeApiError({ response: { status: 500, data: { code: 2001, message: '服务器错误: xxx is not a function' } }, config: { url: '/x' } }), { tag: 'verify ⑮k', log: { error: () => {} } });
const copy4xx = copyMod.errorCopyOf(apiErrMod.normalizeApiError({ response: { status: 400, data: { code: 1001, message: '用户名或密码错误' } }, config: { url: '/auth/login' } }), { tag: 'verify ⑮k', log: { error: () => {} } });
// 剥注释后再断言"代码里没有旧写法"（文件头注释逐字引用了旧写法，属说明而非违规）；"后续项登记"则断在原文上
const submissionCtrlRaw = read(path.join(CLIENT, '..', 'server', 'src', 'interface', 'http', 'controllers', 'student', 'submission.js')) || '';
const submissionCtrlSrc = String(submissionCtrlRaw)
  .replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('⑮k 5xx 文案：客户端 errorCopy 对 5xx 一律用 HTTP 口径（服务端原文不上屏）、4xx 业务文案照旧优先；server 500 用固定文案且原文只进日志（其余 6 处已登记为后续项）',
  copy5xx === '服务出错了，请稍后重试' && !copy5xx.includes('is not a function')
    && copy4xx === '用户名或密码错误'
    && /FALLBACK_500_MESSAGE/.test(submissionCtrlSrc) && !/服务器错误: ['"]? \+/.test(submissionCtrlSrc) && /后续项/.test(submissionCtrlRaw),
  JSON.stringify({ copy5xx, copy4xx, serverFixed: /FALLBACK_500_MESSAGE/.test(submissionCtrlSrc), serverRawGone: !/服务器错误: ['"]? \+/.test(submissionCtrlSrc) }));

// ── ⑮h 两处已复现故障的回归锚点（静态断言：热点页面必须保持"就地处理"的写法）─────────────────────
//   ① 管理员「新增教师」姓名留空 ⇒ POST 400 ⇒ handler 无 try/catch ⇒ 整页被错误边界替换、列表消失；
//   ② 打开非本人/不存在的题（404 + code 1004）⇒ useLoadQuestion 未处理 ⇒ 同样整页被替换。
const hotTeachers = read(path.join(CLIENT, 'src', 'views', 'admin', 'Teachers.vue')) || '';
const hotLoadQ = read(path.join(CLIENT, 'src', 'composables', 'question', 'useLoadQuestion.js')) || '';
check('⑮h 故障① 回归锚点：Teachers.vue 提交前字段级校验（formErrors/validateForm + 表单 validate-status）且提交走 safeSubmit + 失败即返回（列表不消失）',
  /formErrors/.test(hotTeachers) && /function validateForm\(/.test(hotTeachers) && /safeSubmit\(/.test(hotTeachers)
    && /if \(r\.error\) return;/.test(hotTeachers) && /:validate-status="formErrors\./.test(hotTeachers)
    && /useSafeRequest/.test(hotTeachers) && /safeLoad\(/.test(hotTeachers),
  JSON.stringify({ validateForm: /function validateForm\(/.test(hotTeachers), safeSubmit: /safeSubmit\(/.test(hotTeachers), fieldHint: /:validate-status="formErrors\./.test(hotTeachers) }));
check('⑮h 故障② 回归锚点：题目编辑链路（useLoadQuestion）失败只置 loadError 并返回（不再冒泡 ⇒ 页面不被替换）',
  /safeLoad\(/.test(hotLoadQ) && /loadError\.value\s*=\s*res\.error/.test(hotLoadQ) && /return;/.test(hotLoadQ) && /useSafeRequest/.test(hotLoadQ),
  JSON.stringify({ safeLoad: /safeLoad\(/.test(hotLoadQ), loadError: /loadError\.value\s*=\s*res\.error/.test(hotLoadQ) }));

const failed = results.filter((r) => !r.ok);
console.log('');
console.log('SUMMARY checks=' + results.length + ' failed=' + failed.length + (failed.length ? ' :: ' + failed.map((f) => f.name).join(' | ') : ''));
process.exit(failed.length ? 1 : 0);
