# Electron 桌面端适配最终验收（v0.1.1 内部试用 · Hotfix 1）

> 日期：2026-10-18 ｜ 状态：**ACCEPTED（内部试用 v0.1.1）** ｜ 分支：`feat/desktop-shell`
> 依据：`docs/desktop/2026-10-18-electron-desktop-plan.md` ｜ 流水线：A/B/C/D + Lead
> Hotfix 详情：`docs/desktop/team/HOTFIX-1-CONFIG.md`

## 1. 验收结论

目标已达成：B2 本地反代桌面壳、macOS arm64 DMG + ad-hoc 签名、Windows NSIS x64 配置与构建、首次启动 serverUrl 缺陷修复；通过 A 终验、C 测试与 Lead 验收。**全程未修改 `server/**` 后端代码，v0 未修改 `client/**`。**

## 2. 交付物（只分发 0.1.1）

| 产物 | 路径 | 大小 | SHA-256 |
|---|---|---:|---|
| macOS DMG | `desktop/release/Deadpan-0.1.1-arm64.dmg` | 125,623,893 B | `9535ba0c380367eb62c1dc8aab3ba81e84cb3afd1d9dde294b202e2f633ce9a9` |
| Windows NSIS | `desktop/release/Deadpan-0.1.1-x64.exe` | 112,070,556 B | `582e6496e4d06ef8e5157bc14bd84870a92ae01b571c8fe4457403aad9b5fd6a` |
| 前端快照 | index.html | — | `bd78257784dac098bacf2a708bac04af43c9aecc5002c2e0db22684ba0d3f060` |

> 旧 0.1.0 产物已移入 `desktop/release/archive-0.1.0/`；旧版含首启 serverUrl 为空缺陷，**不要分发**。

## 3. Hotfix 1（首启 config 为空）

- 根因：v0.1.0 首启模板 `serverUrl: ""`，严格校验导致启动失败。
- 修复：默认 `https://deadpan.asia`；对已有空/缺失 serverUrl 的 config 做原子迁移（保留 port/externalOrigins/caFile 等字段）；坏 JSON 不覆盖；版本 0.1.1。
- 当前机器已手工把 config 改为 `https://deadpan.asia`（备份 `.bak-20261018-empty-serverurl`），旧版可启动；建议安装 0.1.1 覆盖。
- 自建服务器：编辑 `~/Library/Application Support/Deadpan-Exam-Desktop/config.json` 的 serverUrl 后重启。

## 4. 验证证据

~~~bash
node --test "desktop/test/*.test.mjs"   # 139 tests / 138 pass / 0 fail / 1 skip
cd desktop && npm test                  # 同上
cd desktop && npm run test:gui          # 1/1 pass
cd desktop && npm run test:packaged     # 1/1 pass（0.1.1）
codesign --verify --deep --strict 'desktop/release/mac-arm64/Deadpan 判题.app'
~~~

- 唯一 skip：Gatekeeper spctl 环境用例（本机 assessments disabled）。
- macOS：ad-hoc、TeamIdentifier=not set、无公证/自动更新、min macOS 13、自定义图标、locales en+zh_CN。
- Windows：NSIS x64、locales en-US+zh-CN、无 latest.yml/app-update、未签名。
- 跨产物：mac app / win-unpacked / dist-desktop 三树 390 文件 sha256 一致；前端快照 `bd782577…`。
- 迁移逻辑：A/T39 独立验证 29/29 PASS（空/缺失/空白、幂等、保留字段、合法不覆盖、坏 JSON 不覆盖）。
- 范围：无 `client/**`、`server/**`、根 package/lockfile 改动。

## 5. 安装说明

### macOS（Apple Silicon，macOS 13+）

1. 校验 DMG SHA-256；
2. 打开 DMG，拖入“应用程序”（覆盖旧版）；
3. 首次启动：系统设置 → 隐私与安全性 → “仍要打开”；旧系统右键 → 打开；
4. 若提示“已损坏”：`xattr -dr com.apple.quarantine "/Applications/Deadpan 判题.app"`（确认校验和再执行）；
5. 本地网络权限弹窗请允许（连接服务器需要）。

### Windows（Windows 10/11 x64）

1. 校验 exe SHA-256；
2. 运行安装包；SmartScreen 提示时“更多信息 → 仍要运行”；
3. 未签名安装包，仅内部可信渠道分发。

## 6. 快照冻结纪律

mac/win 均内嵌 `bd782577…` 前端快照。后续任何前端/安全修复发版：

1. 选同一 `client/dist` 快照；
2. 重新生成 `dist-desktop`；
3. **mac + win 同时重建**；
4. release notes 记录前端快照 index.html SHA-256；
5. 保留上一版 DMG/exe（归档目录）用于回滚。

## 7. 残余手工项（不阻断 v0.1.1 内部验收）

1. Windows 真机安装/启动/SmartScreen/PE 图标/locale 运行时。
2. Gatekeeper 干净 Mac 首次打开（本机 assessments disabled）。
3. 真实 0.1.0 → 0.1.1 覆盖升级烟测（建议）。
4. E3：网关 `client_max_body_size 12m` vs 50MB 上传，需运维决策。
5. 无 Authenticode/Developer ID/公证（v0 内部试用风险接受）。
6. 真实登录/API/WS 链路联调。
7. DMG 本身未签名（仅 app ad-hoc）。

## 8. 流水线与提交

- Round 1 脚手架 → Round 2 macOS DMG → Round 3 GUI/图标 → Round 4 Windows/一致性 → Hotfix 1（首启 config）。
- A/B/C/D 全程使用指定技能；B 重构工单 0。
- 分支：`feat/desktop-shell`；最新 tag：`desktop-v0.1.1-internal`（提交见 git log）。
- 尚未合并 master / 尚未推送。
