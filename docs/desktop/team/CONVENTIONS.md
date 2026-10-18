# 桌面端流水线协作约定（A/B/C/D）

> 唯一目标：按 `docs/desktop/2026-10-18-electron-desktop-plan.md` 完成 Electron 桌面端 v0。
> Lead 维护 `STATE.md`；每个 agent 只读：本文件 + STATE + 自己的任务 + 必要文件。

## 0. 当前阶段与硬约束

- 分支/worktree：`feat/desktop-shell`（独立 worktree，base `2f77967`）
- 当前阶段：Round 1 —— 可测试的 desktop 壳脚手架（不是完整 DMG）
- 硬约束（违反即失败）：
  - 禁止修改 `server/**`、`server/prisma/**`、数据库、后端 env/nginx
  - Round 1 禁止修改 `client/**`、根 `package.json`、client/server lockfile
  - 禁止切分支/切主工作区；禁止占用 `:5173/:3000`
  - 禁止 kill 其他会话进程；禁止写生产库/跑迁移
  - 禁止 `nodeIntegration: true`、`webSecurity: false`、绕过证书校验
  - 不涉及 Apple Developer 账号、公证、自动更新、App Store

## 1. 角色与写权限

| Agent | Skill | 允许写 | 禁止写 |
|---|---|---|---|
| A review | code-analyzer | `reports/desktop/review/**` | 任何产品代码/测试 |
| B refactor | tech-code-refactoring | 仅 A 工单列出的文件 | 新功能、其他文件、测试 |
| C test | tech-test-automation | `desktop/test/**`、`reports/desktop/test/**` | 产品代码 |
| D dev | dev-expert | `desktop/**`（不含 `desktop/test`） | client/**、server/**、测试 |
| Lead | — | `docs/desktop/team/**`、集成与验收 | 不代替 D 写产品代码 |

- A 只读代码；发现问题写报告 + 工单（文件、行号、原因、建议）。
- B 只在收到 A 工单后动刀；保持行为不变，优先小步重构。
- C 只写测试与测试报告；不得为让测试通过而改产品代码。
- D 按任务实现；若需要新依赖，写入 `desktop/package.json`，不装到 client/server。

## 2. 流水线

每轮固定顺序；A/C 可在 D 完成后并行：

1. D 实现/修复 → 产出 + 自检
2. C 写/跑测试；A 做架构与 GodFile 审查（并行）
3. B 按 A 工单重构（无工单则 no-op 完成）
4. C 回归测试；A 验证
5. Lead 验收：无后端 diff、测试通过、A 通过、无 GodFile
6. 未通过 → D 修复 → 回到 2；同一轮最多 3 次循环

完成定义：A 报告 `PASS` + C 报告全绿 + `git diff` 无 `server/**` + Lead 验收。

## 3. 上下文预算（防爆炸）

- 只读：本文件、STATE、自己的任务、计划中相关章节、目标文件。
- 禁止读 `node_modules/`、`client/dist/`、`.git/`；禁止通读全仓。
- 用 `grep`/`glob` 定位，`read` 用 offset/limit；不要 cat 大文件。
- 详细内容写文件；最终消息 ≤ 15 行：状态、产物路径、测试命令/结果、阻塞。
- 日志/长输出写 `reports/desktop/logs/`；消息里只给路径 + 摘要。
- 不要重复计划全文；用路径引用。
- 不向用户提问；阻塞时给 Lead 一条明确消息。
- 单次任务只做一个关注点；不要顺手重构无关文件。

## 4. 任务板协议

- `team_task_list` → `team_task_get` → 用当前 revision `claim` → 执行 → `complete`。
- 只在自己的 write scope 写；跨 scope 先找 Lead。
- 没有 ready 任务：回复 `standby: <name>` 并结束，不要空闲轮询。
- 完成时必须写：变更摘要、文件列表、验证命令/结果、遗留问题。

## 5. GodFile / 架构规则

- 新 desktop 模块：目标 ≤ 300 行；硬上限 400 行；超过 400 行 = A 开重构工单。
- 一模块一职责；禁止把窗口、代理、配置、持久化混在一个文件。
- `src/main/index.*` 只做组合与生命周期；具体能力拆模块。
- 纯逻辑（路径规范化、Host/Origin 校验、代理头处理、CSP 构造、裁剪清单）必须可单测。
- desktop 不得 import `client/src`；client 不得 import desktop；renderer 不用 Node API。
- 现有 client/server 的既有文件本轮不重构（安全团队并行），仅在与桌面直接相关时报告问题。

## 6. 测试规则

- Round 1 用 Node 内置 `node:test`（`node --test`），不新增测试依赖。
- 测试确定性：不访问生产网络；需要监听端口时用 `127.0.0.1:0` 临时端口。
- 本轮不要求启动 Electron GUI；以纯模块单测 + 语法/静态检查为主。
- 测试文件名与验收点对应；C 负责给出运行命令与结果。

## 7. 安全规则

- Electron：`contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`、`webSecurity=true`。
- 本地服务只绑 `127.0.0.1`，固定端口 47821；只允许固定远端服务器，不接受任意 URL。
- 代理：去除本地 Origin；不伪造 X-Forwarded-For；不关闭证书校验。
- 不提交证书/密钥/服务器凭据；服务器地址走 userData 配置。
- 无自动更新、无公证、无 Apple 账号；v0 仅内部 DMG 分发。

## 8. 汇报格式

- A：`reports/desktop/review/round-N.md`，含 PASS/FAIL、严重级别、文件:行、工单。
- B：重构文件、行数前后、行为保持说明、回归命令。
- C：`reports/desktop/test/round-N.md`，用例数、通过/失败、命令、失败日志路径。
- D：任务产出、文件、自检命令、已知限制。
- Lead：更新 `STATE.md`，最终只读任务板与报告，不逐行读代码。
