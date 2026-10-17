# 平台策略：Android 优先（决策记录）

> 用户提出「受苹果限制，优先安卓」。以下是据此整理的技术判断与本机实测证据。

## 一、本机实测（决定"现在能不能出包"）

| 依赖 | 状态 |
|---|---|
| JDK | ✅ OpenJDK **24** |
| Android SDK | ✅ `~/Library/Android/sdk`（build-tools / platforms / platform-tools / emulator 齐全） |
| Xcode | ❌ 未安装（只有 Command Line Tools）→ **iOS 出包当前不可行**，且需 Apple Developer 账号（$99/年） |
| 项目内移动壳 | 无 `android/`、`ios/` 目录；未装 Capacitor / Vant / PWA 插件（干净起点） |

## 二、为什么 Android 优先（比"苹果限制"更具体的四条）

1. **分发成本**：Android 可**扫码装 APK**（校内私有工具最省事的路径）；iOS 只能 TestFlight（每次审核 + 90 天有效期）或 App Store（企业账号需 D-U-N-S 资质）或企业证书（500 人门槛）。
2. **迭代速度**：Android 壳 + Web 层远程更新 → 改 UI 当天生效；iOS 动功能就要过审。
3. **审核风险**：App Store **Guideline 4.2 会拒"纯壳"应用** —— 必须补原生价值（推送/相机/离线/生物识别），成本更高。
4. **本机条件**：Android 工具链已就绪，iOS 需要先装 Xcode（约 15GB）。

## 三、但"安卓优先"≠"只写安卓原生"

目标是 **一份 Vue 代码，三层复用**：

```
client/src（现有 Web，桌面不动）
   └── /m 移动 Web + PWA      ← 双端先用，0 审核（阶段 1）
         └── Capacitor Android 壳  ← APK 内部分发（阶段 2）
               └── Capacitor iOS 壳 ← 有 iPhone 需求时再出包，代码不改（阶段 4）
```

如果为安卓单独写 Kotlin/Compose：**iOS 与 Web 都要重做** ✗

## 四、四步落地（每步可验收）

| 阶段 | 内容 | 验收 | 需要后端？ |
|---|---|---|---|
| 1 | `/m` 移动 Web + PWA（清单 + 离线骨架） | 手机浏览器可用、可"添加到主屏" | 否 |
| 2 | Capacitor Android：推送/相机/文件/返回手势/启动屏 | Debug APK 扫码安装，教师试用 | 推送才需要 |
| 3 | Release 分发：签名 keystore、版本号、升级提示 | 校内扫码升级可用 | 否 |
| 4 | iOS（可选）：TestFlight | iPhone 教师可用 | 若本地打包需 CORS |

## 五、待确认（决策依据，非技术细节）

1. **教师 iPhone 占比**（决定 iOS 时间点；建议先发问卷）
2. **分发口径**：校内扫码安装 / 学校应用中心 / 应用商店（后者涉及 App 备案与签名流程，需学校 IT 确认）
3. **签名与证书归属**：Android keystore 若丢失将无法升级已装应用，必须有交接人与备份

## 六、风险提示

- Android 厂商后台杀进程 → **推送不可靠**，需引导用户加白名单/允许自启动
- Android WebView 版本碎片化 → 移动 UI 只用成熟 CSS（已在设计稿中避免新特性）
- iOS 若先用 PWA：需"添加到主屏"才有推送（16.4+），且长期不用可能被清存储
- 真机验收需让手机能访问开发服务：`vite --host` 暴露局域网 IP，或先部署到服务器再看

## 七、小屏自动切换移动版（用户建议 → 采纳，附四条约束）

**结论：采纳**「小屏自动进移动版」，但不能只靠宽度判断，必须配四个机制，否则会踩坑。

| 约束 | 做法 |
|---|---|
| **判定信号要组合** | `matchMedia('(max-width: 767px)')` **且** `matchMedia('(pointer: coarse)')`（触摸）→ 才判为手机。宽度单独判会把"桌面端缩窗口"误切；UA 不作主判据（iPad 默认桌面 UA、易伪造） |
| **只在入口跳一次** | 判定发生在**首次进入/新页面导航**时，写入偏好 `localStorage['ui:layout']`；运行中旋转屏幕或拖窗口**不整页跳走**（否则填一半的表单会丢） |
| **必须有手动兜底** | 提供「切换到桌面版 / 移动版」开关（写入偏好，优先级高于自动判定）；手机上想用完整表格、或手机连投影时要用得到 |
| **独立路由 `/m/*`** | 移动端布局结构不同（底部 Tab vs 侧栏），不共用 Layout；`/teacher/xxx` 与 `/m/xxx` 做映射，跳转保留 query/hash；桌面访问 `/m/*` 给一条"这是移动版，去桌面版"提示条 |

**实现草图**

```js
// composables/useMobileLayout.js
const mqW = matchMedia('(max-width: 767px)');
const mqTouch = matchMedia('(pointer: coarse)');
const pref = ref(localStorage.getItem('ui:layout') || 'auto');   // auto | mobile | desktop
const isMobile = computed(() =>
  pref.value === 'mobile' ||
  (pref.value === 'auto' && mqW.matches && mqTouch.matches));

// router.beforeEach：仅当 pref=auto 且 isMobile 时，把 /teacher/x 映射到 /m/x
```

**性能与测试**

- 移动版组件与 Vant **路由级动态 import** → 桌面用户不下载移动端 chunk
- Playwright 双 viewport 断言：手机视口→自动进 `/m`；桌面视口→不跳；手动切桌面版后刷新仍保持
- **不做服务端 UA 分流**（维护两份 HTML 得不偿失，SPA 内判定已足够且对缓存友好）

**需要产品决策**：手机上做不了的功能（Monaco 写代码、表格批量操作）在移动版里**隐藏**还是**给"请用电脑打开"引导**——这决定移动版的功能边界。
