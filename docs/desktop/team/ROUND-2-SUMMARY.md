# Round 2 交付总结（macOS arm64 DMG + ad-hoc 签名）

> 日期：2026-10-18 ｜ 分支：`feat/desktop-shell` ｜ 状态：**PASS**（A/T16 终验 + Lead 验收）

## 1. 结论

- Round 2 目标完成：用实际前端产物生成 `dist-desktop`，出 macOS arm64 DMG，ad-hoc 签名并验证。
- 未修改后端/前端源码：`server/**`、`client/**`、根 package/lockfile 零改动；只改 desktop 构建配置、package.json、新增 desktop lockfile 与测试/报告。
- B 重构工单 0、D 修复 no-op；测试零回归。

## 2. 产物

| 产物 | 值 |
|---|---|
| DMG | `desktop/release/Deadpan-0.1.0-arm64.dmg`（124,723,942 B / 118.94 MiB） |
| DMG SHA-256 | `b379d52d315c833958bd9241379c8df3e32c3a1568ea142e8e62db31024b1b1c` |
| app | `desktop/release/mac-arm64/Deadpan 判题.app`（约 270 MB） |
| dist-desktop | 29 MB，keep 392 / prune 206（-15.7MB），legacy 残留 0，现代 Monaco worker 6 个保留 |
| 签名 | `Signature=adhoc`、`TeamIdentifier=not set`、`codesign --verify --deep --strict` OK |
| Info.plist | min 13.0、bundle id `asia.deadpan.exam.desktop`、版本 0.1.0、locales en + zh_CN |
| 更新/公证 | 无 autoUpdater/publish/notarize；无公证 ticket |

## 3. 验证

~~~bash
node --test "desktop/test/*.test.mjs"   # 124 tests / 123 pass / 0 fail / 1 skip
cd desktop && npm test                  # 同上，EXIT=0
shasum -a 256 desktop/release/Deadpan-0.1.0-arm64.dmg
codesign -dv --verbose=2 'desktop/release/mac-arm64/Deadpan 判题.app'
~~~

- 唯一 skip：Gatekeeper 预期拒绝用例（本机 `spctl --status = assessments disabled`），需干净 Mac 复验；不作为签名失败证据。
- A/T12 与 A/T16 独立复验产物逐字节一致；T12 指纹 18/18 OK。

## 4. 团队结果

| Agent | 结果 |
|---|---|
| D/T10 | 构建 DMG；修复镜像下载与 zh_CN locale 匹配；报告 `reports/desktop/logs/round-2-package.md` |
| C/T11/T14 | packaging.test.mjs 12 例；回归 124 例零失败；报告 `reports/desktop/test/round-2-regression.md` |
| A/T12/T16 | 打包/签名/产物审查 PASS；B 工单 0；终验报告 `reports/desktop/review/round-2-final.md` |
| B/T13 | no-op，0 工单；报告 `reports/desktop/review/round-2-refactor.md` |
| D/T15 | no-op，无遗留；报告 `reports/desktop/logs/round-2-fix.md` |

## 5. 残余风险（Round 3 处理）

- R-GK：Gatekeeper 首次打开需干净 Mac 按 README 复验（本机 assessments disabled）。
- R-GUI：Electron GUI 未实际启动；electron postinstall 未跑（dev `npm start` 需 approve-scripts）。
- R-E3：网关 `client_max_body_size 12m` vs 50MB 上传，需运维决策。
- 默认 Electron 图标；L1 lockfile 全 npmmirror 源；L2 engines >=20 vs 工具链 >=22.12；.DS_Store/build manifest 随包。
- DMG 本身未签名（计划只要求 app ad-hoc）。

## 6. Round 3（已队列）

| 任务 | Owner | 内容 |
|---|---|---|
| task-18 R3-1 | D | GUI 冒烟准备、应用图标、开发 Electron、engines/lockfile/包洁癖 |
| task-19 R3-2 | C | Playwright-Electron GUI 冒烟测试 |
| task-20 R3-3 | A | GUI/图标/包洁癖审查 |
| task-21 R3-4 | B | 按工单重构（预计 no-op） |
| task-22 R3-5 | C | Round 3 回归 |
| task-23 R3-6 | D | 修复遗留（如无则 no-op） |
| task-24 R3-7 | A | Round 3 终验 |
| task-25 R3-8 | Lead | 验收 + Round 4（Windows target/NSIS、干净 Mac Gatekeeper、真实 API 联调） |
