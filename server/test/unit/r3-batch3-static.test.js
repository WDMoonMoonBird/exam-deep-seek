/**
 * r3-batch3-static.test.js — batch3 静态/配置断言（C 写域）
 * 覆盖：R3-SUPPLY（express-rate-limit 死依赖移除 / xlsx 版本锁定 / CI 安全门禁 / .gitignore）、
 *       R3-WORKER-ARGS（DB URL 移出 argv）、P2-RATE-a/b 接线、R13 静态。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SERVER_ROOT = process.cwd();
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
const read = (rel) => fs.readFileSync(path.resolve(REPO_ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

describe('R3-SUPPLY · 死依赖移除 + xlsx 版本锁定', () => {
  it('server/package.json 不再声明 express-rate-limit；锁文件同步清理', () => {
    const pkg = readJson('server/package.json');
    expect(pkg.dependencies['express-rate-limit']).toBeUndefined();
    expect(pkg.devDependencies?.['express-rate-limit']).toBeUndefined();
    const lock = read('server/package-lock.json');
    expect(lock.includes('"node_modules/express-rate-limit"')).toBe(false);
    expect(lock.includes('"express-rate-limit"')).toBe(false);
  });
  it('xlsx 仍锁定 0.18.5（两锁文件；升级 blocked:registry 的基线）', () => {
    const sLock = readJson('server/package-lock.json');
    const cLock = readJson('client/package-lock.json');
    expect(sLock.packages['node_modules/xlsx'].version).toBe('0.18.5');
    expect(cLock.packages['node_modules/xlsx'].version).toBe('0.18.5');
  });
});

describe('R3-SUPPLY · CI 安全门禁（gitleaks / audit 基线 / SBOM）', () => {
  it('security-scan.yml 结构静态：name/jobs/steps 齐全（YAML 解析由 task-38 证据脚本校验）', () => {
    const wf = read('.github/workflows/security-scan.yml');
    expect(wf).toMatch(/^name: security-scan$/m);   // 文件头允许注释，name 键必须存在
    expect(wf).toMatch(/^jobs:\s*$/m);
    expect(wf).toMatch(/^\s+steps:\s*$/m);
    expect(wf).toContain('audit-baseline-check.mjs');
    expect(wf).toContain('cyclonedx-npm');
  });
  it('★P2-SUPPLY-a：gitleaks 只扫工作树（--no-git）且 --redact/--exit-code，不依赖全历史', () => {
    const wf = read('.github/workflows/security-scan.yml');
    expect(wf).toContain('gitleaks detect');
    expect(wf).toContain('--source .');
    expect(wf).toContain('--no-git');
    expect(wf).toContain('--redact');
    expect(wf).toContain('--exit-code 1');
    // 不扫全历史 ⇒ checkout 不需要 fetch-depth: 0；且本票不含 allowlist config（独立专项，见 D 注释）
    expect(wf).not.toContain('fetch-depth: 0');
    expect(wf).not.toMatch(/--config|gitleaks\.toml/);
  });
  it('audit 基线脚本与基线数据存在且基线 JSON 可解析', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, '.github/scripts/audit-baseline-check.mjs'))).toBe(true);
    const baseline = readJson('.github/security/audit-baseline.json');
    expect(baseline).toBeTruthy();
  });
  it('.gitignore 覆盖任意层级 .env 派生文件并保留公开配置例外（R26）', () => {
    const gi = read('.gitignore');
    expect(gi).toMatch(/^\.env\.\*$/m);
    expect(gi).toContain('!.env.example');
    expect(gi).toContain('!client/.env.development');
    expect(gi).toContain('!client/.env.production');
  });
  it('secrets 静态：git 跟踪文件中无真实 .env（仅示例与公开前端配置）', () => {
    const tracked = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /(^|\/)\.env/.test(f));
    expect(tracked.sort()).toEqual(['client/.env.development', 'client/.env.production', 'server/.env.example']);
  });
});

describe('R3-WORKER-ARGS · DB 连接串移出启动参数', () => {
  it('systemd unit 的 ExecStart 不含 --db-url（改为 EnvironmentFile 注入）', () => {
    const unit = read('docs/dsh/deploy/dsh-grader-worker.service');
    // 注释中可提及该选项；断言的是「ExecStart 行不再以 --db-url 参数出现」
    expect(unit).not.toMatch(/^\s*--db-url\s/m);
    expect(unit).toContain('EnvironmentFile=');
    expect(unit).toContain('process.env.DATABASE_URL');
  });
  it('worker.env.example 明确「只放 env 文件、禁止写进 argv」', () => {
    const env = read('docs/dsh/deploy/worker.env.example');
    expect(env).toContain('DATABASE_URL=');
    expect(env).toMatch(/禁止.*命令行参数/);
  });
});

describe('R13 · 静态：不再把原始 error message 拼进客户端文案', () => {
  it('adminController / student project-submit 无「服务器错误: + msg」式拼接', () => {
    for (const rel of ['server/src/controllers/adminController.js', 'server/src/interface/http/controllers/student/project-submit.js']) {
      const src = read(rel);
      expect(src).not.toMatch(/服务器错误[:：]\s*['"]\s*\+\s*\w+/);
    }
  });
});
