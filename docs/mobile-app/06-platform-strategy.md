# 平台策略：一份 Vue 代码，三层复用（Web / PWA / Android，iOS 暂不出包）

> 分支 feat/mobile-app · 决策日期 2026-10-17 · 上游 [SCREENS.md](./preview/SCREENS.md)、[02-design-tokens.md](./02-design-tokens.md)、[04-interaction-a11y.md](./04-interaction-a11y.md)、[05-page-specs.md](./05-page-specs.md)
> 下游 [07-implementation-plan.md](./07-implementation-plan.md)（M0–M6 排期与文件清单）。
> 结论先行：**现在交付 /m 移动 Web + PWA（0 审核、当天上线）；同一份代码用 Capacitor 8 装 Android 壳，校内外扫码分发；iOS 只做 Gate 规划，不出包。**

---

## 1. 三层复用（One UI, Three Shells）

~~~text
client/src（现有 Vue3 桌面应用，本次零改动）
   └── /m 移动 Web + PWA            ← 阶段 M0–M3（0 审核，部署即用，双端浏览器）
         └── Capacitor Android 壳    ← 阶段 M4–M6（同一份 dist，系统返回键/状态栏/启动屏/文件选择）
               └── Capacitor iOS 壳  ← 仅规划（Gate 满足后再启动，代码预期零改动）
~~~

| 层 | 载体 | 代码 | 更新方式 | 分发 | 本轮是否交付 |
|---|---|---|---|---|---|
| Web | 手机浏览器 | client/src/views/m（新增） | 发版即生效 | 扫码/链接 | **是** |
| PWA | 安装到主屏的独立窗口 | 同一套 /m + manifest + sw + 图标 | 发版 + SW 更新提示 | 添加到主屏 | **是** |
| Android | Capacitor 8 WebView 壳 | 同一套 dist（远程加载，见 §5.1） | 改 Web 当天生效；壳能力变更才发 APK | 扫码装 APK / 学校应用中心 | **是**（内部试用） |
| iOS | Capacitor iOS 壳 | 同一套 dist | 同 Android | TestFlight / App Store（未启动） | 否（§6） |

**硬约束**

1. 不为任何平台写第二套 UI；平台差异只允许出现在系统层（状态栏高度、返回手势、文件选择、启动屏）。
2. 业务 UI 不出现平台分支（禁止 if (isAndroid) 改布局）；平台能力统一收敛到 composables/useDevicePlatform.js 与壳层。
3. 不做原生 Kotlin/Swift 重写；壳的能力按「37 屏真实需要」取舍（§5.2）。

---

## 2. 本机实测与工具链（2026-10-17，均为可复现命令的结果）

| 依赖 | 实测结果 | 结论 |
|---|---|---|
| Node / npm | v24.19.0 / 11.17.0 | 满足 Capacitor 8 的 Node >=22 |
| JDK | OpenJDK 24（/usr/libexec/java_home 指向 openjdk-24） | 满足 Capacitor 8 的 JDK >=21 |
| Android SDK | ~/Library/Android/sdk：platforms/android-36、android-36.1；build-tools 35.0.0 / 36.1.0 / 37.0.0；platform-tools（adb 1.0.41） | **可打 Android 包**；Capacitor 8 模板 compileSdk/targetSdk 36、minSdk 24 |
| 模拟器 | ~/.android/avd 为空（无 AVD） | 可用真机 adb 验收；需要模拟器时先创建 AVD |
| keytool | /usr/bin/keytool 存在 | 可生成签名 keystore |
| Xcode | /Applications 无 Xcode.app；xcode-select -p = /Library/Developer/CommandLineTools；xcodebuild 报 requires Xcode | **iOS 无法出包**（§6） |
| 磁盘 | 数据卷剩余 28Gi | Android 依赖 + Gradle 足够；Xcode（15GB+）会紧张 |
| 仓库现状 | client/package.json 无 vant / capacitor；无 android/、ios/、manifest、sw；client/public 已有 favicon.svg / favicon.ico / icons.svg | 干净起点，M0 一次性加依赖 |
| 构建现状 | client/vite.config.js base=/exam/；client/dist 入口 JS 1,344,043 字节（gzip 约 399KB，含 antd 全量注册） | 移动端继承入口成本，见 04 §5.1 的性能基线 |
| 部署现状 | nginx-exam.conf 只对 /exam/ 下的 teacher、student、admin 三类前缀送 SPA 外壳；静态根 = client/dist | 必须为 /m 增 location（§3） |

**版本锁定（npm registry 查询，安装时以 lockfile 为准）**

| 包 | 版本 | 用途 |
|---|---|---|
| vant | 4.10.2 | /m 行为型组件（按需） |
| @vant/auto-import-resolver + unplugin-vue-components | 1.3.0 / 32.1.0 | Vant 按需自动引入（devDependency） |
| @capacitor/core、@capacitor/cli、@capacitor/android | 8.5.3 | Android 壳 |
| @capacitor/app / status-bar / splash-screen / keyboard / network | 8.1.2 / 8.0.4 / 8.0.2 / 8.0.6 / 8.0.1 | 壳能力（按需） |
| vite-plugin-pwa（备选，不采纳） | 2.0.0 | 自动 precache 方案；见 §4.2 取舍 |

---

## 3. 部署形态：/m 与 nginx（必须改的运维清单）

### 3.1 路由与静态资源布局

| 资源 | 仓库路径 | 构建产物 URL（base=/exam/） | 说明 |
|---|---|---|---|
| 移动页面 | client/src/views/m/** | /exam/m/*（SPA 外壳） | 与桌面同一 index.html，前端路由分流 |
| 令牌与主题 | client/src/styles/mobile-tokens.css、mobile-vant-theme.css | 进入 /m 异步 chunk CSS | 不新增静态 URL |
| manifest | client/public/m/manifest.webmanifest | /exam/m/manifest.webmanifest | scope 与 start_url 见 §4.1 |
| Service Worker | client/public/m/sw.js | /exam/m/sw.js | 作用域 = /exam/m/（隔离桌面） |
| 离线页 | client/public/m/offline.html | /exam/m/offline.html | SW 回退 |
| PWA 图标 | client/public/m/icons/*.png | /exam/m/icons/*.png | 由 favicon.svg 生成 192/512/maskable |
| APK（M5） | 部署机静态目录（不入库） | /exam/download/exam-deepseek-<version>.apk | 见 §5.8 |

**为什么 PWA 资源全部放 public/m/ 下**：Service Worker 的作用域由脚本路径决定（/exam/m/sw.js → /exam/m/），这样 SW 不会控制桌面页面，避免桌面被移动缓存策略污染；manifest 的 start_url/scope 也只覆盖 /exam/m/。

### 3.2 nginx 改动（nginx-exam.conf，逐条）

| # | 位置 | 现状 | 需改为 | 原因 |
|---|---|---|---|---|
| 1 | location 正则（约 199 行） | ~ ^/exam/ 下 teacher、student、admin 三类前缀 | 同一条正则追加 m（写作 teacher 或 student 或 admin 或 m 的分支） | /m 深链送 SPA 外壳（精确正则见 §3.2 代码片段） |
| 2 | 精确 location | 无 /exam/m | 增加 location = /exam/m { return 301 /exam/m/; } 与 location = /exam/m/ { try_files /exam/index.html =404; } | 防手敲 /exam/m 404；且 dist/m/ 目录存在，避免落到目录 403 |
| 3 | 静态 location /exam/ | alias 指向 dist | 不变 | manifest/sw/离线页走静态文件即可（try_files 先命中文件） |
| 4 | MIME | 未声明 .webmanifest | types 或 location 内 default_type application/manifest+json | Chrome 安装判定要求正确 Content-Type |
| 5 | sw.js 缓存 | 默认 | location = /exam/m/sw.js { add_header Cache-Control "no-cache"; } | SW 更新检查不被强缓存拖住 |
| 6 | APK（M5） | 无 | location /exam/download/ { alias ...; default_type application/vnd.android.package-archive; } | 扫码下载；微信内需提示浏览器打开 |
| 7 | CSP | 已有 map 策略（含 manifest-src 'self'、worker-src 'self' blob:） | 不放宽；若新增 APK 下载页无需改 | 现有 CSP 已允许 manifest 与 SW |
| 8 | 错误页 | /exam/error-pages/*.html | 不变 | /m 的 404 由前端路由接管 |

~~~nginx
# 参考片段（合入 nginx-exam.conf，注意正则 location 的书写顺序）
location = /exam/m { return 301 /exam/m/; }
location = /exam/m/ { try_files /exam/index.html =404; }
location ~ ^/exam/(teacher|student|admin|m)(/|$) { try_files $uri $uri/ /exam/index.html; }

types { application/manifest+json webmanifest; }
location = /exam/m/sw.js {
    add_header Cache-Control "no-cache" always;
}
location /exam/download/ {
    alias /path/to/dist/download/;
    default_type application/vnd.android.package-archive;
    add_header Cache-Control "no-store" always;
}
~~~

### 3.3 Node 直连兜底（非 nginx 部署时）

server/src/app.js 的 SPA_PREFIXES 目前为 ['/login','/doc','/teacher','/student','/admin','/exam']，需追加 '/m'（一行改动），否则直连 Node 访问 /m 会 404。与 nginx 的「前端前缀清单」必须保持同步（两处列表是同一契约）。

### 3.4 上线顺序

1. 先发 dist（含 /m 路由与 public/m 资源）——此时代码可访问，但 nginx 尚未放行 /m 深链，仅 /exam/m/ 精确可开（如已加精确 location）；
2. 合入 nginx 改动并 nginx -t 校验 + reload；
3. 验证 /exam/m/、/exam/m/student/home 深链、manifest Content-Type、sw.js 可获取；
4. 灰度：先内部账号，观察 1 个工作日；再全量；
5. 回滚：nginx 先回退第 1/2 条 + 重新部署上一版 dist（见 07 §10）。

---

## 4. PWA（渐进增强，不承诺离线数据）

### 4.1 manifest 规格

client/public/m/manifest.webmanifest：

| 字段 | 值 | 说明 |
|---|---|---|
| name | Deadpan 判题 | 安装后桌面名称 |
| short_name | Deadpan | ≤12 字符 |
| id | /exam/m/ | 稳定标识，避免 URL 变更导致重复安装 |
| start_url | /exam/m/ | 打开后由 /m 首页按角色跳转 |
| scope | /exam/m/ | 只控制移动区，不接管桌面 |
| display | standalone | 全屏；不隐藏状态栏 |
| orientation | portrait | 作业/审核为竖屏设计；横屏由系统旋转但布局已适配 |
| theme_color | #f6f7f9（浅）/ #0b0f16（深，可在运行时由 meta 控制） | 与 02-design-tokens 表面色一致 |
| background_color | #f6f7f9 | 启动闪屏底色 |
| lang | zh-CN | |
| dir | ltr | |
| icons | 192×192、512×512、512×512 maskable | 由 client/public/favicon.svg 生成；maskable 需 safe zone ≥80% |
| shortcuts | 作业（/m/student/assignments）、审核（/m/teacher/review） | 长按图标快捷入口（可选） |
| categories | education | |

注入方式：client/index.html 增加 link rel=manifest href=%BASE_URL%m/manifest.webmanifest（Vite 会替换 BASE_URL 为 /exam/，避免裸根路径）；同时补 apple-touch-icon 与 viewport-fit=cover（04 §4.1）。桌面用户也会加载 manifest，但 scope/start_url 只覆盖 /m，不影响桌面使用。

### 4.2 Service Worker 缓存策略（手写，不引 vite-plugin-pwa）

**取舍**：vite-plugin-pwa 2.0.0 能自动生成 precache manifest，但会给现有 Vite 8 + plugin-legacy + terser 构建增加一个构建期变量（兼容性待确认），且本项目离线边界很窄（无离线数据），手写 SW 足够且可控。M0 用手写方案；若后续要「首访即离线可用」再评估插件。

client/public/m/sw.js 策略表：

| 请求 | 策略 | 说明 |
|---|---|---|
| navigation（/exam/m/* HTML） | network-first，3s 超时回退缓存外壳；无缓存 → offline.html | 保证新版本优先；离线打开已访问页面壳 |
| 静态资源 /exam/assets/* | cache-first（hashed 文件名） | 版本更新后旧缓存清理 |
| /exam/m/icons/*、manifest、offline.html | install 时 precache | 安装即具备离线壳 |
| /exam/api/** | **完全不缓存**（network-only） | 含个人成绩/评语，禁止落盘缓存；失败交给页面四态 |
| /exam/monaco/** | 不拦截 | 桌面资源，移动端不加载 |
| /exam/doc-img/**、图片 | stale-while-revalidate，上限 30 条 | 文档图片 |
| 其他跨域 | 不拦截 | 本校无外链资源 |

生命周期：

1. install：precache 最小壳（offline.html + manifest + icons），self.skipWaiting() 不直接调用（避免打断会话），改为等客户端消息；
2. activate：删除旧版本 cache（cache 名含 SW_VERSION），clients.claim()；
3. updatefound：页面提示「新版本已就绪，点击刷新」（见 §4.5）；用户确认后 postMessage skipWaiting → controllerchange 时 reload 一次（防循环：sessionStorage 标记）；
4. SW_VERSION 常量在每次发版时手动 +1（M6 清单项）；M6 可加 scripts/build-sw.mjs 自动注入构建戳（可选）。

### 4.3 安装引导

| 环境 | 能力 | 引导方式 |
|---|---|---|
| Android Chrome | beforeinstallprompt 可捕获 | /m/install 页「安装到桌面」按钮调用延迟事件 prompt()；页内说明收益 3 条 |
| Android 其他浏览器 | 多数不支持 | 指引菜单「添加到主屏幕」；不显示假安装按钮 |
| iOS Safari | 无 beforeinstallprompt | 手动指引：分享 → 添加到主屏；说明「iOS 上 PWA 功能有限」（§6.2） |
| 微信内置浏览器 | 不支持安装 PWA | 提示「在浏览器打开」+ 复制链接；不弹安装 |
| 已安装 | display-mode: standalone 或 navigator.standalone | 显示「已安装」，隐藏安装按钮 |
| Capacitor 壳 | 不需要 PWA | /m/install 在壳内显示壳版本与更新检查入口（可选） |

不做：强制安装弹窗、遮挡式引导、诱导评分。安装提示只在 /m/install 页与首次访问后的可关闭轻提示（localStorage 只提示一次）。

### 4.4 离线边界（明确定义，禁止越界）

| 能力 | 离线是否可用 | 说明 |
|---|---|---|
| 打开已访问过的 /m 页面壳 | ✅ | SW 缓存 HTML + hashed 资源 |
| 打开从未访问的页面 | ❌ → offline.html | 提示「离线，恢复网络后重试」 |
| 查看作业/成绩/审核数据 | ❌ | API 一律不缓存（隐私 + 一致性），离线显示四态中的 offline |
| 提交/交卷/审核/发布 | ❌ | 写操作离线禁用；无离线队列（明确非目标） |
| 答题草稿 | 部分 | 草稿在 localStorage/内存，恢复网络后由用户手动保存；不自动提交 |
| 登录态 | 保留 | token 仍在 localStorage；离线时无法校验，任何 API 都失败 → 401/网络错误按 04 §3.4 处理 |
| 静态文档/使用说明 | 已缓存的 doc-img 可看 | 正文为静态组件，随页面壳缓存 |

**安全红线**：SW 不得缓存 /exam/api/ 响应；不得把评语/成绩写入 Cache Storage；缓存名不得包含用户标识。

### 4.5 更新提示

复用现有机制（composables/appVersion.js：入口哈希探测，5 分钟轮询 + 60s 去抖 + 切前台补一次），新增 SW 更新提示：

| 场景 | 提示 | 行为 |
|---|---|---|
| 入口哈希变化（Web 层新版本） | 顶部/Toast「有新版本，点击刷新」 | 用户点击 → 若有未保存表单先二次确认 → location.reload() |
| SW updatefound | 「新版本已就绪，下次打开生效」+「立即刷新」 | 立即刷新 = skipWaiting + reload（sessionStorage 防循环） |
| APK 壳内 | 检查 latest.json 的 versionCode | 提示下载新 APK（§5.8）；不静默更新 |
| 表单/作答中 | 不自动刷新 | 保存草稿后由用户决定；禁止打断考试倒计时 |


---

## 5. Capacitor Android 壳

### 5.1 加载模式：远程 URL 优先（v1 决策）

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 远程加载（采纳）** | capacitor.config 设 server.url = https://deadpan.asia/exam/m/，androidScheme = https | 与 Web 同源 → 零 CORS、Socket.IO 同源；改 Web 当天生效；APK 只做壳 | 断网冷启动无页面（需 errorPath 兜底）；依赖服务器可用 | v1 内部试用 |
| B. 本地打包 dist | webDir 指向 client/dist，壳内 file/https scheme 本地加载 | 离线可开壳；无网络也能看壳 | 跨域 API 需配 CORS_ORIGIN + SOCKET_CORS_ORIGIN；每次 Web 更新要发 APK；CSP 需 meta 化 | 若产品要求「离线也能答题/看数据」再评估（见待确认 Q4） |
| C. 混合（本地壳 + 远程数据） | 本地加载 + API 远程 | 离线壳 + 在线数据 | 两套 CSP/CORS 配置，维护成本高 | 暂不采用 |

capacitor.config.ts（client/capacitor.config.ts）：

~~~ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'asia.deadpan.exam',            // 待确认：稳定唯一、上架后不可改
  appName: 'Deadpan 判题',
  webDir: 'dist',                         // 远程模式仍必填（Capacitor 要求）
  server: {
    url: 'https://deadpan.asia/exam/m/',
    androidScheme: 'https',
    cleartext: false,                     // 禁止明文 HTTP
    // errorPath: 'offline.html',         // 待真机确认 Capacitor 8 的断网兜底行为
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,   // release 关闭调试
  },
};
export default config;
~~~

### 5.2 壳能力取舍（37 屏真实需要）

| 能力 | 插件 | 37 屏是否需要 | 决策 |
|---|---|---|---|
| 系统返回键 / 前后台 | @capacitor/app | 需要（返回栈，04 §1.3） | **做** |
| 状态栏样式/颜色/安全区 | @capacitor/status-bar | 需要（深色主题、安全区） | **做** |
| 启动屏 | @capacitor/splash-screen | 需要（冷启动不白屏，屏 36） | **做** |
| 键盘 resize | @capacitor/keyboard | 需要（表单/评语，04 §4.2） | **做**（resize: native） |
| 网络状态 | @capacitor/network | 需要（离线条更可靠，04 §3.6） | **做**（也可用 navigator.onLine，壳内更准） |
| 文件选择（zip 上传） | 系统 WebView file chooser（不引第三方插件） | 需要（实训题提交、附件） | **做**（先验证 WebView 默认实现；失败再引入 file picker 插件） |
| 相机 / 相册 | @capacitor/camera | 37 屏无拍照需求（作业附件走文件选择） | **不做**（避免权限与隐私面） |
| 推送 | @capacitor/push-notifications + FCM | 37 屏无推送；通知偏好也无后端 | **不做**（理由：FCM 需 Firebase 项目与 google-services.json；国内厂商通道需逐一接入；后台被杀不可靠，见 04 §6） |
| 生物识别 / 安全存储 | 无 | 无 | **不做** |
| 应用内更新（下载 APK 并安装） | 需 FileProvider + REQUEST_INSTALL_PACKAGES | 可选 | v1 不做：提示到下载页手动安装（§5.8） |
| 版本信息 | @capacitor/app（App.getInfo） | 需要（启动屏/关于） | **做** |

**原则**：每加一个插件都要回答「37 屏里哪一屏用到」；答不上来就不加。插件清单越短，审核/权限/隐私风险越小。

### 5.3 返回键行为（必须与 04 §1.3 一致）

~~~text
App.addListener('backButton'):
  1) 有打开的 Sheet/Popup/Dialog → 关闭最上层（不跳页）
  2) 路由有历史 → router.back()
  3) 当前是角色 Tab 根（teacher-home/student-home/admin-home）→ Toast「再按一次退出应用」，2s 内二次才 App.exitApp()
  4) 其他根级页面（login/landing）→ 同 3
~~~

注意：Capacitor 默认会直接退出应用，必须显式接管 backButton；桌面浏览器无该事件，代码用 Capacitor.isNativePlatform() 守卫（只做能力判断，不做布局分支）。

### 5.4 启动屏

| 项 | 方案 |
|---|---|
| 视觉 | 深色底 #0b0f16 + 品牌 logo + 「Deadpan 判题 · 教学评测，随时可用」，与设计稿 platform-splash 对齐 |
| 资源 | android/app/src/main/res/drawable/splash.png（多密度）或 @capacitor/splash-screen 的 launchAutoHide=false + 手动 hide |
| 隐藏时机 | Web 首屏可交互后（路由 ready + 首屏数据请求开始，不超过 2.5s）手动 SplashScreen.hide()；避免白屏/闪黑 |
| 版本检查 | 启动屏期间并行 App.getInfo() + 拉 latest.json（§5.8），不阻塞进入 |
| PWA/Web | 无此屏（浏览器启动即页面），不实现 |

### 5.5 状态栏、安全区与深色

1. StatusBar.setOverlaysWebView(false)：状态栏不覆盖 WebView，由 WebView 顶部留出 --m-safe-top 的高度。
2. 实际状态栏高度由 StatusBar.getInfo 或插件事件注入到 CSS 变量 --m-safe-top（02-design-tokens 的 Android 基准 24px 只是兜底）；真机验收必须验证「状态栏高度、刘海/打孔、手势条」三类机型。
3. 颜色：浅色主题状态栏底色 = --m-appbar-solid（#f6f7f9）+ 深色图标；深色主题 = #0b0f16 + 浅色图标；跟随 useTheme 的 resolved 切换。
4. Android 15/16（targetSdk 36）强制 edge-to-edge：必须处理系统栏 insets，否则内容被状态栏/导航条遮挡。Capacitor 8 与 @capacitor/status-bar 8 已有支持；真机验收项（M4）。
5. 安全区：浏览器靠 env()，壳内以插件值覆盖 --m-safe-bottom（手势条高度）与 --m-safe-top；二者不一致时以「内容不被遮挡」为准并记录机型。
6. 深色：壳内 prefers-color-scheme 可能不随系统变化（WebView 行为差异），因此始终允许 /m 内手动主题切换（useTheme），不依赖系统。

### 5.6 文件选择与上传（学生实训题 zip / 教师附件）

| 项 | 规则 |
|---|---|
| 入口 | input type=file（accept 由后端白名单决定，zip 为主），不用相机 |
| 大小 | 前端先校验 ≤10MB（与 express.json 限 10mb / nginx client_max_body_size 12m 对齐）；超限 toast「文件超过大小限制（10MB）」 |
| 进度 | 上传用 XHR/axios onUploadProgress 或分片提示「正在上传 63%」；upload 中禁止重复点击 |
| 失败 | 网络失败可重试；413（业务 1403）给出大小提示；解压失败（后端 400）原样展示可读文案 |
| WebView 验收 | 真机点「选择文件」能打开系统文件选择器并返回 zip；微信内若失败，提示「在浏览器打开」 |
| 权限 | 不需要存储权限（系统文件选择器临时授权）；不申请 MANAGE_EXTERNAL_STORAGE |

### 5.7 构建与签名（M4/M5）

~~~bash
# 1) 依赖（client/ 下；版本以 lockfile 为准）
npm install @capacitor/core@8.5.3 @capacitor/cli@8.5.3 @capacitor/android@8.5.3
npm install @capacitor/app@8.1.2 @capacitor/status-bar@8.0.4 @capacitor/splash-screen@8.0.2
npm install @capacitor/keyboard@8.0.6 @capacitor/network@8.0.1

# 2) 首次初始化（生成 client/android/，建议 .gitignore 忽略构建产物但保留工程配置）
npx cap add android
npx cap sync android

# 3) Debug 包（真机试用）
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk（adb install）

# 4) Release 签名（keystore 不入库！）
keytool -genkeypair -v -keystore exam-deepseek-release.keystore -alias exam -keyalg RSA -keysize 2048 -validity 10000
# keystore 备份：至少 2 份离线介质 + 1 名交接人；丢失 = 已装用户无法覆盖升级
cd android && ./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk
~~~

| 配置 | 要求 |
|---|---|
| versionCode | 每次发布 +1（整数，永不回退）；versionName 用语义化 2.1.0（与启动屏/关于页一致） |
| 签名 | release 使用固定 keystore + keystore.properties（从环境/本地文件读取，不入库）；禁止 debug 签名对外分发 |
| minify | release 开启 R8/ProGuard（Capacitor 默认模板 minifyEnabled false；M5 评估开启并验证 WebView 正常） |
| 网络 | cleartext=false；HTTPS 证书由服务器提供；不使用自签证书 |
| 调试 | release 关闭 webContentsDebuggingEnabled；debug 可开 |
| 产物命名 | exam-deepseek-<versionName>-<versionCode>.apk；附 SHA256 |
| 归档 | 每个版本 APK + mapping.txt + keystore 使用记录（不存明文口令） |

### 5.8 分发与升级（校内外扫码）

**分发（v1 推荐：校内扫码）**

1. 构建机产出 release APK → 计算 SHA256 → 上传到部署机静态目录（如 /var/www/exam-download/）；
2. 生成下载页/二维码：URL = https://deadpan.asia/exam/download/exam-deepseek-2.1.0.apk；二维码可在电脑端用 qrcode 生成后放进教师群/文档；
3. 微信内无法直接下载 APK：下载页检测 UA（MicroMessenger）→ 提示「点右上角在浏览器打开」；
4. 安装提示：Android「安装未知应用」权限由用户手动允许；页面给 3 步图示（M5 设计复用 platform-install 组件）；
5. 校验：下载页显示版本、大小、SHA256、发布日期，便于教师核对。

**升级**

| 项 | v1（本轮） | 后续（可选） |
|---|---|---|
| 检查 | 启动屏期间拉 /exam/download/latest.json（version/versionCode/url/sha256/notes）；App.getInfo().versionCode 与线上比较 | 同左 |
| 提示 | 「发现新版本 2.1.1」Sheet：更新说明 + 下载按钮（系统浏览器打开 APK URL） | 应用内下载 + FileProvider 安装 |
| 强制 | 仅当后端协议不兼容时提示「必须更新」，否则可稍后 | 同 |
| 回滚 | 版本号只增不减；出问题发新版本修复；保留上一版 APK 供人工降级（需卸载重装，本地无数据） | — |

latest.json 是静态文件（不入库，由发布脚本生成），字段至少：version、versionCode、url、sha256、notes、publishedAt。

### 5.9 应用商店与备案（合规问题，不是技术问题）

| 项 | 现状 | 说明 |
|---|---|---|
| 工信部 App 备案 | 未办理 | 2023 年起在境内从事互联网信息服务的 App 需备案；校内自用也建议先问学校网络信息部门，按学校口径办理（主体、域名、负责人） |
| 应用商店上架 | 不做（v1） | 华为/小米/OPPO/vivo 等需软著、隐私政策、ICP 备案、实名与审核；周期长，与「校内扫码分发」冲突 |
| 学校应用中心 | 待确认 | 若学校有统一分发平台，优先走平台（签名/版本/合规由平台要求） |
| 隐私政策/用户协议 | 需补 | 至少说明收集哪些数据（账号、作业、成绩、日志）、用途、存储位置、联系方式；页面可挂在 /m/doc 或独立静态页 |
| 权限清单 | INTERNET 必需；ACCESS_NETWORK_STATE（网络状态插件）；不申请相机/存储/定位/通知 | 上架时需与隐私政策一致 |

---

## 6. iOS 计划（Gate 而非 Roadmap）

### 6.1 为什么本轮不出包（事实 + 成本）

| 限制 | 事实 | 影响 |
|---|---|---|
| 构建环境 | 本机无 Xcode（xcodebuild 报 requires Xcode；xcode-select 为 CLT） | 无法本地编译；需 macOS CI（GitHub Actions macos runner）或另一台装 Xcode 的机器 |
| 开发者账号 | Apple Developer Program 99 美元/年 | 需持续付费与主体信息 |
| 审核规则 | App Store Guideline 4.2（Minimum Functionality）：纯 WebView 包装/网站镜像会被拒 | 必须补原生价值（推送/相机/离线/生物识别等）才可能过审 |
| TestFlight | 构建 90 天过期；外部分发需审核；内测名额有限 | 长期内部使用不可行；每 90 天重新发版 |
| 企业证书 | Apple Developer Enterprise Program 年费更高，需 100+ 员工/D-U-N-S 等资质，且禁止公开分发；被撤销会全体失效 | 校内小规模不满足门槛，风险高 |
| 中国区上架 | App Store 中国区需 ICP 备案 + App 备案等材料 | 周期与合规成本高于 Android 内部分发 |
| PWA 在 iOS 的限制 | 推送需 iOS 16.4+ 且必须添加到主屏；无 beforeinstallprompt；后台同步/持久存储受限（长期不访问可能被清） | 移动 Web/PWA 可作为过渡，但不能承诺推送与离线持久 |
| 现状判断 | 教师/学生以 Android + 微信为主（待问卷确认），iPhone 教师占比未知 | 没有需求证据前不投入 iOS 出包成本 |

**结论**：iOS 只保留「Safari + 添加到主屏」的 PWA 兜底；不出 TestFlight/App Store 包，不写 Swift，不做 iOS 专属 UI。

### 6.2 现在给 iPhone 用户的替代路径

| 能力 | iOS Safari / PWA 可用性 | 说明 |
|---|---|---|
| 打开 /m 全部页面 | ✅ | 与 Android 同一套 UI |
| 添加到主屏 | ✅（手动：分享 → 添加到主屏） | /m/install 提供图示 |
| 登录/作业/成绩/审核 | ✅ | 触控与布局已按 375 宽度验证 |
| 代码只读/长按引用 | ✅ | 原生 Selection |
| 文件上传（zip） | ✅（「文件」App） | 大文件与弱网体验一般 |
| 推送 | 部分（iOS 16.4+ 且已安装到主屏；学校需确认版本） | 未接入，不承诺 |
| 后台保活/离线数据 | ❌ | 无离线数据设计，需联网使用 |
| 更新 | 刷新即最新 | 无 APK 概念，发版即生效 |

### 6.3 启动 iOS 的条件（全部满足才排期）

1. **需求证据**：iPhone 教师占比达到约定阈值（建议问卷 ≥30 名教师且 iPhone 占比 ≥20%，具体待产品定）。
2. **分发口径**：明确走 TestFlight（内测）还是 App Store（公开）或学校 MDM；公开上架需接受 §6.1 的备案与审核成本。
3. **原生价值补齐**：至少 1 项真实原生价值（推送/相机/离线/生物识别）落地，能回答 Guideline 4.2；纯壳不报。
4. **账号与预算**：Apple Developer 账号、审核负责人、每年续费预算。
5. **工具链**：可用的 macOS + Xcode 构建环境（本机当前不具备；CI 方案需评估）。
6. **合规**：App 备案、隐私政策、隐私清单（Privacy Manifest）齐备。
7. **排期**：作为独立里程碑（M-iOS），不阻塞 Web/Android 主线。

### 6.4 启动后的技术路线（预期零业务代码改动）

~~~text
1) npx cap add ios
2) capacitor.config 同一份（server.url 不变，iOS 也用远程 https）
3) 只做系统层适配：安全区、返回手势（系统）、文件选择、Splash、状态栏
4) TestFlight：Xcode archive → App Store Connect → 内测（90 天有效期，纳入发版日历）
5) 首包后评估：是否补推送（APNs）与离线壳（本地打包 + CORS 配置）
~~~

---

## 7. 安全与合规

### 7.1 CORS / 同源

| 场景 | 配置 | 说明 |
|---|---|---|
| 远程加载壳（采纳） | 不需要改 CORS | 页面 origin = https://deadpan.asia，与 API 同源；Socket.IO 同源握手 |
| 本地打包壳（备选） | server CORS_ORIGIN 增加 https://localhost（Capacitor Android 默认 scheme）或自定义域名；SOCKET_CORS_ORIGIN 同步 | 当前 server 默认只放行 localhost 正则（server/src/app.js 的 cors 配置），未配置时会被拒；**上线壳前必须显式配置并验证** |
| 浏览器 | 同源，无需 CORS | 生产经 nginx /exam/ 前缀，API 走 /exam/api/ |
| Socket.IO | 现有实现已改为显式白名单（SOCKET_CORS_ORIGIN → CORS_ORIGIN → 本机开发源）并要求 JWT 握手 | 远程壳同源可正常；本地壳需把壳 origin 加入白名单 |

### 7.2 证书与传输

- 全站 HTTPS（现有 nginx 443 + HSTS includeSubDomains）；PWA 的 SW 与安装能力依赖 HTTPS。
- Android WebView 使用系统信任库；禁止 cleartext；禁止用户安装的自签 CA 用于生产（若校内测试需自签，放 debug 包，release 不允许）。
- iOS ATS 默认拒绝自签/明文；远程加载路径同样适用。
- 证书到期监控：SW 失效表现为「无法更新/离线壳失效」，需在监控中覆盖。

### 7.3 CSP 与 WebView

- 生产 CSP 由 nginx map 下发（manifest-src 'self'、worker-src 'self' blob:、connect-src 'self' ws: wss:），现有策略可直接支撑 PWA 与 /m；**不放宽** unsafe-eval（移动端不用 Monaco，无需 eval）。
- 远程加载壳沿用服务器 CSP；本地打包壳（备选方案）需在 index.html 加 meta CSP，且 connect-src 要显式列出 API 域名。
- 壳内 release 关闭 WebView 远程调试；debug 包才允许。
- 禁止在 /m 引入任何第三方 CDN/字体/脚本（与桌面同一红线）。

### 7.4 数据与隐私

| 项 | 规则 |
|---|---|
| 登录态 | 继续用 localStorage 存 JWT（与桌面一致）；移动端不新增「记住密码」；记住我只存账号 |
| 缓存边界 | SW 不缓存 API、不缓存成绩/评语/姓名；localStorage 只放偏好（ui-theme、ui:layout、字号、草稿、提示已读） |
| APK | 不内置任何密钥；不打包 .env；服务端 DEEPSEEK_API_KEY 永不下发客户端 |
| 日志 | 移动端错误上报不含 token/答案正文；只报错误码、页面、版本 |
| 截屏/切后台 | 不做 FLAG_SECURE（教师审题可能需截图反馈）；切后台超过 30 分钟回前台重新校验登录态（401 走登录过期） |
| 合规页面 | 需补隐私政策与用户协议入口（/m/doc 增加章节或独立页）；应用备案与学校口径待确认 |
| 数据出境 | 无（DeepSeek 调用在服务端，见 06 不涉及客户端出境） |

### 7.5 权限与上架一致性

| Android 权限 | 用途 | 是否申请 |
|---|---|---|
| INTERNET | 必需 | 是 |
| ACCESS_NETWORK_STATE | 网络状态（离线提示） | 是（插件引入） |
| POST_NOTIFICATIONS | 推送 | 否（不做推送） |
| CAMERA / READ_MEDIA_* | 拍照/相册 | 否 |
| 存储权限 | 文件选择 | 否（系统选择器） |

---

## 8. 待确认问题（决策输入，按优先级）

| # | 问题 | 影响 | 建议 | 责任方 |
|---|---|---|---|---|
| Q1 | 教师 iPhone 占比与使用意愿（问卷） | 决定 iOS 是否启动（§6.3） | 发一次 10 题问卷，目标 ≥30 份 | 产品/学院 |
| Q2 | Android 分发口径：校内扫码 / 学校应用中心 / 应用商店 | 决定 M5 是否要软著、隐私政策、备案 | v1 校内扫码；商店上架作为后续 Gate | 学校 IT |
| Q3 | 是否要求 APK 离线可用（断网打开壳/看缓存数据） | 决定 §5.1 选 A 还是 B（远程 vs 本地打包） | 若只要求「弱网可用」→ A；若要求离线数据 → 需重新评估缓存与安全 | 产品 |
| Q4 | 签名 keystore 归属、备份与交接人 | 丢失将无法覆盖升级 | 学校信息中心保管 2 份离线备份 + 交接记录 | 学校 IT |
| Q5 | App 备案由谁办理、以什么主体 | 合规风险 | 先问学校网络信息部门口径；同时准备隐私政策 | 学校/法务 |
| Q6 | 推送是否真的需要（当前 37 屏未设计） | 影响插件、FCM/厂商通道、权限与后台保活 | 本轮不做；若需要，先做站内信/轮询替代 | 产品 |
| Q7 | 远程加载壳的断网兜底（errorPath 行为） | 冷启动断网体验 | M4 真机验证；不行则显示系统错误页 + 文案引导 | 移动实现 |
| Q8 | PWA 安装入口放哪（登录前/后、教师/学生是否不同） | 安装转化 | /m/install 统一入口 + 首页一次性轻提示 | 产品 |
| Q9 | iOS PWA 推送是否要在未来接入（16.4+） | 影响是否值得为 iOS 做 PWA 优化 | 本轮不接；等 iPhone 占比数据 | 产品 |
| Q10 | 管理端在线人数/评分队列数据源（监控接口） | 影响 admin-home/monitor 真实性 | 后端补 admin/overview 或明确使用系统指标替代 | 后端 |

---

## 9. 平台策略验收清单（M4/M5/M6 用）

- [ ] P1 /exam/m/ 与 /exam/m/student/home 深链可开；manifest 的 Content-Type 正确；sw.js 可获取且不被强缓存
- [ ] P2 Android Chrome 可安装 PWA；安装后 start_url 打开 /m 首页；断网打开已访问页面显示壳，未访问页显示 offline.html
- [ ] P3 SW 不缓存 /exam/api/（DevTools Application → Cache Storage 检查）
- [ ] P4 更新提示：发一版后旧页面出现「有新版本」，点击刷新后版本一致
- [ ] P5 Debug APK 真机安装，冷启动显示启动屏、不白屏；状态栏/安全区/键盘/返回键符合 §5.3–§5.5
- [ ] P6 文件选择：学生实训题 zip 可在壳内选择并上传成功；413 有可读提示
- [ ] P7 Release APK 签名正确（apksigner verify），versionCode 递增，安装覆盖升级成功
- [ ] P8 下载页二维码可扫；微信内提示「在浏览器打开」；SHA256 与页面一致
- [ ] P9 断网冷启动壳：有明确兜底（errorPath 或系统错误页 + 文案），不是白屏
- [ ] P10 iPhone Safari 冒烟：登录→作业→成绩可用；添加到主屏指引正确（不出包）
- [ ] P11 隐私政策/用户协议入口存在；权限清单与实现一致（无多余权限）
- [ ] P12 待确认问题 Q1–Q10 有明确结论并记录在案（M6 交付物）

