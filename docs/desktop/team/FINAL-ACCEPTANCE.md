# Electron 桌面端适配最终验收（v0.1.0 内部试用）

> 日期：2026-10-18 ｜ 状态：**ACCEPTED（内部试用 v0.1.0）** ｜ 分支：`feat/desktop-shell`
> 依据：`docs/desktop/2026-10-18-electron-desktop-plan.md` ｜ 流水线：A/B/C/D + Lead

## 1. 验收结论

目标已达成：在独立 worktree 中完成 Electron 桌面端 v0.1.0（B2 本地反代架构、macOS arm64 DMG + ad-hoc 签名、Windows NSIS x64 配置与构建），通过 A 终验、C 测试与 Lead 验收；**全程未修改 `server/**` 后端代码，v0 未修改 `client/**`**。

## 2. 交付物

| 产物 | 路径/值 |
|---|---|
| macOS DMG | `desktop/release/Deadpan-0.1.0-arm64.dmg`（125,625,337 B） |
| macOS SHA-256 | `c5e0d67e0fc64a63687bad0dd105cefe094e0d8aeb9350e06c55795b42b8f05e` |
| Windows NSIS | `desktop/release/Deadpan-0.1.0-x64.exe`（112,070,236 B） |
| Windows SHA-256 | `b7b4f1621ea95907520532a46bd3f517eeba4152a479666d564bc300bad7691d` |
| 前端快照 | index.html `bd78257784dac098bacf2a708bac04af43c9aecc5002c2e0db22684ba0d3f060`（三树一致） |
| 源码/测试 | `desktop/**`（含 14 个测试文件、137 例） |
| 设计/计划 | `docs/desktop/2026-10-18-electron-desktop-plan.md` |
| 团队记录 | `docs/desktop/team/`（约定/STATE/各轮总结） |
| 审查/测试报告 | `reports/desktop/**` |

## 3. 验证证据

~~~bash
node --test "desktop/test/*.test.mjs"   # 137 tests / 136 pass / 0 fail / 1 skip
cd desktop && npm test                  # EXIT=0
cd desktop && npm run test:gui          # 1/1 pass
cd desktop && npm run test:packaged     # 1/1 pass
codesign --verify --deep --strict 'desktop/release/mac-arm64/Deadpan 判题.app'   # OK
shasum -a 256 desktop/release/Deadpan-0.1.0-arm64.dmg desktop/release/Deadpan-0.1.0-x64.exe
~~~

- macOS：ad-hoc、TeamIdentifier=not set、无公证、无自动更新、Info.plist min 13.0、自定义图标、locales en+zh_CN。
- Windows：NSIS x64、locales en-US+zh-CN、无 latest.yml/app-update、无签名。
- 跨产物：mac app / win-unpacked / dist-desktop 三树 390 文件 sha256 一致。
- 范围：无 `client/**`、`server/**`、根 package/lockfile 改动。

## 4. 安装说明

### macOS（Apple Silicon，macOS 13+）

1. 校验 DMG SHA-256；
2. 打开 DMG，拖入“应用程序”；
3. 首次启动：系统设置 → 隐私与安全性 → “仍要打开”；旧系统右键 → 打开；
4. 若提示“已损坏”：`xattr -dr com.apple.quarantine "/Applications/Deadpan 判题.app"`（确认校验和再执行）；
5. 本地网络权限弹窗请允许（连接服务器需要）。

### Windows（Windows 10/11 x64）

1. 校验 exe SHA-256；
2. 运行安装包；SmartScreen 提示时“更多信息 → 仍要运行”；
3. 未签名安装包，仅内部可信渠道分发。

## 5. 快照冻结纪律

桌面端把前端产物打进安装包：mac/win 均内嵌 `bd782577…` 快照。后续任何前端/安全修复发版，必须：

1. 选同一 `client/dist` 快照；
2. 重新生成 `dist-desktop`；
3. **mac + win 同时重建**；
4. release notes 记录前端快照 index.html SHA-256；
5. 保留上一版 DMG/exe 用于回滚。

## 6. 残余手工项（不阻断 v0.1.0 内部验收）

1. Windows 真机安装/启动/SmartScreen/PE 图标/locale 运行时。
2. Gatekeeper 干净 Mac 首次打开（本机 assessments disabled）。
3. E3：网关 `client_max_body_size 12m` vs 50MB 上传，需运维决策。
4. 无 Authenticode/Developer ID/公证（v0 内部试用风险接受）。
5. 业务登录/API/WS 真实链路联调（需测试账号/环境）。
6. DMG 本身未签名（仅 app ad-hoc）。

## 7. 流水线记录

- Round 1：脚手架 + 112 测试，A/T8 PASS。
- Round 2：macOS DMG + ad-hoc，A/T16 PASS。
- Round 3：GUI 冒烟 + 图标 + 包洁癖，A/T24 PASS。
- Round 4：Windows 配置/构建 + packaged 冒烟 + W1/F1 修复 + 跨产物一致性，A/T36 PASS。
- B 重构工单全程 0；C 测试 112 → 137 例；Lead 每轮验收并记录 STATE。
