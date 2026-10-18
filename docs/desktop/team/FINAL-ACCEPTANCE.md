# Electron 桌面端适配最终验收（v0.1.2 内部试用 · Hotfix 1+2）

> 日期：2026-10-18 ｜ 状态：**代码/测试/产物 ACCEPTED；Windows 真机启动冒烟为发布阻断项**
> 分支：`feat/desktop-shell` ｜ 依据：`docs/desktop/2026-10-18-electron-desktop-plan.md`
> Hotfix：`HOTFIX-1-CONFIG.md`（首启 config）、`HOTFIX-2-PLATFORM.md`（Windows 误报 macOS）

## 1. 验收结论

B2 本地反代桌面壳、macOS arm64 DMG + ad-hoc、Windows NSIS x64、首启 config 修复、平台感知启动检查均已完成，通过 A 终验/C 测试/Lead 验收。**全程未修改 `server/**` 后端代码，v0 未修改 `client/**`。**

⚠️ 唯一发布阻断：**Windows 10/11 真机安装 0.1.2 并启动**，确认不再弹“需要 macOS 13+”。本机 macOS 无法执行 Windows 包，只完成静态/单测验证。

## 2. 交付物（只分发 0.1.2）

| 产物 | 路径 | 大小 | SHA-256 |
|---|---|---:|---|
| macOS DMG | `desktop/release/Deadpan-0.1.2-arm64.dmg` | 125,624,322 B | `30305470a1f13478578f03c1038802663f963e3097405619d971eb2c2d6f0d93` |
| Windows NSIS | `desktop/release/Deadpan-0.1.2-x64.exe` | 112,070,949 B | `72ca2ff84bb977995c4df07b4df0b9c8ed3b3dd0a7b40583ccf85ea6d6a8412f` |
| 前端快照 | index.html | — | `bd78257784dac098bacf2a708bac04af43c9aecc5002c2e0db22684ba0d3f060` |

> 旧 0.1.0/0.1.1 已归档到 `desktop/release/archive-0.1.0/`、`archive-0.1.1/`，**不要分发**。

## 3. 两个 Hotfix

### Hotfix 1：首启 config serverUrl 为空

- 根因：v0.1.0 的 configTemplate 写 serverUrl 空串。
- 修复：默认 `https://deadpan.asia`；已有空/缺失配置原子迁移（保留字段）；坏 JSON 不覆盖；版本 0.1.1。

### Hotfix 2：Windows 误报“需要 macOS 13+”

- 根因：index.mjs 无条件用 isMacosVersionSupported(process.getSystemVersion())；Windows 10.x < 13 被误判。
- 修复：`isPlatformSupported(platform, version)`：darwin 校验 macOS；win32/linux 放行；未知平台 fail-closed；非 macOS 不显示 macOS 文案。
- 版本 0.1.2；README 增加系统要求/平台检查。

## 4. 验证证据

~~~bash
node --test "desktop/test/*.test.mjs"   # 141 tests / 140 pass / 0 fail / 1 skip
cd desktop && npm test                  # 同上
cd desktop && npm run test:gui          # 1/1 pass
cd desktop && npm run test:packaged     # 1/1 pass（0.1.2）
codesign --verify --deep --strict 'desktop/release/mac-arm64/Deadpan 判题.app'
~~~

- 唯一 skip：Gatekeeper spctl 环境用例（本机 assessments disabled）。
- 平台检查独立验证 28/28 PASS：win32 10.0/22631→true、darwin 13→true、darwin 12→false、未知→false；index 无旧根因调用。
- macOS：ad-hoc、无 Team ID、无公证/自动更新、min 13、自定义图标、locales 2。
- Windows：NSIS x64、locales en-US+zh-CN、未签名。
- 跨产物：三树 390 文件 sha256 一致；快照 `bd782577…`。
- 范围：无 client/server/根 package/lockfile 改动。

## 5. 安装说明

### macOS（Apple Silicon，macOS 13+）

校验 SHA-256 → 打开 DMG → 拖入“应用程序”（覆盖旧版）→ 首次启动按 Gatekeeper 步骤“仍要打开”（必要时执行 xattr -dr com.apple.quarantine "/Applications/Deadpan 判题.app"）→ 允许本地网络权限。

### Windows（Windows 10/11 x64）

校验 exe SHA-256 → 运行安装包（覆盖旧版）→ SmartScreen 提示时“更多信息 → 仍要运行”。**安装后请确认不再弹 macOS 13 提示，能进入登录页。**

## 6. 残余手工项

1. **Windows 10/11 真机启动冒烟（发布阻断）**。
2. Gatekeeper 干净 Mac 首次打开。
3. 真实 0.1.x → 0.1.2 覆盖升级烟测。
4. E3 网关 12m vs 50MB 上传（运维决策）。
5. 无 Authenticode/Developer ID/公证（v0 内部风险接受）。
6. 真实登录/API/WS 链路联调。
7. 快照冻结：前端变更必须 mac+win 同时重建并记录快照哈希。

## 7. 流水线与提交

- Round 1 脚手架 → Round 2 macOS DMG → Round 3 GUI/图标 → Round 4 Windows/一致性 → Hotfix 1（config）→ Hotfix 2（平台检查）。
- A/B/C/D 全程使用指定技能；B 重构工单 0。
- 分支 `feat/desktop-shell`；tag `desktop-v0.1.2-internal`（提交见 git log）。
- 尚未合并 master / 尚未推送。
