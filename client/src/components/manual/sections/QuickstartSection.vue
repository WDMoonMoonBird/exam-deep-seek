<template>
  <ManualStep
    :steps="scene.steps"
    :caption="scene.caption"
    :aria-label="scene.ariaLabel"
    :fallback="fallback"
    fallback-alt="登录页与教师控制台截图（浅色 / 深色主题）"
  >
    <template #default="{ step }">
      <!-- 全片唯一的「主题开关」：真实 useTheme 也是把 data-theme 写到根节点（composables/useTheme.js），
           这里把同一个属性写在演示子树的外层 —— 同一套暗色令牌，只影响本演示，不动页面、不动其它演示。
           第 ④ 步（step 3）起为深色。 -->
      <div class="stage" :data-theme="step >= 3 ? 'dark' : null">
        <DemoFrame
          chrome="window"
          :title="step >= 3 ? 'Deadpan 判题 · 深色主题' : 'Deadpan 判题'"
          :design="720"
        >
          <!-- ① 登录页 → ② 教师控制台：真实流程是整页跳转，这里也整块换掉（不拿蒙层假装） -->
          <Transition name="dm-fade" mode="out-in">
            <!-- ① 登录页：工号/密码已填好，高亮「登录」 -->
            <div v-if="step === 0" key="login" class="login">
              <!-- 字标自绘，不 import assets/logo.svg：手册是公开路由，不引业务资源 -->
              <span class="logo-mark">D</span>
              <div class="login-title">Deadpan 判题</div>
              <div class="login-desc">请登录以继续</div>
              <div class="login-form">
                <!-- 真实登录页的 label 是视觉隐藏的（只用 placeholder 提示）；演示里显式画出来，
                     否则读者看不出这两个框分别是什么（文案照 Login.vue 抄） -->
                <div class="field">
                  <span class="field-label">用户名（工号/学号）</span>
                  <span class="dm-input">T2026001</span>
                </div>
                <div class="field">
                  <span class="field-label">密码</span>
                  <span class="dm-input">••••••••</span>
                </div>
                <span class="dm-btn is-primary login-submit dm-target" :class="{ 'is-hot': step === 0 }">
                  登录<i v-if="step === 0" class="dm-cursor is-on" />
                </span>
              </div>
            </div>

            <!-- ② 教师控制台（缩略）：侧栏 + 顶栏 + KPI + 列表
                 ③ 高亮顶栏主题按钮 ④ 整页变深色 ⑤ 高亮侧栏「题库管理」 -->
            <div v-else key="console" class="console">
              <!-- 侧栏：分组与命名照 teacher/Layout.vue（教学 / 组织），第 ⑤ 步高亮「题库管理」 -->
              <aside class="sider">
                <div class="sider-logo"><span class="logo-mark sm">D</span><b>Deadpan 判题</b></div>
                <div class="sider-group">教学</div>
                <div class="sider-item">作业管理</div>
                <div class="sider-item">评分审核<span class="sider-badge tnum">3</span></div>
                <div class="sider-item dm-target" :class="{ 'is-hot': step === 4 }">
                  题库管理<i v-if="step === 4" class="dm-cursor is-on" />
                </div>
                <div class="sider-group">组织</div>
                <div class="sider-item">班级管理</div>
                <div class="sider-item">学生管理</div>
                <div class="sider-item">教学团队</div>
              </aside>

              <div class="main">
                <!-- 顶栏顺序照 teacher/Layout.vue：折叠按钮 → 主题按钮 → 用户区 -->
                <div class="topbar">
                  <svg class="trigger" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3.5 6.5h17M3.5 12h9M3.5 17.5h17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                  </svg>
                  <!-- ③ 高亮主题按钮；④ 点完变深色，图标由月亮换太阳（图标形状与 title 文案照 ThemeToggle.vue 抄） -->
                  <span
                    class="theme-btn dm-target"
                    :class="{ 'is-hot': step === 2 || step === 3 }"
                    :title="step >= 3 ? '切换主题：当前深色主题，点击切换为浅色主题' : '切换主题：当前浅色主题，点击切换为深色主题'"
                  >
                    <svg v-if="step >= 3" class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="4.2" />
                      <path d="M12 2.6v2.2M12 19.2v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
                    </svg>
                    <svg v-else class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M20 14.6A8.6 8.6 0 1 1 9.4 4a6.9 6.9 0 0 0 10.6 10.6z" />
                    </svg>
                    <i v-if="step === 2" class="dm-cursor is-on" />
                  </span>
                  <span class="user-area">
                    <span class="avatar">王</span>
                    <span class="user-meta"><b>王老师</b><i>教师 · 示例中学</i></span>
                  </span>
                </div>

                <!-- 正文：作业管理页（文案照 teacher/Assignments.vue 抄；数字是演示用假数据） -->
                <div class="content">
                  <div class="page-head">
                    <div>
                      <div class="page-title">作业管理</div>
                      <div class="page-desc">布置作业、跟踪提交与评分进度；AI 评分完成后会自动推送到「评分审核」。</div>
                    </div>
                    <div class="page-actions">
                      <span class="dm-btn">刷新</span>
                      <span class="dm-btn is-primary">布置作业</span>
                    </div>
                  </div>

                  <div class="kpi-row">
                    <div class="kpi">
                      <div class="kpi-label">作业总数</div>
                      <div class="kpi-value tnum">12<small>份</small></div>
                      <div class="kpi-sub">全部作业</div>
                    </div>
                    <div class="kpi">
                      <div class="kpi-label">待审核提交</div>
                      <div class="kpi-value tnum tone-warn">5<small>份</small></div>
                      <div class="kpi-sub">与「评分审核」页数字同源</div>
                    </div>
                    <div class="kpi">
                      <div class="kpi-label">AI 评分中</div>
                      <div class="kpi-value tnum">2<small>份</small></div>
                      <div class="kpi-sub">无异常</div>
                    </div>
                  </div>

                  <div class="dm-surface">
                    <div class="dm-table-row head">
                      <span class="grow">作业名称</span><span class="col-cls">班级</span><span class="col-st">状态</span>
                    </div>
                    <div class="dm-table-row">
                      <span class="grow stack"><b>第三章 循环与数组练习</b><i class="dm-sub">共 5 题</i></span>
                      <span class="col-cls dm-sub">软件工程 1 班</span>
                      <span class="col-st"><span class="dm-tag tag-ok">进行中</span></span>
                    </div>
                    <div class="dm-table-row">
                      <span class="grow stack"><b>Hello World 输出解释</b><i class="dm-sub">共 1 题</i></span>
                      <span class="col-cls dm-sub">软件工程 2 班</span>
                      <span class="col-st"><span class="dm-tag is-mute">已结束</span></span>
                    </div>
                    <div class="dm-table-row">
                      <span class="grow stack"><b>面向对象综合实训</b><i class="dm-sub">共 3 题</i></span>
                      <span class="col-cls dm-sub">软件工程 1 班</span>
                      <span class="col-st"><span class="dm-tag is-mute">未开始</span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </DemoFrame>
      </div>
    </template>
  </ManualStep>
</template>

<script>
/**
 * meta —— 手册演示的登记信息（自动发现用：新增演示只需新建本文件，无需改 Doc.vue）
 *   order   Number  在「交互演示」区里的排序（建议用对应章节号）
 *   title   String  小节标题
 *   anchor  String  对应原手册章节 id（用于在正文里回指，可空）
 */
export const meta = { order: 2, title: '2. 快速入门 · 登录与进入控制台', anchor: 'quickstart' };
</script>

<script setup>
/**
 * 手册 · 第 2 节「快速入门」的可播放演示：登录 → 进入控制台 → 切换深色主题
 *
 * 镜像对象（只读模板抄文案，不 import 任何业务组件）：
 *   · views/Login.vue        —— 登录页：Deadpan 判题 / 请登录以继续 / 用户名（工号/学号）/ 密码 / 登录
 *   · views/teacher/Layout.vue —— 侧栏分组（教学：作业管理·评分审核·题库管理；组织：班级管理·学生管理·教学团队）+ 顶栏顺序
 *   · components/ThemeToggle.vue —— 主题按钮的月亮/太阳图标与「切换主题：当前…」文案
 *   · views/teacher/Assignments.vue —— 作业管理的页标题/描述、KPI 文案、列表列与状态
 *
 * 主题用**真实令牌**：给演示外层加 data-theme="dark"，让整棵子树走 tokens.css 的暗色变量表
 * （与 useTheme 给 <html> 加的是同一个属性）。组件层别名在 :root 上就完成了 var() 替换，
 * 所以暗色子树上必须重新声明用到的那几个（做法同 tokens.css 里 [data-density="compact"] 的
 * --input-h / --card-pad），否则会带着浅色值继承下来。
 *
 * 不调接口、不依赖登录态；界面上的人名/班级/数字都是假数据。
 */
import ManualStep from '../ManualStep.vue';
import DemoFrame from '../DemoFrame.vue';
import { quickstart as scene } from '../scenes/quickstart.js';

defineProps({
  /** 截图兜底（由 docs/manual/shots.mjs 生成）；不传则直接显示复刻界面 */
  fallback: { type: String, default: '' },
});
</script>

<style scoped>
/* 主题过渡：跟着第 ④ 步一起变色的面都走同一条过渡（暂停/减弱动效由播放器统一处理） */
.stage :deep(.df),
.stage :deep(.df-chrome),
.console,
.sider,
.main,
.topbar,
.content,
.kpi,
.dm-surface,
.dm-input,
.dm-btn,
.login {
  transition:
    background-color var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}
.stage .dm-target {
  transition:
    box-shadow var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    background-color var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out);
}

/* 「点这里」的光环：DemoFrame 里写的是 box-shadow: 0 0 0 3u var(--ring-focus)，
   但 --ring-focus 的值本身就是**一整条** box-shadow（tokens.css:110）→ 代入后声明无效，
   实测光环恒为 none，只剩那一圈 border-color；而侧栏菜单项没有边框，于是完全看不出高亮。
   这里在演示作用域内补一条等价光环（不去改冻结的 DemoFrame.vue），深色下换成亮一档的品牌色。 */
.stage .dm-target.is-hot { box-shadow: 0 0 0 calc(var(--u) * 3) rgba(31, 122, 224, 0.28); }
.stage[data-theme='dark'] .dm-target.is-hot { box-shadow: 0 0 0 calc(var(--u) * 3) rgba(77, 155, 245, 0.42); }

/* 暗色子树上重新声明「组件层别名」（tokens.css 第 3 节把 --card-bg 等定义成 var(--bg-surface) 这类别名，
   自定义属性在**声明它的元素**上就完成了替换，:root 上的那份会带着浅色值继承进来）。只列本演示用到的。 */
.stage[data-theme='dark'] {
  --card-bg: var(--bg-surface);
  --card-bd: var(--border-default);
  --topbar-bg: var(--bg-surface);
  --topbar-bd: var(--border-default);
  --page-desc-fg: var(--text-secondary);
}

.grow { flex: 1; min-width: 0; }

/* 字标（自绘，代替 assets/logo.svg） */
.logo-mark {
  display: grid; place-items: center; width: calc(var(--u) * 34); height: calc(var(--u) * 34);
  border-radius: calc(var(--u) * 9); background: var(--brand-600); color: #fff;
  font-size: calc(var(--u) * 17); font-weight: 600;
}
.logo-mark.sm { width: calc(var(--u) * 18); height: calc(var(--u) * 18); border-radius: calc(var(--u) * 5); font-size: calc(var(--u) * 10); }

/* ===== ① 登录页：负外边距抵掉 .df-body 的内边距，让页面铺满窗口内容区 ===== */
.login {
  display: flex; flex-direction: column; align-items: center;
  margin: calc(var(--u) * -14); padding: calc(var(--u) * 26) 0 calc(var(--u) * 30);
  background: var(--bg-canvas);
}
.login-title { margin-top: calc(var(--u) * 10); font-size: calc(var(--u) * 20); font-weight: 600; letter-spacing: calc(var(--u) * -0.2); color: var(--text-strong); }
.login-desc { margin-top: calc(var(--u) * 4); font-size: calc(var(--u) * 12); color: var(--text-tertiary); }
.login-form { display: flex; flex-direction: column; gap: calc(var(--u) * 9); width: calc(var(--u) * 250); margin-top: calc(var(--u) * 16); }
.field { display: flex; flex-direction: column; gap: calc(var(--u) * 4); }
.field-label { font-size: calc(var(--u) * 11); color: var(--text-secondary); }
.login-form .dm-input { height: calc(var(--u) * 28); font-size: calc(var(--u) * 12.5); }
.login-submit { justify-content: center; height: calc(var(--u) * 30); font-size: calc(var(--u) * 13); }

/* ===== ② 教师控制台：同样负外边距，做出「整个窗口都是应用」的样子 ===== */
.console { display: flex; align-items: stretch; margin: calc(var(--u) * -14); }
.sider {
  display: flex; flex-direction: column; flex: none; width: calc(var(--u) * 152);
  padding: calc(var(--u) * 10) calc(var(--u) * 7) calc(var(--u) * 12);
  background: var(--sider-bg); border-right: 1px solid var(--sider-bd);
}
.sider-logo { display: flex; align-items: center; gap: calc(var(--u) * 6); padding: 0 calc(var(--u) * 6) calc(var(--u) * 10); }
.sider-logo b { font-size: calc(var(--u) * 11.5); font-weight: 600; color: var(--sider-fg-strong); }
.sider-group { padding: calc(var(--u) * 7) calc(var(--u) * 6) calc(var(--u) * 3); font-size: calc(var(--u) * 10); color: var(--sider-group-fg); }
.sider-item {
  display: flex; align-items: center; height: calc(var(--u) * 26); padding: 0 calc(var(--u) * 7);
  border-radius: calc(var(--u) * 6); font-size: calc(var(--u) * 11.5); color: var(--sider-fg);
}
.sider-badge {
  margin-left: auto; min-width: calc(var(--u) * 16); height: calc(var(--u) * 15); padding: 0 calc(var(--u) * 4);
  border-radius: calc(var(--u) * 8); background: var(--status-danger-bg); color: var(--status-danger-fg);
  font-size: calc(var(--u) * 10); line-height: calc(var(--u) * 15); text-align: center;
}
/* 侧栏项的光标往内收：默认的 -5u 会越过侧栏分隔线 */
.sider-item .dm-cursor { right: calc(var(--u) * 3); }

.main { display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-canvas); }
.topbar {
  display: flex; align-items: center; gap: calc(var(--u) * 8); flex: none;
  height: calc(var(--u) * 36); padding: 0 calc(var(--u) * 12);
  background: var(--topbar-bg); border-bottom: 1px solid var(--topbar-bd);
}
.trigger { width: calc(var(--u) * 15); height: calc(var(--u) * 15); color: var(--text-secondary); }
.theme-btn {
  display: inline-grid; place-items: center; margin-left: auto; width: calc(var(--u) * 26); height: calc(var(--u) * 26);
  border: 1px solid transparent; border-radius: calc(var(--u) * 7); color: var(--text-secondary);
}
.theme-icon { width: calc(var(--u) * 15); height: calc(var(--u) * 15); }
.user-area { display: flex; align-items: center; gap: calc(var(--u) * 6); padding-left: calc(var(--u) * 6); }
.avatar {
  display: grid; place-items: center; width: calc(var(--u) * 20); height: calc(var(--u) * 20);
  border-radius: 50%; background: var(--brand-600); color: #fff; font-size: calc(var(--u) * 10);
}
.user-meta { display: flex; flex-direction: column; }
.user-meta b { font-size: calc(var(--u) * 11.5); font-weight: 500; color: var(--text-primary); }
.user-meta i { font-size: calc(var(--u) * 9.5); font-style: normal; color: var(--text-tertiary); }

.content { flex: 1; min-width: 0; padding: calc(var(--u) * 12) calc(var(--u) * 14) calc(var(--u) * 14); }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: calc(var(--u) * 10); margin-bottom: calc(var(--u) * 10); }
.page-title { font-size: calc(var(--u) * 14); font-weight: 600; color: var(--text-strong); }
.page-desc { margin-top: calc(var(--u) * 3); font-size: calc(var(--u) * 10.5); color: var(--page-desc-fg); }
.page-actions { display: flex; align-items: center; gap: calc(var(--u) * 6); flex: none; }

.kpi-row { display: flex; gap: calc(var(--u) * 8); margin-bottom: calc(var(--u) * 10); }
.kpi {
  flex: 1; min-width: 0; padding: calc(var(--u) * 8) calc(var(--u) * 9);
  border: 1px solid var(--card-bd); border-radius: calc(var(--u) * 8); background: var(--card-bg);
}
.kpi-label { font-size: calc(var(--u) * 10); color: var(--text-tertiary); }
.kpi-value { margin-top: calc(var(--u) * 2); font-size: calc(var(--u) * 17); font-weight: 600; color: var(--text-strong); }
.kpi-value small { margin-left: calc(var(--u) * 3); font-size: calc(var(--u) * 10); font-weight: 400; color: var(--text-tertiary); }
.kpi-value.tone-warn { color: var(--status-warning-fg); }
.kpi-sub { margin-top: calc(var(--u) * 2); font-size: calc(var(--u) * 9.5); color: var(--text-tertiary); }

.head { color: var(--text-tertiary); background: var(--bg-surface-2); }
.col-cls { width: calc(var(--u) * 118); flex: none; }
.col-st { width: calc(var(--u) * 74); flex: none; }
.stack { display: flex; flex-direction: column; }
.stack b { font-size: calc(var(--u) * 12); font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stack i { font-style: normal; }
.dm-tag.tag-ok { background: var(--status-success-bg); border-color: var(--status-success-bd); color: var(--status-success-fg); }
</style>
