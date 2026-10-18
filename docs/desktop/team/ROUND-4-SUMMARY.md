# Round 4 交付总结（Windows 配置 + packaged 冒烟 + 跨产物一致性）

> 日期：2026-10-18 ｜ 分支：`feat/desktop-shell` ｜ 状态：**PASS**（A/T36 终验 + Lead 验收）

## 1. 结论

- Round 4 完成：Windows NSIS x64 配置与构建成功；packaged app 冒烟通过；F1 修复；W1（Windows locales 清空）修复；mac/win 前端快照统一。
- 未改后端/前端源码：`server/**`、`client/**`、根 package/lockfile 零改动。
- 最终产物：
  - macOS DMG：`desktop/release/Deadpan-0.1.0-arm64.dmg`，125,625,337 B，sha256 `c5e0d67e0fc64a63687bad0dd105cefe094e0d8aeb9350e06c55795b42b8f05e`
  - Windows NSIS：`desktop/release/Deadpan-0.1.0-x64.exe`，112,070,236 B，sha256 `b7b4f1621ea95907520532a46bd3f517eeba4152a479666d564bc300bad7691d`
  - 前端快照：index.html `bd78257784dac098bacf2a708bac04af43c9aecc5002c2e0db22684ba0d3f060`（mac/win/dist-desktop 三树一致）

## 2. 关键修复

| 项 | 结果 |
|---|---|
| W1 Windows locales | 平台级 electronLanguages：mac [zh_CN,en]、win [en-US,zh-CN]；win locales 恰 2 pak（1,178,651 B） |
| F1 build-dist 统计 | copied=390 / pruned=206 / noise=2 / noiseBytes=12,296；manifest 自洽 |
| packaged app 冒烟 | 1/1 pass，isPackaged=true，/exam/、非白屏、pageerror=0 |
| 跨产物一致性 | 三树 390 文件逐文件 sha256 一致，index.html/入口 JS/CSS 同哈希 |
| mac/win 对齐 | 均内嵌 10:50 `bd782577…` 快照；mac DMG 用同一 dist-desktop 重建 |

## 3. 验证

~~~bash
node --test "desktop/test/*.test.mjs"   # 137 tests / 136 pass / 0 fail / 1 skip
cd desktop && npm test                  # 同上
cd desktop && npm run test:gui          # 1/1 pass
cd desktop && npm run test:packaged     # 1/1 pass
~~~

- 唯一 skip：Gatekeeper spctl 环境用例（本机 assessments disabled）。
- 签名：mac ad-hoc / TeamIdentifier=not set / codesign verify OK；无公证、无自动更新。
- 范围：无 client/server/根 package/根 lockfile 改动；root package hash=HEAD。

## 4. 残余手工项

1. Windows 真机安装/启动/SmartScreen/PE 图标/locale 运行时。
2. Gatekeeper 干净 Mac 首次打开（本机无法演示）。
3. E3：网关 `client_max_body_size 12m` vs 50MB 上传，需运维决策。
4. 无 Authenticode / Developer ID / 公证（v0 内部试用决策）。
5. 前端快照纪律：三产物内嵌 `bd782577…`；后续前端更新须 mac+win 同时重建并记录快照哈希。
