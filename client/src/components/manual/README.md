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
