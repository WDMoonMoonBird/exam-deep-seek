# desktop/ —— Electron 桌面壳（Round 1 脚手架）

形态 **B2**：本地 `dist-desktop` 静态内容服务 + 固定端口 loopback 同源反代，**零后端改动、零前端改动**。
详见 `docs/desktop/2026-10-18-electron-desktop-plan.md` 与 `docs/desktop/team/CONVENTIONS.md`。

## 目录 / 职责（一模块一职责，目标 ≤300 行、硬上限 400）

| 文件 | 职责 | 依赖 |
|---|---|---|
| `src/main/config.mjs` | 配置模型 + 校验 + userData 读写（纯逻辑） | node:fs/path（可注入） |
| `src/main/path-safety.mjs` | 路径规范化 / SPA fallback 分类 / 防目录穿越（纯函数） | node:path |
| `src/main/csp.mjs` | 等价 CSP + 安全响应头构造（纯函数） | 无 |
| `src/main/proxy-headers.mjs` | 反代头处理 + Host 白名单（纯函数） | 无 |
| `src/main/security-policy.mjs` | Electron 安全策略纯决策（导航/外开/权限/下载） | 无 |
| `src/main/content-server.mjs` | 本地静态内容服务（仅 127.0.0.1；start/stop） | http/fs + path-safety + csp + static-assets |
| `src/main/static-assets.mjs` | MIME / 缓存策略 / 流式文件响应（纯 IO 封装） | node:fs/path（可注入） |
| `src/main/proxy.mjs` | 固定远端 HTTP/WS 反代（流式） | http/https/stream + proxy-headers |
| `src/main/security.mjs` | 把安全决策装配到 session/webContents（无算法） | security-policy |
| `src/main/index.mjs` | 组合根：单实例/窗口/启停/崩溃处理（≤200 行） | 以上全部 |
| `src/preload/index.cjs` | 极窄桥（只读平台信息，不暴露 fs/ipc） | electron contextBridge |
| `scripts/build-dist.mjs` | `client/dist` → `dist-desktop` 裁剪 legacy | node:fs/path |
| `scripts/after-pack-adhoc-sign.cjs` | macOS ad-hoc 重签名 | node:child_process |

## 系统要求 / 平台检查

- **macOS**：13.0 Ventura 或更高（Electron 44 基线；打包配置 `mac.minimumSystemVersion=13.0`），仅 Apple Silicon（arm64）。
- **Windows**：**Windows 10 或更高**（x64；Electron 44 支持范围；NSIS 安装包无额外最低系统字段）。
- **Linux**：v0 不提供产物（未验证）。
- 启动时按平台检查（`config.mjs` 的 `isPlatformSupported(platform, version)`）：
  - `darwin` → 校验 macOS 主版本（低于 13 才提示「需要 macOS 13+」）；
  - `win32` / `linux` → 放行（不再把 Windows 10.x 误当 macOS 版本比较）；
  - 未知平台 → 拒绝启动（fail-closed）。
- 启动日志会记录 `platform/version/Electron`，诊断时先看这一行。

## 开发

```bash
cd desktop && npm install        # 只装 desktop 依赖（electron / electron-builder / playwright-core），不装 client/server
npm run build:dist               # 需要 client/dist 已构建；输出仓库根 dist-desktop/
npm run build:dist:dry           # 只打印 legacy 裁剪计划，不写盘

# npm allow-scripts 策略会跳过 electron postinstall；首次需要 dev Electron binary 时手动执行：
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron --version   # → v44.9.0

npm start                        # 启动 Electron（端口 47821）
```

> 注意：本环境若导出 `ELECTRON_RUN_AS_NODE=1`，`electron --version` 会打印 Node 版本而非 Electron 版本；
> 用 `env -u ELECTRON_RUN_AS_NODE` 验证。`node_modules/electron/dist/version` 应等于 `44.9.0`。

## 测试

```bash
cd desktop && npm test                       # = node --test test/*.test.mjs（纯模块/服务/打包静态）
cd desktop && npm run test:gui               # = node --test test/gui-smoke.test.mjs（C 提供；需 dev Electron binary）
cd desktop && node --test test/*.test.mjs    # Node 内置 node:test；不启动 Electron
```

GUI 冒烟用 `playwright-core` 的 `_electron` 驱动（仅 devDependency，**不下载浏览器**；Electron 二进制由 `electron` 包提供）。

> 注：本仓库 Node（v24）下 `node --test test/`（目录位置参数）会报 MODULE_NOT_FOUND，必须用 glob 或 `node --test`（cwd=desktop）。

纯模块（config/path-safety/csp/proxy-headers/security-policy/security/content-server/proxy/static-assets/build-dist）均可在普通 Node 下 `import`；
`content-server` 支持 `port: 0`，测试用 `127.0.0.1:0` 启停。

## 配置

`<userData>/config.json`（macOS：`~/Library/Application Support/Deadpan-Exam-Desktop/config.json`）。

**首次启动**：自动生成配置，`serverUrl` 默认为 `https://deadpan.asia`（v0.1.1 起不再写空串）。
若检测到已有配置的 `serverUrl` 为空（v0.1.0 首启模板问题），启动时会**自动迁移修复**
（补默认值，保留 `port`/`externalOrigins`/`caFile` 等字段），无需手动编辑。

**修改服务器地址**：编辑上述 `config.json` 的 `serverUrl` → 完全退出 App → 重新打开（端口 47821 固定）。

```json
{ "serverUrl": "https://deadpan.asia", "port": 47821, "externalOrigins": [], "caFile": null }
```

- `serverUrl`：固定远端服务器 **origin**，**默认 `https://deadpan.asia`**（可改；空白会被自动迁移修复；
  可配置内网 CA `caFile`，但不提供关闭证书校验的开关）。
  **生产分发必须使用 https**；配置成 `http://` 时启动会打警告（令牌/数据明文传输，仅限本机开发联调）。
- `port`：本地固定端口（默认 47821，1024–65535，禁占 3000/5173）；端口决定 localStorage origin，**不能随机换端口**。
- `externalOrigins`：允许交给系统浏览器打开的外链白名单（仅 https；默认空 = 全部拦截）。

> ⚠️ 切换 `serverUrl` 后请**退出登录并清理登录态**：token 存在 localStorage 且按 origin 存储，旧 token 会被发往新服务器。

## 本地服务安全/运行口径（R1 修复后）

- **Origin 校验**：HTTP 与 WebSocket upgrade 同规则 —— 请求带 `Origin` 时**必须严格等于** `http://127.0.0.1:<port>`，否则 403；
  无 `Origin`（导航/同源 GET）放行。只"剥离 Origin 不清洗请求"不够，入站侧必须拒绝。
- **CSP 默认 enforce**：本地内容服务响应默认下发 `Content-Security-Policy`（与 Web 端 nginx enforce 一致，指令串逐条等价）；
  可用 `env.CSP_MODE=report-only` 回退观察模式、`CSP_MODE=off` 关闭。`csp.mjs` 纯函数默认仍是 report-only（单测口径不变）。
- **显式长超时**：`server.requestTimeout = 15 分钟`、`headersTimeout = 60 秒`（50MB 慢网上传/长轮询不套用 Node 默认 5 分钟）。
- **source map 永不外发**：`*.map` 请求一律 404（与 Web 端 nginx 口径一致）。
- **build-dist 输出约束**：真实 CLI 的 `--out` 必须位于仓库根内且不得等于仓库根（否则 exit 2，且不会执行删除）；
  程序化调用（测试用临时目录）不受此约束，但仍禁止输出目录与源目录重叠或为文件系统根。

## 构建 DMG（macOS arm64 / ad-hoc / 无公证 / 无自动更新）

```bash
npm run dist:mac     # CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac --arm64
# 网络无法直连 GitHub 时改用镜像（仅影响 electron zip 下载，不改构建配置）：
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
npm run dist:mac
```

- 产物：`desktop/release/Deadpan-<version>-arm64.dmg`；发布附 SHA-256。
- 图标：`resources/icon.icns`（由 `client/resources/icon.png` 经 iconset 生成，见 `resources/README.md`），`mac.icon` 已指向它。
- Node：`engines.node >=22.12`；`desktop/package-lock.json` 的 `resolved` 全部指向**官方 registry**（npmjs.org），
  本机若需镜像加速 `npm install`，请用 `--registry=https://registry.npmmirror.com/` 临时覆盖，不要提交镜像 URL 的 lockfile。
- 签名：afterPack 用 `codesign --force --deep --sign -`（ad-hoc）；Gatekeeper **不会**通过（预期），
  首次安装按「系统设置 → 隐私与安全性 → 仍要打开」；如提示已损坏，核对 SHA-256 后
  `xattr -dr com.apple.quarantine "/Applications/Deadpan 判题.app"`。
- 无自动更新、无公证、无 Apple Developer 账号、仅 arm64（Intel Mac 不支持）。

## 构建 Windows（x64 / NSIS / 无签名 / 无自动更新）

```bash
cd desktop
npx electron-builder --win nsis --x64            # 产物：desktop/release/Deadpan-<version>-x64.exe + win-unpacked/
# 需镜像时（本机网络常访问不了 GitHub）：
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
npx electron-builder --win nsis --x64
```

- 配置：`win.target=nsis`、`arch=x64`、`icon=resources/icon.ico`、`artifactName=Deadpan-<version>-x64.<ext>`；
  NSIS `oneClick:false`、`perMachine:true`、`allowToChangeInstallationDirectory:true`。
- **无代码签名**（无证书/无 signtoolOptions）：安装时 SmartScreen 会提示「未知发布者」，内部试用可接受；
  v0 不接 publish / autoUpdater，手动分发安装包。
- **交叉构建（实测）**：electron-builder 26.15.3 在 macOS 上可直接构建 NSIS，**不需要 wine**
  （exe 资源编辑由 app-builder 原生完成）。首次构建经镜像下载 electron win32-x64 zip、`nsis-203.0.113.10`、
  `nsis-resources-3.4.1`、`7zip-darwin-arm64`；离线机器需预置缓存。
- **locale（W1 修复）**：必须**按平台**配置 —— `mac.electronLanguages=[zh_CN,en]`（匹配 `*.lproj`）、
  `win.electronLanguages=[en-US,zh-CN]`（匹配 `locales/*.pak`）。**不要用全局 electronLanguages**：
  mac 命名用于 win 会全不匹配 ⇒ `win-unpacked/locales` 被清空。
  Windows 产物 `win-unpacked/locales/` 应恰为 `en-US.pak` + `zh-CN.pak`（约 1.18 MB）。
- Windows 10/11 均受 Electron 44 支持；不提供 32 位/arm64 Windows 目标。

## 本期口径与已知限制

- **legacy 裁剪**：只裁 `monaco-legacy/`、`*-legacy-*.js`、`polyfills-legacy-*.js`（Electron 44 Chromium 不需要旧内核）；
  **不裁**现代 `monaco/vs/**`（含 worker，格式化依赖），也不裁 `error-pages/`。
- **preload 为 `.cjs`**：`sandbox:true` 下不支持 ESM preload（A 基线 §3.4）；不得为迁移到 `.mjs` 关闭 sandbox。
- **包洁癖**：`build-dist` 跳过 `.DS_Store`（统计口径：`copied` 不含噪声，`noise/noiseBytes` 单列并写入 manifest）；
  electron-builder `extraResources.filter` 排除 `.desktop-build.json` 与 `**/.DS_Store`（legacy 裁剪规则不变）。
- **不支持旧内核 / 本机开发端口**：桌面不跑 Vite（5173）与后端（3000）；反代只连配置的远端服务器。
- **Round 1 范围**：可测试脚手架；未安装依赖、未启动 GUI、未跑 DMG、未做诊断页/菜单/自动更新/公证。
- `client/dist` 只读：构建产物一律输出到仓库根 `dist-desktop/`（已 gitignore）。
