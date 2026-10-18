# Pipeline State

- Worktree: `.agents/worktrees/feat/desktop-shell`
- Branch: `feat/desktop-shell`
- Plan: `docs/desktop/2026-10-18-electron-desktop-plan.md`
- Phase: **FINAL ACCEPTED (v0.1.1 internal, Hotfix 1)**
- Hotfix commit: `fc8b7491e3bbef82c670cae3dfa88b4af698d67e` ｜ tag `desktop-v0.1.1-internal`
- Last updated: 2026-10-18

## Final artifacts (only distribute 0.1.1)

| 产物 | 值 |
|---|---|
| macOS DMG | `desktop/release/Deadpan-0.1.1-arm64.dmg`（125,623,893 B） |
| macOS SHA-256 | `9535ba0c380367eb62c1dc8aab3ba81e84cb3afd1d9dde294b202e2f633ce9a9` |
| Windows NSIS | `desktop/release/Deadpan-0.1.1-x64.exe`（112,070,556 B） |
| Windows SHA-256 | `582e6496e4d06ef8e5157bc14bd84870a92ae01b571c8fe4457403aad9b5fd6a` |
| frontend snapshot | index.html `bd782577…d3f060`（三树一致） |
| tests | 139 tests / 138 pass / 0 fail / 1 skip；GUI 1/1；packaged 1/1 |
| docs | `FINAL-ACCEPTANCE.md`、`HOTFIX-1-CONFIG.md` |

## Hotfix 1

- v0.1.0 首启 config.json serverUrl 为空 → 启动失败。
- 0.1.1：默认 https://deadpan.asia；已有空/缺失配置自动迁移（保留字段）；坏 JSON 不覆盖。
- 当前机器 config 已手工修复并备份；建议安装 0.1.1 覆盖。
- 旧 0.1.0 产物已归档 `desktop/release/archive-0.1.0/`，不要分发。

## Rounds

- R1 脚手架 (112 tests, A PASS)
- R2 macOS DMG + ad-hoc (124 tests, A PASS)
- R3 GUI + 图标 + 包洁癖 (125 tests, A PASS)
- R4 Windows + packaged + 一致性 (137 tests, A PASS)
- Hotfix 1 config 默认/迁移 (139 tests, A PASS)

## Residual manual items

- Windows 真机安装/SmartScreen/图标/locale；Gatekeeper 干净 Mac；真实 0.1.0→0.1.1 升级烟测；E3 网关 12m；签名/公证 v0 决策；真实 API/WS 联调。
- 快照冻结：前端变更必须 mac+win 同时重建并记录快照哈希。

## Scope

- 无 client/**、server/**、根 package/lockfile 改动；后端零改动。
- 分支尚未合并 master / 尚未推送。
