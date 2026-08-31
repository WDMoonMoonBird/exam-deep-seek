# 安全处置记录（2026-08-31，P0 批次）

> 依据：docs/test-results/2026-08-31/ 审计（BUG-C69-07）与子 agent 安全核查（三层历史扫描）。

## 处置项

### 1. SSL 私钥 zip（高危）
- 文件：`26924726_deadpan.asia_nginx.zip`（阿里云证书包，含 deadpan.asia.pem + deadpan.asia.key）
- **git 历史核查结论**：路径级（`git log --all --`）、对象级（`git rev-list --all --objects`）、内容级（`git log -G 'PRIVATE KEY-----'`、全树 `git grep`）三层扫描覆盖 3 本地 + 3 远端分支与 stash，**零入库** → 无需 filter-repo/BFG。
- **处置**：已移出仓库目录 → `~/certs/26924726_deadpan.asia_nginx.zip`
- **指纹（轮换验证用）**：
  - zip：`97a586f2c5fa1af334b312ce41f8202cda8906e977df0f6dafb2f5c016df5464`
  - deadpan.asia.key：`758dcb72692b2ca80c1785ae1d68b39a15e14c96f76854db2ec734f020817f7f`
- **轮换预案**（若确认 gitee 公开或私钥曾暴露）：阿里云重新签发 → `nginx -t && systemctl reload nginx` → 用上述指纹核对新证书。

### 2. server/.env 防护
- 已被 `.gitignore: .env` 规则覆盖（任意深度）、未跟踪、历史干净。
- 处置：`chmod 600 server/.env`；`.gitignore` 追加 `server/.env.*`（未加 `*.env`，避免误伤 client/.env.development 与 .env.production——二者为公开 URL 配置，保留跟踪）。
- 建议后续：安装 gitleaks + pre-commit 门禁（防未来误提交）。

### 3. 遗留脚本清理
- `server/accept.tmp.mjs`（import 不存在的 checkerService.js，悬空引用）→ 已删除
- `client/vite.preview-temp.js`（临时 preview 配置，未被 scripts 引用）→ 已删除
  - 注意：若需再次本地预览，请使用 `npm run preview`（默认 4173，代理未配置）或重建该临时文件。

### 4. .gitignore 新增规则
```
# 证书与私钥（含阿里云证书 zip 包）
*.pem
*.key
*.crt
*_nginx.zip
# 服务端环境变量（client/.env.development 与 .env.production 为公开 URL 配置，保留跟踪）
server/.env.*
```

## 遗留风险提示
- `client/.env.development` / `.env.production` 被 git 跟踪但仅含 VITE_API_BASE_URL/VITE_WS_URL（无密钥），可接受。
- "首次开源"提交（1b9e8b9）后仓库若为公开，建议核查 docs 未跟踪报告中的内网 IP/截图后再开源。
