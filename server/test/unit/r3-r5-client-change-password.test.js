/**
 * R3-R5（P1）回归断言：桌面端必须消费 mustChangePassword 并统一拦截 1005
 *
 * 依据：reports/fix/round3/TICKETS/R3-R5.md §3 验收断言
 * 背景（HEAD c4e17f5）：后端 auth.js:62 对非学生 flag=true 返回 403/code 1005，
 *   但桌面端 request.js 响应拦截器无 1005 分支、Login.vue 两处登录成功分支直接 setAuth
 *   ⇒ 首登教师所有业务接口 403 + 通用报错，无强制改密引导（移动端已有正确范式）。
 *
 * client 无单测 runner（client/package.json 仅 dev/build/preview，禁止 npm install）
 * ⇒ 采用可归因的静态源码扫描（先例：test/integration/w72-...test.js:215-255 扫描 server/src）。
 * 只断言「必要分支/落点存在」，不锁定具体实现（新页或既有 Layout 弹窗均可）。
 * 本文件不 import prisma，可用 TEST-PLAN §6.2 无 DB 配置单独运行。
 */
import fs from 'node:fs';
import path from 'node:path';

const SERVER_ROOT = process.cwd();                       // cd server 后 npx jest
const CLIENT_SRC = path.resolve(SERVER_ROOT, '../client/src');
const SERVER_SRC = path.resolve(SERVER_ROOT, 'src');

const readClient = (rel) => fs.readFileSync(path.resolve(CLIENT_SRC, rel), 'utf8');
const readServer = (rel) => fs.readFileSync(path.resolve(SERVER_SRC, rel), 'utf8');

describe('R3-R5 · request.js 统一拦截 1005', () => {
  const requestSrc = readClient('api/request.js');

  it('响应拦截器含 1005 分支（修复前 grep 0 命中）', () => {
    expect(requestSrc).toMatch(/1005/);
  });

  it('1005 处置不得混同 401（静态：1005 出现在 401/登录失效处理之后，且不调用 clearAuth）', () => {
    const i1005 = requestSrc.indexOf('1005');
    const i401 = requestSrc.indexOf('handleAuthExpired');
    expect(i1005).toBeGreaterThan(-1);
    expect(i401).toBeGreaterThan(-1);
    expect(i1005).toBeGreaterThan(i401);
  });
});

describe('R3-R5 · Login.vue 消费 mustChangePassword（两个登录成功分支都要覆盖）', () => {
  const loginSrc = readClient('views/Login.vue');

  it('Login.vue 出现 mustChangePassword 判定（修复前 0 命中）', () => {
    expect(loginSrc).toMatch(/mustChangePassword/);
  });

  it('每个 setAuth 调用点上下文都受 flag 分支约束（防只改一处）', () => {
    const idxs = [...loginSrc.matchAll(/setAuth\s*\(/g)].map((m) => m.index);
    expect(idxs.length).toBeGreaterThan(0);
    for (const i of idxs) {
      const window = loginSrc.slice(Math.max(0, i - 1500), i + 400);
      expect(window).toMatch(/mustChangePassword/);
    }
  });

  it('存在改密落点：新改密页 / 路由 / Login 内跳转三者至少其一（票面 §2.2）', () => {
    const routerSrc = readClient('router/index.js');
    const hasRoute = /change-password|ChangePassword/.test(routerSrc);
    const hasPage =
      fs.existsSync(path.resolve(CLIENT_SRC, 'views/ChangePassword.vue')) ||
      fs.existsSync(path.resolve(CLIENT_SRC, 'views/ChangePassword/index.vue'));
    const hasLoginTarget = /change-password|ChangePassword/.test(loginSrc);
    expect(hasRoute || hasPage || hasLoginTarget).toBe(true);
  });
});

describe('R3-R5 · 回归：移动端与后端闸门不得被改动带入回归', () => {
  it('移动端 Login.vue 仍保留 mustChangePassword 先行拦截（防回退）', () => {
    const mobileSrc = readClient('mobile/views/public/Login.vue');
    expect(mobileSrc).toMatch(/mustChangePassword\s*===\s*true/);
    const iFlag = mobileSrc.indexOf('mustChangePassword === true');   // 函数体判定行（非文件头注释）
    const iSetAuth = mobileSrc.indexOf('userStore.setAuth(');
    expect(iFlag).toBeGreaterThan(-1);
    expect(iSetAuth).toBeGreaterThan(iFlag);   // flag 判定必须在写登录态之前
  });

  it('后端鉴权闸门 auth.js:62 判定口径不变（学生豁免 / 非学生 1005）', () => {
    const authSrc = readServer('middleware/auth.js');
    expect(authSrc).toMatch(/mustChangePassword\s*===\s*true/);
    expect(authSrc).toMatch(/isPasswordChangeAllowed/);
    expect(authSrc).toMatch(/role\s*!==\s*'student'/);
  });
});
