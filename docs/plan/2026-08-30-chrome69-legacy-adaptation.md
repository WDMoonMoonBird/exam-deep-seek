# Chrome 69（旧机房 Win7）前端适配方案

- 日期：2026-08-30
- 状态：已确认（机房无法升级 Chrome，Chrome 109 退路排除）
- 适用范围：`client/`（Vue 3.5 + Vite 8 + Ant Design Vue 4 + Monaco 0.55 + Tiptap 3）

## 1. 背景与结论

旧机房为 Win7 + Chrome 69（2018-09 版本），且镜像无法更新。Chrome 69 相对现代浏览器缺失：

- **语法**：可选链 `?.`、空值合并 `??`（Chrome 80+）、逻辑赋值 `??=`（85+）
- **JS API**：`globalThis`（71）、`queueMicrotask`（71）、`Promise.allSettled`（76）、`Object.fromEntries`（73）、`String.matchAll`（73）、`Array.at`（92）、`structuredClone`（98）、`crypto.randomUUID`（92）等
- **CSS**：`inset` 简写（87）、flex `gap`（84）、`:has()`（105）、`backdrop-filter`（76）等

**结论：采用「同一份源码 → 双构建产物 → 浏览器自选」的方案（@vitejs/plugin-legacy），
不采用「UA 检测后维护两套前端代码」。**

理由：

1. UA 嗅探脆弱且无必要；`module`/`nomodule` + 内嵌特性检测脚本让浏览器自己选，不会误判。
2. 两套手写代码必然漂移，维护成本翻倍；双构建产物来自同一份源码，永远一致。
3. plugin-legacy 8.2.3 已支持本项目使用的 Vite 8（peerDependencies: `vite: ^8.0.0`）。

## 2. 现状核实结果（2026-08-30 扫描）

### 2.1 JS 运行时 API

| 来源 | 命中 | 处理方式 |
|---|---|---|
| 自有代码 | `Promise.allSettled` ×3（`client/src/views/student/Submit.vue:688`、`Submit.vue:810`、`client/src/views/teacher/ReviewDetail.vue:501`） | core-js polyfill 自动补，无需改代码 |
| 依赖包 | vue / socket.io-client / engine.io-client / ant-design-vue 产物引用 `globalThis` | core-js polyfill（esbuild 只降语法不补 API，这正是必须上 plugin-legacy 的原因） |
| 自有代码 | 未使用 `structuredClone` / `randomUUID` / `queueMicrotask` 等 | 无需处理 |

### 2.2 CSS（plugin-legacy 不转译 CSS，需手改）

| 特性 | 位置 | 影响 | 处理 |
|---|---|---|---|
| `inset: 0`（Chrome 87+） | `client/src/components/RichEditor.vue:229`、`client/src/views/Doc.vue:991`、`client/src/views/teacher/ProjectReviewNew.vue:605`、`client/src/views/teacher/ProjectQuestionEdit.vue:581` | **功能性破坏**：绝对定位失效，遮罩/空态层整体错位 | **必须修**：展开为 `top:0; right:0; bottom:0; left:0` |
| flex `gap`（Chrome 84+） | `ProjectReviewNew.vue:605`、`ProjectQuestionEdit.vue:581` 等 | 视觉降级：间距消失 | 可接受；追求完美时换 margin |
| `backdrop-filter`（Chrome 76+） | 各 Layout 顶栏、`Doc.vue:998` | 已有 `@supports not (...)` 降级 | ✅ 无需处理 |

### 2.3 构建配置现状

`client/vite.config.js` 当前 `build.target: 'es2015'`。这只让 esbuild 降语法，**不补任何 API**，
且依赖包里的现代语法/API 依旧原样输出，Chrome 69 下依旧白屏。改造后 target 交给 plugin-legacy 统一推导。

## 3. 方案 A（主方案）：plugin-legacy 双构建

### 3.1 原理

构建时额外产出一份 ES5 兼容产物（Babel + SystemJS + core-js 按需 polyfill），
`index.html` 同时写入：

- `<script type="module">` → 现代包（现代浏览器执行，Chrome 87+ 直接命中）
- `<script nomodule>` + 内嵌特性检测脚本 → legacy 包（Chrome 69 落到这条链路）

浏览器自行判断加载哪份；**不需要 UA 判断，没有运行时重定向，服务端也不用改**
（仍是同一个 `index.html`，静态托管方式不变）。

路由级懒加载（`client/src/router/index.js` 全部为 `() => import(...)`）会被保留，
legacy 用户按路由分片加载，不会一次吞下全部 ES5 代码。

### 3.2 改动清单

```bash
cd client
npm i -D @vitejs/plugin-legacy terser
```

```js
// client/vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    vue(),
    legacy({ targets: ['chrome >= 69'] }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    modulePreload: false,
    // target 交给 plugin-legacy 从 browserslist 推导，删除原来的 'es2015'
  },
  base: '/exam/',
})
```

```jsonc
// client/package.json（browserslist 作为新旧 target 的单一事实来源）
{
  "browserslist": ["chrome >= 69"]
}
```

同时修掉 §2.2 的 4 处 `inset: 0`。

### 3.3 已知风险与验证点

| 风险 | 说明 | 验证方式 |
|---|---|---|
| Monaco / `@codingame/monaco-vscode-api@36` | 体积大、异步代码多；Web Worker 在 legacy（SystemJS）链路可能异常 | 真机打开编程题页，确认编辑器可输入/高亮，DevTools 无 worker 报错 |
| Tiptap 3 / ProseMirror | 官方不承诺旧浏览器；渲染类组件一般能跑 | 真机打开富文本题，编辑 + 预览 |
| Ant Design Vue 4 CSS-in-JS | 若生成 `:where()` 等选择器（Chrome 88+）个别规则会被丢弃 | 真机冒烟看按钮/表格/弹窗样式 |
| 构建时间 | Babel 全量转译，Monaco 使 legacy 首次构建可能达分钟级 | CI/本地可接受即可 |
| 比Chrome 69更老的浏览器 | 不适配 | plugin-legacy 检测失败时落到提示页，见 §5 |

## 4. 方案 B（兜底）：组件级降级

若方案 A 实测中 Monaco / Tiptap 在 legacy 链路不可用，不为它们死磕 ES5：

- **代码编辑器** → CodeMirror 5（ES5 时代产物，老浏览器久经考验），保留语法高亮与缩进
- **富文本题** → 普通 textarea（纯文本提交，服务端已有容错则更稳）

实现方式：按**特性检测**（如 `typeof queueMicrotask === 'function'` 的探针结果存入全局）
在运行时选择渲染哪个编辑器组件——这才是「识别浏览器放不同前端」的合理粒度：
组件级、特性检测、其余页面 100% 复用方案 A 产物。**不引入第二套路由或第二个应用。**

## 5. 不适配底线的提示页

比 Chrome 69 还老的浏览器（IE、Chrome < 60）不做任何适配：plugin-legacy 的检测脚本
加载失败时，应显示「请使用 Chrome 69 及以上版本访问」。可在 `index.html` 内嵌一段
ES5 脚本，在 legacy 链路启动失败时往 `#app` 写入提示。

## 6. 验收清单（真实机房机执行）

- [ ] 登录 → 学生端进入考试 → 答客观题 → 交卷成功
- [ ] 编程题：Monaco 打开、能输入、能高亮、能提交（方案 A 风险项 ①）
- [ ] 富文本题：Tiptap 编辑、图片/表格、保存回显（方案 A 风险项 ②）
- [ ] 实训/工程题页面上传、批改结果查看
- [ ] 教师端：批改列表、ProjectReviewNew / ProjectQuestionEdit 遮罩层定位正确（`inset` 修复回归）
- [ ] socket.io 实时状态（轮询/断线重连）正常
- [ ] 教师端/管理端顶栏、Doc 页样式无明显崩坏
- [ ] 现代浏览器（本机 Chrome 最新版）回归一轮，确认 modern 链路无感知、不下载 legacy 包

开发期冒烟：可装 Chrome 69 官方历史版本（mac x64 经 Rosetta 运行）自查；
**最终验收以真实机房机为准。**

## 7. 成本评估（回答「会臃肿吗」）

| 维度 | 影响 |
|---|---|
| 源码 / 维护 | 不臃肿，始终一套代码 |
| dist 体积 | JS 约翻倍 + core-js polyfill；各取所需，现代浏览器用户不会下载 legacy 包 |
| 构建时间 | 明显变长（Babel 全量转译 + Monaco），可接受 |
| 服务端 | 零改动（同一个 index.html，静态托管不变） |
| 长期纪律 | 新代码避免使用过新的 CSS/DOM API；改动后按 §6 清单冒烟 |

## 8. 落地顺序

1. 修 4 处 `inset: 0`（与方案无关的存量 bug，先修）
2. 接入 plugin-legacy + browserslist，本地构建确认产物含 legacy 链路
3. Chrome 69 真机验收 §6 清单；Monaco/Tiptap 有问题 → 触发方案 B
4. 全部通过后并入正常发版流程；后续每次发版在机房机做一轮 §6 冒烟
