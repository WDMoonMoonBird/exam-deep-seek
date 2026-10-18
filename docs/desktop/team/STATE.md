# Pipeline State

- Worktree: `.agents/worktrees/feat/desktop-shell`
- Branch: `feat/desktop-shell`
- Base commit: `2f77967d55e11b37cdb32db44b40c02220f79bf6`
- Round 1 commit/tag: `213f7ca` / `desktop-r1-scaffold`
- Round 2 commit/tag: `548bf09` / `desktop-r2-dmg`
- Round 3 commit/tag: `80e297e` / `desktop-r3-gui`
- Round 4 commit/tag: pending / `desktop-r4-win`
- Plan: `docs/desktop/2026-10-18-electron-desktop-plan.md`
- Round: 4 ✅ PASS
- Phase: **FINAL ACCEPTED (v0.1.0 internal)**
- Last updated: 2026-10-18

## Final artifacts

| 产物 | 值 |
|---|---|
| macOS DMG | `desktop/release/Deadpan-0.1.0-arm64.dmg`（125,625,337 B） |
| macOS SHA-256 | `c5e0d67e0fc64a63687bad0dd105cefe094e0d8aeb9350e06c55795b42b8f05e` |
| Windows NSIS | `desktop/release/Deadpan-0.1.0-x64.exe`（112,070,236 B） |
| Windows SHA-256 | `b7b4f1621ea95907520532a46bd3f517eeba4152a479666d564bc300bad7691d` |
| frontend snapshot | index.html `bd782577…d3f060`（mac/win/dist-desktop 三树一致） |
| tests | 137 tests / 136 pass / 0 fail / 1 skip；GUI 1/1；packaged 1/1 |
| final doc | `docs/desktop/team/FINAL-ACCEPTANCE.md` |

## Round 4 result

- A/T36 终验 PASS：W1（Windows locales）修复、F1 统计修复、packaged 冒烟、mac/win 前端快照统一。
- mac DMG 与 win exe 均内嵌 `bd782577…` 快照；三树 390 文件 sha256 一致。
- 范围：无 client/server/根 package/lockfile 改动；后端零改动。
- B 工单 0；D no-op/修复按需；C 回归 137 例。

## Residual manual items

- Windows 真机安装/启动/SmartScreen/PE 图标/locale 运行时。
- Gatekeeper 干净 Mac 首次打开。
- E3 网关 12m vs 50MB 上传（运维决策）。
- 无 Authenticode/Developer ID/公证（v0 内部风险接受）。
- 真实登录/API/WS 联调。
- 前端快照冻结纪律：后续前端变更必须 mac+win 同时重建并记录快照哈希。
