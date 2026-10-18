# Pipeline State

- Worktree: `.agents/worktrees/feat/desktop-shell`
- Branch: `feat/desktop-shell`
- Phase: **ACCEPTED (v0.1.2 internal; Windows real-machine smoke pending)**
- Hotfix commit: `572472f8c5510d8dc0f6ca8d48b9ec3082337e42` ｜ tag `desktop-v0.1.2-internal`
- Last updated: 2026-10-18

## Final artifacts (only distribute 0.1.2)

| 产物 | 值 |
|---|---|
| macOS DMG | `desktop/release/Deadpan-0.1.2-arm64.dmg`（125,624,322 B） |
| macOS SHA-256 | `30305470a1f13478578f03c1038802663f963e3097405619d971eb2c2d6f0d93` |
| Windows NSIS | `desktop/release/Deadpan-0.1.2-x64.exe`（112,070,949 B） |
| Windows SHA-256 | `72ca2ff84bb977995c4df07b4df0b9c8ed3b3dd0a7b40583ccf85ea6d6a8412f` |
| frontend snapshot | index.html `bd782577…d3f060` |
| tests | 141 tests / 140 pass / 0 fail / 1 skip；GUI 1/1；packaged 1/1 |

## Hotfixes

- Hotfix 1：首启 config serverUrl 空 → 默认 https://deadpan.asia + 迁移。
- Hotfix 2：Windows 误报 macOS 13 → isPlatformSupported 平台感知检查。
- 旧产物归档 `desktop/release/archive-0.1.0/`、`archive-0.1.1/`。

## Blocking manual gate

- **Windows 10/11 真机安装 0.1.2 启动冒烟**（发布前必须）。
- 其余：Gatekeeper 干净 Mac、真实升级、E3 12m、签名口径、真实 API/WS。

## Scope

- 无 client/server/根 package/lockfile 改动；后端零改动。
- 分支未合并 master / 未推送。
