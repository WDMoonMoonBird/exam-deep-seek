# 教师手册 · 交互演示底座（冻结层）

参考实现：deepseek.com/harness 的能力演示 —— 真实 DOM 复刻 + 播放/暂停，而不是视频。
本目录是手册演示的共享底座：**新增一个演示 = 新增 1~2 个文件**，不需要改 Doc.vue、不需要注册。

## 文件与职责
| 文件 | 职责 | 谁能改 |
|---|---|---|
| ManualStep.vue | 播放器：步骤驱动 + 播放/暂停/重播 + 进视口自动播 + reduced-motion + aria | 冻结，勿改 |
| DemoFrame.vue | 演示外壳（window/modal/panel/bare）+ 容器查询缩放 + dm-* 假界面原子类 | 冻结，勿改 |
| scenes/<name>.js | 场景数据：caption / ariaLabel / steps（文案与节奏） | 各自场景作者 |
| sections/<Name>Section.vue | 场景界面：复刻界面 + 按 step 渲染状态 | 各自场景作者 |

## 自动发现（关键）
views/DocDemoPreview.vue（/exam/doc/demos）与手册正文都用 import.meta.glob 扫描 sections/*.vue，
按每个文件 script 块里导出的 meta 排序渲染：

    <script>
    export const meta = { order: 8, title: '8. 作业管理 · 布置作业', anchor: 'assignments' };
    </script>

- order：排序（建议直接用章节号）
- title：演示区里的小节标题
- anchor：对应原手册章节 id（可空，用于回指）

## 写法（照 sections/AssignHomeworkSection.vue 抄）

    <ManualStep :steps="scene.steps" :caption="scene.caption" :aria-label="scene.ariaLabel" :fallback="fallback">
      <template #default="{ step }">
        <DemoFrame chrome="window" title="…" :design="720">
          <!-- 只用 dm-* 原子类 + calc(var(--u) * N) 写尺寸；状态用 step 判断 -->
        </DemoFrame>
      </template>
    </ManualStep>

### 硬规则
1. 不调接口、不依赖登录态、不 import 任何业务组件（手册是公开路由 /doc）。假数据直接写在场景文件里。
2. 尺寸一律 calc(var(--u) * N)（N = 设计稿像素，design 默认 720）；不要写死 px，否则小屏会挤。
3. 状态由 step 决定，步骤之间用 CSS transition（--duration-base + --ease-out）；
   需要循环 keyframes 也可以写，播放器会在暂停时自动把 animation-play-state 设为 paused。
4. 点击目标加 dm-target，当前步骤再加 is-hot；要「点这里」的光标就插 <i class="dm-cursor is-on" />。
5. 动画层由播放器 aria-hidden；**可访问名必须靠 ariaLabel 把剧情讲清**（含「仅为演示，不会真的…」）。
6. fallback 截图可先留空（自动降级为直接显示复刻界面）；等 docs/manual/shots.mjs 生成后由队长接上。

## 自证清单（每个场景交付前跑）

    npx eslint client/src --quiet
    curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/exam/doc/demos    # 期望 200
    node /tmp/manual/check.mjs <anchor>     # 播放/暂停/重播/0 报错/375 宽无溢出

最终回复里请贴：data-step 走到终态的读数、暂停期间 step 不推进的证据、手机端 dfW 与 overflow、截图路径。

## 三条底座注意事项（踩过的坑，务必先看）
1. **`--ring-focus` 是整条 box-shadow，不是颜色**（tokens.css:110 的值形如 `0 0 0 3px rgba(...)`）。
   DemoFrame 的 `.dm-target.is-hot` 已改成直接写颜色并按 `--u` 缩放环宽（原来把 token 当颜色用 → 声明无效、光环不显示）。
   若你自己写高亮环，请照 DemoFrame 的写法。
2. **`--u` 只能用在 `.df` 的后代上，别写在 `.df` / `.df-body` 自身**：`--u: calc(100cqw / design)` 定义在
   `.df`（container-type: inline-size）上，而**容器查询单位对容器自身不生效** —— 在 `.df` 自己的规则里 `cqw` 退回视口宽。
   实测 1280 视口下 `.df` 内 `--u`=1.8px（=1440/800），后代才是 1.08px（=868/800）；于是给 `.df` 写
   `min-height: calc(var(--u) * 500)` 会算成 900px，把演示框撑得超出视口 → IntersectionObserver 永远到不了 40% 阈值 →
   **永不自动播放**（表现为自证脚本 advanced/pausedHeld/resumed 三项假失败）。高度/尺寸请写在后代元素上。
3. **在子树里加 `data-theme="dark"` 不会自动重算组件层别名**：像 `--card-bg: var(--bg-surface)` 这类别名是在声明它的
   `:root` 上完成替换的，子树只改 `--bg-surface` 不会生效（实测子树内 `--bg-surface` 已变深，但 `--card-bg` 仍是白色）。
   做法照 `tokens.css` 的 `[data-density="compact"]`：在深色子树里**重声明那几个别名**
   （至少 `--card-bg / --card-bd / --topbar-bg / --topbar-bd / --page-desc-fg`，见 QuickstartSection.vue 的实现）。
