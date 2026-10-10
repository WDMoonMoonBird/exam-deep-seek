# monaco-legacy —— 旧内核（Chrome < 88）用的 Monaco **0.24.0** 运行时（vendored 资产）

## 为什么在这里
R-1（生产依赖公网 CDN）修复的一部分：现代内核走 `<base>/monaco/vs`（monaco-editor@0.55.1，
见 `client/vite.config.js` 的 `monacoLocalVs()`）；而本项目的兼容分流
（`client/src/infrastructure/monaco/legacyLoaderCompat.js`，Chrome < 88 判定见 `domain/browserCompat.js`）
原先把 `paths.vs` 指向 `https://cdn.jsdelivr.net/npm/monaco-editor@0.24.0/min/vs`。
校园网无外网时，**旧内核（正是校园机房里最可能遇到的）上编辑器完全不可用** —— 所以 0.24.0 也必须本地提供。
本目录就是那份资产：与原 CDN **同源同版本**，只是改由本站（Vite publicDir）提供，离线可用。

## 来源与版本（可复算）
| 项 | 值 |
|---|---|
| 包 / 版本 | `monaco-editor@0.24.0`（MIT，见同目录 LICENSE） |
| 取得方式 | `npm pack monaco-editor@0.24.0`（**一次性取用，不写进 package.json 依赖**） |
| npm integrity（sha512） | `sha512-o1f0Lz6ABFNTtnEqqqvlY9qzNx24rQZx1RgYNQ8SkWkE+Ka63keHH/RqxQ4QhN4fs/UYOnvAtEUZsPrzccH++A==` |
| npm shasum（sha1 of tarball） | `990b55096bcc95d08d8d28e55264c6eb17707269` |
| tarball sha256（本机复算，取前 20 位） | `4c9f42ebb1a35dcb2ee0` |
| 提取日期 | 2026-10-10 |
| 内容 | `min/vs` 全量 94 个文件 / 11 MB：`loader.js`、`editor/editor.main.js`+`css`+`nls`、`basic-languages/`、`language/`（TS/JSON/CSS/HTML worker）、`base/worker/workerMain.js` |
| 版本选择依据 | 见 `legacyLoaderCompat.js` 文件头（0.25+ 起有可选链 `?.`、0.34.1 含 `??`，旧内核无法解析；0.24.0 无这些语法、worker 为 classic script，兼容 Chrome 69） |

### 重新提取（复现）
```bash
npm pack monaco-editor@0.24.0
tar -xzf monaco-editor-0.24.0.tgz package/min/vs package/LICENSE
cp -R package/min/vs   client/public/monaco-legacy/vs
cp     package/LICENSE client/public/monaco-legacy/LICENSE
```

## 怎么用
- `legacyLoaderCompat.js`：`LEGACY_MONACO_VS = import.meta.env.BASE_URL + 'monaco-legacy/vs'`
  → 生产/开发都是 `/exam/monaco-legacy/vs`（随 vite `base` 走，不写死前缀）。
- Vite 的 publicDir 会在 **dev 直接服务**、**build 原样拷到 `dist/monaco-legacy/vs`**；
  nginx 由既有 `location /exam/`（alias 到 dist）静态服务，**无需改 nginx 配置**。
- 布局必须整目录保留：AMD 入口 `editor/editor.main.js` 会按 `vs/` 相对路径再取
  `basic-languages/`、`language/*.js`（worker main）与 `base/worker/workerMain.js`。

## 如何升级（例如将来要换 0.25.x 之上的版本）
1. 先确认新版本对旧内核仍可解析（在 Chrome 69 目标上验证——本目录选型就是为了这一点，通常**不需要**升级）；
2. 用上面「重新提取」的命令取新版 `min/vs`，校验 npm integrity/shasum 后**整目录替换** `vs/`；
3. 同步更新本文件的版本与哈希，并在提交信息里写明替换原因；
4. 复算：`cd client && npm run build && grep -rl jsdelivr dist/assets | wc -l`（应为 **0**，
   见 `vite.config.js` 的 `monacoLocalVs()` 构建期守卫）与
   `node tests/t15/probe-monaco.mjs ... legacy=1`（强制旧内核分支的断网可用性探针）。

## 许可
monaco-editor 为 MIT 许可；完整许可文本见同目录 `LICENSE`（随 npm 包一起分发，未改动）。
