/**
 * r3-batch2-static.test.js — batch2 静态/配置断言（C 写域）
 * 覆盖：M16（robots/sitemap）、NGX-HEADERS（安全头 include 单源）、NGX-HYGIENE（http2 语法）、
 *       R3-R5-F1（/exam/change-password SPA 路由）、OUT-3（日志不落模型输出片段）、R11（temp 归属凭据）、RATE 接线。
 */
import fs from 'node:fs';
import path from 'node:path';

const SERVER_ROOT = process.cwd();                    // cd server 后 npx jest
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
const read = (rel) => fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf8');
const readServer = (rel) => fs.readFileSync(path.resolve(SERVER_ROOT, rel), 'utf8');

describe('R3-M16 · robots.txt / sitemap.xml', () => {
  it('robots.txt 存在且仅放行公开页、屏蔽隐私/接口路径、带 Sitemap', () => {
    const robots = read('client/public/robots.txt');
    expect(robots).toMatch(/User-agent:\s*\*/);
    expect(robots).toMatch(/Disallow:\s*\/exam\/admin\//);
    expect(robots).toMatch(/Disallow:\s*\/exam\/api\//);
    expect(robots).toMatch(/Sitemap:\s*https:\/\/deadpan\.asia\/exam\/sitemap\.xml/);
  });
  it('sitemap.xml 存在且只列公开页（4 条）', () => {
    const xml = read('client/public/sitemap.xml');
    expect(xml).toContain('<urlset');
    expect((xml.match(/<loc>/g) || []).length).toBe(4);
    expect(xml).not.toContain('/exam/admin/');
  });
  it('nginx 显式 alias 到 dist 的 robots/sitemap（避免命中静态正则 404）', () => {
    const nginx = read('nginx-exam.conf');
    expect(nginx).toMatch(/location = \/exam\/robots\.txt\s*\{[^}]*client\/dist\/robots\.txt/);
    expect(nginx).toMatch(/location = \/exam\/sitemap\.xml\s*\{[^}]*client\/dist\/sitemap\.xml/);
  });
});

describe('R3-NGX-HEADERS · 安全头 include 单源（R10）', () => {
  it('security-headers.inc 含六条头且全部 always', () => {
    const inc = read('security-headers.inc');
    for (const name of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'X-Robots-Tag']) {
      // 注意：HSTS 值内含分号（includeSubDomains），故按「行内 always; 结尾」匹配而不是 [^;]*
      expect(new RegExp('add_header\\s+' + name + '[^\\n]*always;').test(inc)).toBe(true);
    }
  });
  it('nginx server 级 include 片段；文件内无 location 级 add_header 手抄', () => {
    const nginx = read('nginx-exam.conf');
    expect(nginx).toContain('include security-headers.inc;');
    expect(nginx).not.toMatch(/^\s*add_header\s/m);   // 六条头不得在 nginx-exam.conf 内手抄
  });
});

describe('R3-NGX-HYGIENE · http2 新语法（R27）', () => {
  it('使用 http2 on; 且不再出现已废弃的 listen ... http2', () => {
    const nginx = read('nginx-exam.conf');
    expect(nginx).toMatch(/^\s*http2 on;/m);
    expect(nginx).not.toMatch(/listen[^;]*\shttp2\s*;/);
  });
});

describe('R3-R5-F1 · /exam/change-password SPA 路由（A batch1 F1）', () => {
  it('nginx 精确 location 送 SPA 外壳', () => {
    const nginx = read('nginx-exam.conf');
    expect(nginx).toMatch(/location = \/exam\/change-password\s*\{\s*try_files \/exam\/index\.html =404;\s*\}/);
  });
  it('app.js SPA_PREFIXES 含 /change-password（硬导航兜底）', () => {
    const app = readServer('src/app.js');
    expect(app).toMatch(/SPA_PREFIXES\s*=\s*\[[^\]]*'\/change-password'/);
  });
});

describe('R3-LLM-OUT · OUT-3 日志不落模型输出片段', () => {
  it('project-grading / file-selection 只记长度+sha256（不记录输出片段）', () => {
    const pg = readServer('src/infrastructure/ai/deepseek/project-grading.js');
    const fsSel = readServer('src/infrastructure/ai/deepseek/file-selection.js');
    expect(pg).toContain('contentSha256');
    expect(pg).toContain('contentLength');
    expect(pg).not.toMatch(/content\.slice\(0,\s*300\)/);
    expect(fsSel).toContain('contentSha256');
    expect(fsSel).not.toMatch(/content\.slice\(0,\s*300\)/);
  });
  it('checker generator 的 checkerMeta.log 只记 modelOutputLength（不落 snippet）', () => {
    const gen = readServer('src/infrastructure/ai/checker/generator.js');
    expect(gen).toContain('modelOutputLength');
    const logLines = gen.split('\n').filter((l) => l.includes('meta.log.push'));
    expect(logLines.length).toBeGreaterThan(0);
    for (const line of logLines) expect(line).not.toMatch(/snippet|前\s*\d+\s*字符/);
  });
});

describe('R3-R11 · temp 目录归属凭据（静态）', () => {
  it('projectController 暴露归属凭据 API 且 resolveTempDir 接受 teacherId（fail-closed）', () => {
    const src = readServer('src/controllers/projectController.js');
    expect(src).toContain('TEMP_OWNER_FILE');
    expect(src).toContain('TEMP_TTL_MS');
    expect(src).toContain('writeTempOwner');
    expect(src).toMatch(/function resolveTempDir\(tempId, teacherId\)|resolveTempDir\(tempId, teacherId\)/);
    expect(src).toContain('readTempOwner');
  });
});

describe('R3-RATE · 路有接线（静态）', () => {
  it('app.js 接登录全局失败守卫；projectController 接限流中间件', () => {
    const app = readServer('src/app.js');
    const pc = readServer('src/controllers/projectController.js');
    expect(app).toContain('createLoginGlobalFailureGuard');
    expect(app).toContain('loginGlobalFailureGuard');
    expect(pc).toContain('createRateLimitMiddleware');
  });
});
