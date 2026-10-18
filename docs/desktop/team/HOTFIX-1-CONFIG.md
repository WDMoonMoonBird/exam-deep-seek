# Hotfix 1：首启 config serverUrl 为空（v0.1.1）

> 日期：2026-10-18 ｜ 触发：用户安装 v0.1.0 后启动报错 config.json serverUrl 为空

## 1. 根因

v0.1.0 的 `configTemplate()` 把 `serverUrl` 写成空字符串，首次启动生成：

~~~json
{ "serverUrl": "", "port": 47821, "externalOrigins": [], "caFile": null }
~~~

`loadConfig()` 严格校验 serverUrl 必填 → 启动直接 fail，未进入应用。

## 2. 修复（0.1.1）

- 新增 `DEFAULT_SERVER_URL = 'https://deadpan.asia'`；首次启动模板直接用默认值。
- 新增 `migrateConfig()` + `ensureConfigFile()` 迁移：已存在但 serverUrl 空/缺失时补默认值，**保留** port/externalOrigins/caFile/未知字段，原子写；返回 `repaired`。
- 合法 URL 不覆盖；坏 JSON 不覆盖，仍明确报错。
- `index.mjs` 记录 created/repaired 日志；README 增加首次启动、修改 serverUrl、迁移说明。
- 版本升级 0.1.1（package.json/package-lock/Info.plist/asar）。

## 3. 产物（只分发 0.1.1）

| 产物 | 大小 | SHA-256 |
|---|---:|---|
| `Deadpan-0.1.1-arm64.dmg` | 125,623,893 B | `9535ba0c380367eb62c1dc8aab3ba81e84cb3afd1d9dde294b202e2f633ce9a9` |
| `Deadpan-0.1.1-x64.exe` | 112,070,556 B | `582e6496e4d06ef8e5157bc14bd84870a92ae01b571c8fe4457403aad9b5fd6a` |

- 前端快照未变：index.html `bd78257784dac098bacf2a708bac04af43c9aecc5002c2e0db22684ba0d3f060`（三树一致）。
- **旧 0.1.0 产物已移入 `desktop/release/archive-0.1.0/`，不要分发。**

## 4. 验证

~~~bash
node --test "desktop/test/*.test.mjs"   # 139 tests / 138 pass / 0 fail / 1 skip
cd desktop && npm test                  # 同上
cd desktop && npm run test:gui          # 1/1
cd desktop && npm run test:packaged     # 1/1（0.1.1）
~~~

- 迁移独立验证 29/29 PASS（A/T39）：空/缺失/空白、幂等、保留字段、合法不覆盖、坏 JSON 不覆盖。
- 0.1.1 codesign ad-hoc + verify OK；mac locales 2 / win locales 2 pak；三树快照一致。

## 5. 用户当前已安装 0.1.0 怎么办

- 已手工把当前机器的 `~/Library/Application Support/Deadpan-Exam-Desktop/config.json` 的 serverUrl 设为 `https://deadpan.asia`（备份 `.bak-20261018-empty-serverurl`），旧版现在可启动。
- 建议安装 0.1.1 DMG 覆盖旧版（迁移逻辑会自动修复空配置）。
- 如使用自建服务器，编辑该 config.json 的 `serverUrl` 后重启应用。
