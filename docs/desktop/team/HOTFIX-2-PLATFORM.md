# Hotfix 2：Windows 误报“需要 macOS 13+”（v0.1.2）

> 日期：2026-10-18 ｜ 触发：Windows 安装 0.1.1 后启动提示“需要 macOS 13 及以上”

## 1. 根因

`index.mjs` 启动时**无条件**调用：

~~~js
if (!isMacosVersionSupported(process.getSystemVersion())) { ... }
~~~

Windows 的 `process.getSystemVersion()` 返回 `10.0.19045` 等，主版本 10 < macOS 最低 13 → 被误判为“macOS 版本过低”，弹出 macOS 文案并退出。

## 2. 修复（0.1.2）

- `config.mjs` 新增纯函数 `isPlatformSupported(platform, version, { minimumMacosMajor })`：
  - `darwin` → 校验 macOS 主版本；
  - `win32` / `linux` → 放行；
  - 未知平台 → fail-closed。
- `index.mjs` 改为平台感知检查：只有 darwin 低版本才提示 macOS 13+；非 macOS 不显示 macOS 文案；启动日志记录 platform/version/Electron。
- README 增加“系统要求/平台检查”：macOS 13+（arm64）、Windows 10+（x64）、Linux 无产物。
- 版本 0.1.2（package/lock/Info.plist/asar）。

## 3. 产物（只分发 0.1.2）

| 产物 | 大小 | SHA-256 |
|---|---:|---|
| `Deadpan-0.1.2-arm64.dmg` | 125,624,322 B | `30305470a1f13478578f03c1038802663f963e3097405619d971eb2c2d6f0d93` |
| `Deadpan-0.1.2-x64.exe` | 112,070,949 B | `72ca2ff84bb977995c4df07b4df0b9c8ed3b3dd0a7b40583ccf85ea6d6a8412f` |

- 前端快照未变：index.html `bd78257784dac098bacf2a708bac04af43c9aecc5002c2e0db22684ba0d3f060`（三树一致）。
- 旧 0.1.0/0.1.1 产物已归档到 `desktop/release/archive-0.1.0/`、`archive-0.1.1/`，不要分发。

## 4. 验证

~~~bash
node --test "desktop/test/*.test.mjs"   # 141 tests / 140 pass / 0 fail / 1 skip
cd desktop && npm test                  # 同上
cd desktop && npm run test:gui          # 1/1
cd desktop && npm run test:packaged     # 1/1（0.1.2）
~~~

- `isPlatformSupported` 全分支：win32 10.0/10.0.22631/6.1→true、linux→true、darwin 13→true、darwin 12→false、未知→false；大小写不敏感。
- index 静态防回归：不再调用旧的无条件 macOS 检查。
- 0.1.2 codesign ad-hoc + verify OK；三树快照一致；Windows locales 2 pak。
- A/T43 独立验证 28/28 PASS。

## 5. 发布阻断项（必须手工）

**Windows 10/11 真机安装 0.1.2 并启动**，确认不再弹出 macOS 13 提示、能进入登录页。本机 macOS 无法运行 Windows 包，只能完成静态/单元验证。通过后再对外分发 0.1.2。
