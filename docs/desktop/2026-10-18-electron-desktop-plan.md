# Electron 桌面端适配计划（macOS 优先）

> 版本：v0.1（方案稿）  
> 日期：2026-10-18  
> 状态：待评审 → 待实施  
> 实施分支：`feat/desktop-shell`（独立 worktree）  
> 硬约束：本计划不修改后端代码（`server/**`、`server/prisma/**`、数据库、后端 env/nginx）

---

## 0. 摘要

### 0.1 目标

在不修改后端代码的前提下，基于现有 Vue 3 + Vite 前端构建 Electron 桌面客户端：

- 形态：**B2 —— 本地 dist 打包 + 固定端口 loopback 同源反代**；
- 平台：**macOS 优先（Apple Silicon / arm64）**，Windows 10+ 跟进；
- 模式：直接 DMG 分发，**不申请 Apple Developer 账号、不公证、不上 App Store**；
- 签名：**ad-hoc 签名**（免费、无需申请），接受 Gatekeeper 手动放行；
- 更新：v0 **不做自动更新**，手动下载新 DMG 替换；
- 代码：一份前端代码，两种 shell；**不 fork client**；
- 安全：与正在做安全修复的团队并行协作，建立安全同步门禁。

### 0.2 关键决策

| 编号 | 决策 | 状态 |
|---|---|---|
| D1 | 采用形态 B2：本地静态服务 + 固定端口 loopback 反代，不改后端 | 已定 |
| D2 | 不做前端分叉；桌面壳放在 `desktop/`，共享 `client/src` | 已定 |
| D3 | 一个 `feat/desktop-shell` 分支/worktree，同时维护 macOS/Windows 构建目标 | 已定 |
| D4 | macOS 先行，只出 arm64；Windows 随后 | 已定 |
| D5 | 无 Apple Developer 账号；DMG 直发；ad-hoc 签名；不做公证 | 已定 |
| D6 | 最低 macOS 13 Ventura（Electron 44）；如目标机器有 macOS 12 再降 Electron 43 | 待系统调查确认 |
| D7 | v0 不做自动更新；手动 DMG 更新 | 已定 |
| D8 | 不修改 `server/**`；工程文件按需加载等后端优化推迟 | 铁律 |
| D9 | 发版前必须合并 master 安全修复并重建 | 铁律 |
| D10 | 体积/内存优化分两批：桌面包裁剪 + 共享前端优化 | 进行中 |

### 0.3 非目标

- 不做单机离线判题、离线数据同步；
- 不做本地文件系统/本地 IDE 式代码编辑；
- 不执行学生代码，不提供本地编译/运行；
- 不做 Mac App Store、不做 Apple 公证、不做自动更新（v0）；
- 不改后端接口、数据库、迁移、nginx、后端环境变量；
- 不做 Linux；
- 不改变移动端 `/m` 的任何行为。

---

## 1. 背景与约束

### 1.1 项目现状

| 项 | 现状 | 影响 |
|---|---|---|
| 前端 | Vue 3 + Vite + Ant Design Vue + Monaco | Electron 直接复用 |
| 后端 | Express 5 + Prisma/MySQL + AI Worker | 桌面端只能连服务端，不能打包 |
| 构建 | `client/vite.config.js`，`base: '/exam/'` | B2 反代保留该 base，前端零改动 |
| 路由 | `client/src/router/index.js` 使用 `createWebHistory('/exam/')` | 本地服务必须实现 SPA fallback |
| API | `client/src/api/request.js`，同源 `/exam/api` | B2 反代保持同源 |
| 实时 | `client/src/composables/socketConfig.js`，`/exam/socket.io` | 反代需支持 WebSocket upgrade |
| CSP | `server/src/middleware/csp.js`，默认 report-only | 本地服务需下发等价 CSP，并与安全团队同步 |
| 体积 | `client/dist` 约 44MB（Monaco 现代 15MB + legacy 14MB + assets 10MB + 文档图 5.5MB） | 桌面打包需裁剪 |
| 先例 | Capacitor Android 壳采用远程 URL 加载 | 证明“壳 + 现有 Web”的模式可行 |

### 1.2 硬约束

1. **禁止修改后端代码**：不改 `server/**`、`server/prisma/**`、数据库迁移、生产库；不新增后端接口。
2. **安全团队并行工作**：主工作区可能随时有安全修复；桌面工作必须隔离，不能切乱主工作区分支。
3. **前端版本锁进安装包可接受**：代价是每次 Web 变更都要重建桌面包，发版节奏变慢。
4. **macOS 无 Apple Developer 账号**：接受 Gatekeeper 手动放行、无自动更新、无公证。
5. **macOS 只支持 Apple Silicon**：不构建 Intel/universal；Intel Mac 不在支持范围。
6. **最低 macOS 版本待确认**：默认按 Electron 44 的 macOS 13 Ventura 执行；如有 macOS 12 目标机再评估 Electron 43。

### 1.3 形态选择：为什么是 B2

形态 B 有两个子方案：

| 维度 | B1：自定义协议 + 直连远程 API | B2：本地 loopback 同源反代 |
|---|---|---|
| 前端改动 | 需要绝对 API/WS 地址 + 运行时配置 | 0 |
| 服务端改动 | 需要 CORS/Origin 配置 | 0 |
| 页面 origin | 稳定 | 必须固定端口，否则 localStorage 登录态丢失 |
| 网络栈 | Chromium（系统代理、证书、WS 原生支持） | Node（代理、CA、WS 需自行处理） |
| 本地端口/安全面 | 无 | 有，需要加固 |
| 与 VS Code 相似度 | 高 | 中 |
| 结论 | 长期备选 | **v0 采用** |

B2 的核心原因：**零后端改动、零前端改动、验收成本最低**，与“禁止修改后端”完全兼容。B1 需要服务端 CORS/Origin 配置，等安全冻结解除后再作为可替换内容层评估。

~~~text
Electron main
├─ BrowserWindow → http://127.0.0.1:47821/exam/
├─ 本地内容服务
│  ├─ 静态 dist-desktop
│  ├─ SPA fallback（/exam/login、/exam/teacher/**、/exam/student/**、/exam/admin/**、/exam/doc）
│  ├─ /exam/api/*        → https://<server>/exam/api/*
│  └─ /exam/socket.io/*  → wss://<server>/exam/socket.io/*（WS upgrade）
├─ 配置（服务器地址）、单实例、导航白名单、下载、外链
├─ 诊断/日志（版本、内存、服务器连通性）
└─ 更新（v0 仅检查版本/手动下载，不做自动更新）
renderer
└─ 现有 client/dist SPA（完全复用，v0 不改 client/src）
~~~

**固定端口必须作为架构约束**：localStorage 的 origin 包含端口。若每次随机端口，登录态、主题、草稿节流键全部丢失。v0 固定 `127.0.0.1:47821`；端口被占用时明确报错，不静默换端口。

---

## 2. 总体架构

### 2.1 目录结构

~~~text
Exam-DeepSeek/
├─ client/                          # 共享前端（Web + Desktop renderer）
│  ├─ src/                          # v0 不改
│  ├─ vite.config.js                # 不改
│  └─ vite.config.desktop.js        # 可选，后续桌面构建裁剪用；v0 不需要
├─ desktop/                         # 新增：Electron 壳
│  ├─ package.json                  # 只放 Electron/打包依赖，独立 lockfile
│  ├─ electron-builder.yml
│  ├─ src/main/
│  │  ├─ index.mjs                  # 生命周期、窗口、单实例、安全、菜单
│  │  ├─ content-server.mjs         # 本地静态服务 + SPA fallback + CSP
│  │  ├─ proxy.mjs                  # /exam/api、/exam/socket.io 反代
│  │  ├─ config.mjs                 # 服务器地址、端口、诊断配置
│  │  ├─ security.mjs               # 导航/权限/证书/下载策略
│  │  └─ diagnostics.mjs            # 版本、内存、日志
│  ├─ src/preload/                  # 可选，极窄桥；不暴露 fs
│  ├─ scripts/
│  │  ├─ build-dist.mjs             # 从 client/dist 生成 dist-desktop（裁剪 legacy）
│  │  └─ after-pack-adhoc-sign.cjs   # macOS ad-hoc 签名
│  ├─ resources/                    # 图标、offline 页
│  └─ RELEASE.md                    # 安装/更新/回滚说明
├─ dist-desktop/                    # 桌面构建产物（gitignore）
├─ server/                          # 不改
└─ docs/desktop/                    # 本计划
~~~

### 2.2 进程模型

| 进程 | 职责 | 说明 |
|---|---|---|
| main | 窗口、本地内容服务、反代、配置、更新、安全 | 不放业务 UI |
| renderer | 现有 SPA | 与 Web 完全一致 |
| Web Worker（后续） | zip 过滤/重打包等重任务 | 与 Web 共享，v0 可不做 |
| utilityProcess（后续可选） | 本地文件系统能力 | v0 不做；若未来做本地工程编辑再引入 |

不照搬 VS Code 的 Extension Host/Shared Process：本项目没有插件体系，多开会增加内存，不是收益。

### 2.3 本地内容服务与反代

| 能力 | 要求 |
|---|---|
| 监听地址 | 仅 `127.0.0.1`，固定端口 |
| 静态资源 | `dist-desktop`；hashed assets 长缓存，`index.html` no-store |
| base | 保留 `/exam/`；`/exam` 301 到 `/exam/` |
| SPA fallback | 已知前端前缀回 `index.html`；未知路径 404 |
| API 反代 | 保留 `/exam/api` 路径，转发到服务器同路径；流式转发 |
| WebSocket | `/exam/socket.io` upgrade 转发，不缓冲 |
| 大文件 | 50MB zip 上传必须流式，不进入内存队列 |
| 超时 | 上传/长时间请求显式配置，不能套用默认短超时 |
| Host/Origin | 只接受本机 Host；转发时不要把本机 Origin 传给远端 |
| X-Forwarded-For | 不伪造；让 nginx 按真实客户端 IP 生成，避免破坏登录限流 |
| TLS | 使用 Node 默认信任链；内网 CA 通过配置注入；禁止 rejectUnauthorized:false |
| CSP | 本地服务下发与 Web 端等价策略；与安全团队同步 |
| 安全 | 不允许任意目标 URL；只允许固定服务器；防目录穿越；防本机其他程序滥用 |

### 2.4 桌面边界与前端共享

- v0 尽量 **不改 `client/src`**：B2 让 API/WS/登录态保持同源，无需平台判断。
- 如果后续必须区分桌面行为（例如关闭 Web 版本轮询），通过 `desktop` 注入 `window.__DESKTOP__` + `client/src/platform/**` 适配层实现，不改业务页面。
- 禁止在 Vue 页面散落 `if (isDesktop)`。
- 构建产物分离：桌面输出 `dist-desktop/`，绝不覆盖 `client/dist/`。

### 2.5 配置与数据

| 项 | 方案 |
|---|---|
| 服务器地址 | `app.getPath('userData')/config.json`；首启/菜单可配置；不硬编码 deadpan.asia |
| 固定端口 | 默认 47821；配置文件可改；占用时明确提示 |
| 登录态 | 继续使用 localStorage（Web 原有逻辑）；固定端口保证 origin 稳定 |
| 用户数据 | Electron userData；替换 DMG 不清理，登录态保留 |
| 证书/代理 | 支持内网 CA；系统代理策略在 spike 中验证 |
| 版本信息 | 壳版本 + 前端构建戳；诊断页展示 |

---

## 3. 分支与协作方案

### 3.1 分支/worktree

~~~bash
git worktree add ../Exam-DeepSeek-desktop -b feat/desktop-shell
~~~

- 使用独立 worktree，避免干扰安全团队的主工作区；
- 在基线提交上打 tag，便于审计：`desktop-base-2026-10-18`；
- **一个分支同时维护 macOS/Windows 构建目标**；不要建 `desktop-mac`、`desktop-win` 两个分支；
- 长分支不要 rebase，统一用 merge；
- v0 稳定后尽快把新增目录合回 master，之后用短分支迭代，避免长期偏离安全修复。

### 3.2 文件范围（v0）

| 允许新增/修改 | 说明 |
|---|---|
| `desktop/**` | 壳、配置、签名脚本、安装说明 |
| `.github/workflows/desktop-macos.yml`、`desktop-windows.yml` | 新增，路径过滤 |
| `.gitignore` | 增加 `dist-desktop/`、`desktop/release/` |
| `docs/desktop/**` | 本计划及后续文档 |
| 可选 `client/vite.config.desktop.js` | 新增配置；v0 优先用打包裁剪，不新增 |

| 禁止修改 | 原因 |
|---|---|
| `server/**`、`server/prisma/**`、数据库、后端 env | 铁律 |
| `client/src/**`（v0，尤其 api/stores/router） | 安全团队并行修改；v0 不需要 |
| `client/package.json`、根 `package.json`、`client/vite.config.js` | 避免影响 Web 构建/依赖 |
| `client/dist/**` | 构建产物；桌面输出到 `dist-desktop` |
| nginx/部署配置 | B2 不需要；分发路径变更走运维审批 |

### 3.3 合并节奏与安全同步

- **每周 merge 一次 `origin/master`**；发版前必须 merge 最新 master；
- 安全团队修复合入后：重建 → 桌面冒烟 → 安全确认 → 再发布；
- CI 硬门禁（禁止后端改动）：

~~~bash
git fetch origin
git diff --name-only origin/master...HEAD -- server/ server/prisma/
# 有输出则失败
~~~

- 可选门禁：v0 阶段禁止修改 `client/src/**`，白名单外直接失败；
- 发布 tag：`desktop-vX.Y.Z`；发布前在 `desktop/RELEASE.md` 记录基线 commit、合并 commit、校验和。

### 3.4 并行安全团队的注意事项

| 事项 | 规则 |
|---|---|
| 工作区 | 用独立 worktree，不在主工作区 `git checkout` |
| 端口 | 不占用现有 `:5173/:3000`；桌面开发用独立端口（如 Vite 5174、反代 47821） |
| 构建产物 | 不覆盖 `client/dist` |
| 依赖 | 不修改 client/server lockfile；桌面依赖放 `desktop/package.json` |
| 数据库 | 不跑迁移、不写生产库；只读已有测试账号 |
| 进程 | 不 kill 其他会话的 Electron/Node/DSH 进程 |
| 联调 | 使用测试环境/测试账号；不触发批量评分 |

---

## 4. macOS 优先实施

### 4.1 平台基线

| 项 | 结论 |
|---|---|
| 架构 | Apple Silicon（arm64）only；不做 Intel/universal |
| Electron | 当前稳定版 44.x；最低 macOS 13 Ventura |
| 最低 macOS | 默认 13.0；如有目标机 macOS 12，降 Electron 43.x（Monterey+）并记录过渡计划 |
| 不支持 | macOS 11 Big Sur 及以下（Electron 38 已 EOL，不使用） |
| 后续 Windows | Electron 44 支持 Windows 10+；Windows 7 不支持 |
| 账号 | 无 Apple Developer 账号；不公证；不 App Store |
| 签名 | ad-hoc；每次构建重新签 |
| 更新 | v0 手动 DMG；无自动更新 |

系统调查命令（发给目标教师）：

~~~bash
sw_vers -productVersion
uname -m
~~~

- 全部 ≥ 13 → Electron 44 + `minimumSystemVersion: "13.0"`；
- 任一为 12 → Electron 43.x + `minimumSystemVersion: "12.0"`，并规划系统升级；
- 出现 11 或以下 → 要求升级，不降低 Electron 版本。

启动时记录 `app.getSystemVersion()`；如低于声明最低版本，给出明确提示并退出。

### 4.2 macOS 打包配置

~~~yaml
# desktop/electron-builder.yml（示意）
appId: asia.deadpan.exam.desktop
productName: Deadpan 判题
directories:
  output: release
  buildResources: resources
files:
  - src/**/*
  - package.json
extraResources:
  - from: ../dist-desktop
    to: dist
asar: true
electronLanguages:
  - zh-CN
  - en-US
afterPack: scripts/after-pack-adhoc-sign.cjs
mac:
  target:
    - target: dmg
      arch: [arm64]
  identity: null
  hardenedRuntime: false
  gatekeeperAssess: false
  notarize: false
  minimumSystemVersion: "13.0"
  category: public.app-category.education
dmg:
  artifactName: Deadpan-0.1.0-arm64.dmg
~~~

构建环境设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`，避免 electron-builder 尝试寻找 Developer ID。

### 4.3 ad-hoc 签名

~~~js
// desktop/scripts/after-pack-adhoc-sign.cjs
const { execFileSync } = require('node:child_process');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = context.appOutDir + '/' + context.packager.appInfo.productFilename + '.app';
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
~~~

验证：

~~~bash
codesign -dv --verbose=4 "Deadpan 判题.app"
# 期望 Signature=adhoc

codesign --verify --deep --strict --verbose=2 "Deadpan 判题.app"
# 期望通过

spctl --assess --type execute -vv "Deadpan 判题.app"
# 期望被拒绝；ad-hoc 不会通过 Gatekeeper
~~~

- `--deep` 仅用于内部 ad-hoc 重签；若遇到嵌套框架签名问题，改用 @electron/osx-sign 或递归签署；
- 不要用 Developer ID 的自签证书冒充信任；自签名也不能通过 Gatekeeper；
- 不要使用 `spctl --master-disable` 全局关闭 Gatekeeper。

### 4.4 安装与更新

**安装文档必须包含：**

1. 校验 SHA-256；
2. 打开 DMG，把 App 拖入“应用程序”；
3. 首次启动：系统设置 → 隐私与安全性 → “仍要打开”（macOS 15/26）；旧系统右键 → 打开；
4. 如提示“已损坏”：
   ~~~bash
   xattr -dr com.apple.quarantine "/Applications/Deadpan 判题.app"
   ~~~
   确认校验和后再执行；
5. 如询问“本地网络”权限，允许（连接校内服务器需要）。

**更新流程（v0）：**

- 退出 App → 下载新 DMG → 替换 → 重新打开；
- userData 中的登录态/配置保留（固定端口 + 稳定 appId）；
- 每个新 build 的 ad-hoc 指纹不同，Gatekeeper 可能再次拦截，安装文档复用；
- 无自动更新；安全补丁需人工分发，需定义 SLA。

**可选（后续）：** 在下载服务器放静态 `latest-mac.json` 做版本提示；属于运维静态文件，不是后端代码，需与运维/安全确认。v0 不做。

### 4.5 macOS 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 无 Developer ID / 无公证 | Gatekeeper 拦截，安装摩擦 | 安装文档 + xattr/仍要打开；内部渠道 |
| ad-hoc 签名失败 | App 无法启动/提示损坏 | afterPack 重签 + codesign 验证 |
| 最低 macOS 不匹配 | 旧机器无法启动 | 先调查 sw_vers；按 Electron 支持范围定 |
| 本地网络权限 | 无法连接校内服务器 | Info.plist 增加 NSLocalNetworkUsageDescription，真机验证 |
| 每次更新重新拦截 | 用户体验差 | 接受；或后续申请 Developer ID |
| 无自动更新 | 安全修复滞后 | 人工分发 SLA；版本检查提示 |
| 无稳定签名身份 | TCC 权限可能重复弹 | 固定 appId；更新说明；接受 |
| Apple Silicon only | Intel Mac 不可用 | 明确不支持；文档标注 |
| Electron 升级周期 | 每 8 周新大版本，安全支持最近 3 个 | 固定版本 + 每季度升级窗口 |

### 4.6 Windows 跟进

- 同一 `desktop/` 壳，新增 Windows target；
- 产物：NSIS 安装包；支持 Windows 10/11；
- 签名：如无代码签名证书，SmartScreen 会提示；内部试用可接受，学生规模化再决定是否采购；
- 测试：干净 Windows 10/11 VM、DPI 125%/150%、中文输入法、文件下载、外链、50MB 上传；
- 证书采购有周期，若决定签名，提前启动；
- 不建 Windows 专用分支，平台差异只放 electron-builder 配置/CI。

---

## 5. v0 功能范围与验收

### 5.1 功能范围（必须）

- 登录、多学校选择、401 过期重登；
- 学生编程题：Monaco 编辑、语言切换、格式化、草稿自动保存、交卷、成绩展示；
- 实训题：zip 上传（50MB、前端过滤重打包）、文件树、只读回看、版本提交；
- 教师：题库/作业/审核、双包对照、只读代码、xlsx 导出；
- Socket.IO 实时刷新；
- 使用文档、图片、外链、下载；
- 服务器不可达/断网提示与重试；
- 单实例、固定端口、退出/切换账号清理策略；
- 诊断页：壳版本、前端构建戳、服务器地址、内存、日志路径。

### 5.2 非目标（v0）

- 本地文件系统编辑、本地 IDE、代码运行/编译；
- 离线判题/离线数据；
- 自动更新、公证、App Store；
- 新增后端接口、修改数据库；
- Linux、Intel Mac；
- 移动端修改。

### 5.3 验收清单

**功能**

- [ ] 登录、多学校选择、401 重登
- [ ] 编程题编辑、格式化、草稿、交卷
- [ ] 实训题 50MB 上传、文件树、只读回看、版本提交
- [ ] 教师审核双包、只读代码、xlsx 导出
- [ ] Socket 实时刷新
- [ ] 文档图片、外链、下载
- [ ] 服务器不可达提示与重试
- [ ] 单实例、端口占用提示、固定端口登录态保留

**打包/安装**

- [ ] arm64 DMG 在 M1/M2/M3 启动
- [ ] ad-hoc 签名验证通过
- [ ] 干净 Mac Gatekeeper 流程按文档可完成
- [ ] 最低 macOS 13（或 12）真机验证
- [ ] 手动替换新 DMG 后登录态/配置保留
- [ ] 无 Developer ID/无公证，验收不把 spctl 失败当缺陷

**安全**

- [ ] contextIsolation=true、sandbox=true、nodeIntegration=false、webSecurity=true
- [ ] 导航白名单、外链白名单、权限请求默认拒绝
- [ ] 本地反代仅绑 loopback、固定端口、Host/Origin 校验、无任意目标
- [ ] 不绕过证书校验；不伪造 XFF；不破坏服务端限流
- [ ] CSP 与 Web 端策略一致
- [ ] 未签名分发风险接受记录在案；提供 SHA-256
- [ ] 安全团队评审通过

**约束**

- [ ] `git diff` 无任何 `server/**` 改动
- [ ] 已 merge 最新 master 与安全修复
- [ ] client/dist 未被覆盖
- [ ] 独立 worktree，未干扰主工作区

**性能**

- [ ] 启动/内存基线已记录
- [ ] 首屏可交互时间、登录后可交互时间达标（目标待基线校准）
- [ ] 50MB 上传不冻结 UI

### 5.4 测试矩阵

| 维度 | 必测 |
|---|---|
| 机器 | M1、M2/M3 至少各一台；8GB 内存机器优先 |
| macOS | 最低支持版本（13 或 12）+ 当前最新版本 |
| 账户 | 干净用户；无开发工具；非管理员权限安装 |
| 网络 | 直连、校园内网、断网、代理环境（如适用） |
| 工程 | 50MB 包、文件数多、中文文件名、超大单文件 |
| 流程 | 首次安装、更新替换、退出重登、切换账号 |
| 安全 | Gatekeeper、本地网络权限、外链、下载、证书错误 |
| 长会话 | 30 分钟审核，内存增长可接受 |

---

## 6. 性能与体积计划

### 6.1 先测基线

在 P0 记录：

- 冷启动到登录页可交互；
- 登录到首个路由可交互；
- 空闲内存、编辑器页内存、审核页内存；
- 50MB 上传耗时/内存峰值；
- installer 体积、dict 体积。

工具：

- `app.getAppMetrics()` / `webContents.getProcessMemoryInfo()`；
- Chromium DevTools Performance/Memory；
- Playwright Electron 冒烟；
- 诊断页导出上述信息。

### 6.2 体积优化（桌面包优先）

| 动作 | 预期 | 风险 |
|---|---|---|
| 排除 `monaco-legacy/` 与 `*-legacy-*.js`、`polyfills-legacy-*.js` | -18MB 左右 | 无（现代 Chromium 不加载） |
| electron-builder `electronLanguages` 只留 zh-CN/en-US | 数 MB | 低 |
| asar + 最大压缩 | installer 下降 | 低 |
| 文档图片转 WebP/压缩（共享） | -3~4MB | 低，检查清晰度 |
| Monaco NLS/语言裁剪（共享） | -2~3MB | 中，需回归高亮 |
| antd 按需引入（共享） | 入口下降、CSS-in-JS 内存下降 | 中，57 个页面需视觉回归 |
| xlsx/mammoth 点击时动态 import（共享） | 路由 chunk 更轻 | 低 |
| 不裁剪 Monaco workers | 保留“格式化”能力 | 裁剪会破坏 JS/TS/JSON/CSS/HTML 格式化 |

**目标（待基线校准）：** dist ≤ 25MB，installer ≤ 130MB。Electron 本体是固定成本，不承诺 Tauri 级别体积。

### 6.3 内存/数据链路

- **最大风险：实训题审核页**同时持有标准包 + 学生包的全部 `contents`；服务端单文件上限 1MB，总大小无上限。由于禁止改后端，v0 只能客户端缓解：LRU、关闭 tab 释放 model、限制同时保留文件数、避免深拷贝。
- **待后端解冻后的第一优先项：** 审核接口只返回 tree + 元数据，单文件按需取；预计同时降低网络、JSON 解析、内存。此项不在本分支实施。
- CodeEditor 卸载时 `editor.getModel()?.dispose()`；项目工作区 `closeTab` 释放 model；长作业限制同时挂载编辑器数。
- 大表格按需虚拟化（先确认现有分页）。
- zip 过滤移入 Web Worker（共享，后续）。
- 路由切换取消未完成请求、disconnect socket、清定时器。

### 6.4 启动与稳定性

- 窗口 `show: false` + `ready-to-show`；本地服务 listen 后再加载；
- 桌面下关闭 Web 版本轮询（`appVersion.js`）或改为壳更新检查；v0 可先保留（本地 fetch，无害）；
- socket 只在审核页建连（现状即如此）；
- 捕获 `render-process-gone`、`unresponsive`、`child-process-gone`；
- 崩溃日志、诊断页、单实例、下载保存对话框、外链白名单；
- 生产禁用 DevTools（仅提高门槛，不是安全边界）。

---

## 7. 安全设计

### 7.1 Electron 基线

~~~text
contextIsolation: true
sandbox: true
nodeIntegration: false
webSecurity: true（禁止关闭）
session.setPermissionRequestHandler：默认拒绝
setWindowOpenHandler：外链白名单或拒绝
will-navigate：只允许本地内容服务 origin
生产禁用 DevTools
单实例锁
~~~

### 7.2 本地反代安全

- 只绑 `127.0.0.1`；
- 固定端口；
- 校验 `Host` 只为本机；
- 只允许固定远端服务器，不接受任意 URL（防 SSRF/代理滥用）；
- 静态路径规范化，禁止目录穿越；
- 不把本机 `Origin` 透传给远程；不伪造 `X-Forwarded-For`；
- WebSocket upgrade 单独校验；
- TLS 不允许 `rejectUnauthorized:false`；
- CSP/安全头由本地服务下发，与 Web 策略对齐；
- 如需进一步隔离，可加每次启动随机 token，但 v0 至少完成 Host/Origin/固定目标校验。

### 7.3 无签名分发风险

| 风险 | 缓解 |
|---|---|
| 安装包可被替换 | 内部 HTTPS + SHA-256 校验 + 限制分发渠道 |
| 用户被训练忽略 Gatekeeper | 安装文档说明来源；不全局关闭 Gatekeeper |
| 无法证明发布者 | 明确内部试用定位；大规模学生分发前重新评估 Developer ID |
| 无自动更新 | 人工分发 SLA；版本提示；考试期冻结 |

**风险接受记录**：无 Apple Developer 账号、无公证、无自动更新，v0 仅用于内部/教师试点。若扩大范围，需重新评审。

### 7.4 安全团队评审点

- Electron 安全基线（7.1）；
- 本地反代与 loopback 服务（7.2）；
- 未签名分发风险接受（7.3）；
- CSP 与 Web 端同步；
- 更新/回滚流程（即使 v0 手动）；
- 并行开发的文件边界与合并门禁。

---

## 8. 实施阶段与里程碑

| 阶段 | 内容 | 产出 | 估计 |
|---|---|---|---|
| P0 Spike | worktree、Electron 壳、固定端口本地服务/反代、核心链路冒烟、基线测量 | 可运行的本地桌面包 | 3–5 天 |
| P1 可安装 Mac 包 | electron-builder、arm64 DMG、afterPack ad-hoc、Gatekeeper 安装文档、菜单/下载/外链、单实例、配置 | 可交付的 DMG | 1–2 周 |
| P2 安全与 CI | Electron 加固、反代安全、诊断页、macOS CI、Playwright 冒烟、安全评审 | 安全评审通过 | 1 周 |
| P3 Windows | Windows target/NSIS、DPI/IME/下载/外链测试、签名决策 | Windows 安装包 | 1–2 周 |
| P4 性能优化 | 桌面包裁剪、共享前端优化（antd/懒加载/model/worker） | 体积/内存改善报告 | 2–3 周 |

**依赖/阻塞：**

- 无 Apple Developer 账号：不阻塞，按 ad-hoc + 手动分发；
- 后端冻结：不阻塞 B2，但“工程文件按需加载”推迟；
- 安全团队并行：合并节奏决定发版时间；
- Windows 签名证书：如决定签名，需提前采购；
- macOS 最低版本：需目标机器 sw_vers 调查。

---

## 9. 发布与运维

### 9.1 版本与产物

- 壳版本：`desktop-vX.Y.Z`；
- 产物：`Deadpan-X.Y.Z-arm64.dmg` + `SHA256SUMS.txt`；
- 前端构建戳随包记录（`__BUILD_VERSION__`）；
- 发布说明：`desktop/RELEASE.md`。

### 9.2 发布流程

1. merge `origin/master`（含最新安全修复）；
2. 构建 `client/dist` → 生成 `dist-desktop`（裁剪 legacy）；
3. 构建 DMG + ad-hoc 签名；
4. 运行功能/安全冒烟；
5. 安全团队确认（特别是新的安全修复）；
6. 生成 SHA-256、发布说明；
7. 内部渠道分发；
8. 保留上一版 DMG 用于回滚。

### 9.3 更新与回滚

- v0 手动更新：退出 → 下载 → 替换 → 打开；
- 回滚：重新安装上一版 DMG；userData 保留；
- 每次更新可能重新触发 Gatekeeper，安装文档复用；
- 版本提示：v0 可由发布说明/群通知；后续可加静态 `latest-mac.json`（非后端代码）。

### 9.4 安全补丁 SLA

- 高危安全修复：合并后 1 个工作日内重建并分发（内部试点范围）；
- 考试窗口期：冻结更新，提前完成安全同步；
- 每次发版前确认无 `server/**` 修改；
- 无自动更新意味着必须主动通知用户，建立分发名单/群。

---

## 10. 风险登记

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Gatekeeper 安装摩擦 | 高 | 中 | 安装文档、校验和、内部渠道 |
| ad-hoc 签名失败 | 中 | 高 | afterPack + codesign 验证 |
| 最低 macOS 不匹配 | 中 | 中 | sw_vers 调查；Electron 44/43 选择 |
| 无自动更新导致安全补丁滞后 | 高 | 中 | 分发 SLA、版本通知 |
| 无签名包被替换 | 中 | 中 | HTTPS + SHA-256 + 内部渠道 |
| 本地反代引入新攻击面 | 中 | 高 | 安全评审、loopback、固定目标 |
| 固定端口被占用 | 低 | 中 | 明确报错；配置可改 |
| Node 反代不走系统代理 | 中 | 中 | spike 验证；必要时 B1 备选 |
| 工程文件大导致内存高 | 高 | 中 | 客户端 LRU；后端解冻后按需接口 |
| 安全团队并行冲突 | 中 | 高 | worktree、文件边界、每周 merge、CI 门禁 |
| Electron 版本 EOL | 中 | 中 | 固定版本 + 季度升级 |
| 前端版本锁死导致功能滞后 | 高 | 中 | 接受；建立定期发布节奏 |

---

## 11. 待确认事项

1. 目标 Mac 的 `sw_vers` 调查结果：是否全部 ≥ macOS 13？
2. 是否接受 macOS 12 用户（Electron 43）还是要求升级？
3. Windows 是否也需要代码签名证书，还是接受 SmartScreen 手动放行？
4. 分发渠道：校内 HTTPS 文件服务器 / 网盘 / MDM？
5. 安全团队对“无签名、无公证、无自动更新”的风险接受结论？
6. v0 是否限定教师/内部，还是直接面向学生？
7. 性能优化的共享前端改动（antd 按需等）何时做，是否会与安全修复冲突？
8. 桌面版本发布频率与安全补丁 SLA 的正式约定。

---

## 12. 参考

- Electron 平台支持（当前 44.x，macOS Ventura+，Windows 10+）：https://github.com/electron/electron#platform-support
- Electron 43.x 平台支持（macOS Monterey+）：https://github.com/electron/electron/tree/43-x-y#platform-support
- Electron 安全清单：https://www.electronjs.org/docs/latest/tutorial/security
- Electron 性能建议：https://www.electronjs.org/docs/latest/tutorial/performance
- Apple：打开来自未知开发者的 Mac App：https://support.apple.com/zh-cn/guide/mac-help-cn/mh40616/26/mac/26
- Electron 代码签名：https://www.electronjs.org/docs/latest/tutorial/code-signing
- 仓库现有部署/约束：`nginx-exam.conf`、`docs/mobile-app/06-platform-strategy.md`、`docs/dsh/00-铁律与上下文预算.md`

---

## 13. 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-10-18 | v0.1 | 初稿：B2 架构、分支策略、macOS 优先、ad-hoc/无账号分发、最低 macOS 13、安全同步门禁 |
