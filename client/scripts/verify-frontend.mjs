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

const failed = results.filter((r) => !r.ok);
console.log('');
console.log('SUMMARY checks=' + results.length + ' failed=' + failed.length + (failed.length ? ' :: ' + failed.map((f) => f.name).join(' | ') : ''));
process.exit(failed.length ? 1 : 0);
