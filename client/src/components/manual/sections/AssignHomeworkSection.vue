<template>
  <ManualStep
    :steps="scene.steps"
    :caption="scene.caption"
    :aria-label="scene.ariaLabel"
    :fallback="fallback"
    fallback-alt="作业管理页与「布置作业」弹窗截图"
  >
    <template #default="{ step }">
      <DemoFrame chrome="window" title="Deadpan 判题 · 作业管理" :design="720">
        <!-- 工具栏：第 0 步高亮「布置作业」 -->
        <div class="dm-row row-toolbar">
          <span class="dm-input is-ph grow">搜索作业名称</span>
          <span class="dm-btn">全部班级</span>
          <span class="dm-btn dm-target" :class="{ 'is-hot': step === 0 }">
            布置作业<i v-if="step === 0" class="dm-cursor is-on" />
          </span>
        </div>

        <!-- 列表：弹窗打开后压暗（表示"在弹窗之下"） -->
        <div class="dm-surface list" :class="{ 'is-dim': step >= 1 }">
          <div class="dm-table-row head"><span class="grow">作业名称</span><span>班级</span><span>状态</span></div>
          <div class="dm-table-row"><span class="grow">E2E测试作业</span><span class="dm-sub">软件工程 1 班</span><span class="dm-tag is-mute">已结束</span></div>
          <div class="dm-table-row"><span class="grow">E2E过期作业</span><span class="dm-sub">软件工程 1 班</span><span class="dm-tag is-mute">已结束</span></div>
        </div>

        <!-- 弹窗：第 1 步出现 -->
        <Transition name="dm-fade">
          <div v-if="step >= 1" class="modal-wrap">
            <div class="dm-surface modal">
              <div class="modal-head"><b>布置作业</b><span class="dm-sub">✕</span></div>
              <div class="modal-body">
                <!-- ① 基本信息 -->
                <div class="dm-surface">
                  <div class="dm-block-head">① 基本信息<span>学生端显示这个标题</span></div>
                  <div class="dm-pad dm-col">
                    <div class="dm-input is-ph" :class="{ 'is-filled': step >= 2 }">
                      {{ step >= 2 ? '第三章 循环与数组' : '例如：第三章 循环与数组' }}
                    </div>
                  </div>
                </div>
                <!-- ② 题目（单选，整行可点） -->
                <div class="dm-surface">
                  <div class="dm-block-head">② 题目<span>单选 · 点整行即可选中</span></div>
                  <div v-if="step < 2">
                    <div class="dm-table-row dm-target" :class="{ 'is-hot': step === 1 }">
                      <span class="dm-check" /><span class="grow">E2E实训题1786885975209</span>
                      <span class="dm-tag is-accent">实训题</span><span class="dm-sub">100 分</span>
                      <i v-if="step === 1" class="dm-cursor is-on" />
                    </div>
                    <div class="dm-table-row"><span class="dm-check" /><span class="grow">E2E测试题</span><span class="dm-tag is-info">编程题</span><span class="dm-sub">10 分</span></div>
                    <div class="dm-table-row"><span class="dm-check" /><span class="grow">Java 集合与异常处理综合</span><span class="dm-tag is-info">编程题</span><span class="dm-sub">20 分</span></div>
                  </div>
                  <div v-else class="dm-pad dm-row picked">
                    <span class="dm-tag is-accent">实训题</span>
                    <b class="grow">E2E实训题1786885975209</b>
                    <span class="dm-sub">中等 · 100 分</span>
                    <span class="dm-btn is-link">换一题</span>
                  </div>
                </div>
                <!-- ③ 班级（带人数） -->
                <div class="dm-surface">
                  <div class="dm-block-head">③ 班级<span>可多选</span></div>
                  <div class="dm-pad dm-row wrap">
                    <span class="dm-btn" :class="{ 'is-on': step >= 3 }">软件工程 1 班 <i class="dm-sub">50 人</i></span>
                    <span class="dm-btn" :class="{ 'is-on': step >= 3 }">软件工程 2 班 <i class="dm-sub">48 人</i></span>
                    <span class="dm-btn">计算机科学与技术 3 班 <i class="dm-sub">46 人</i></span>
                  </div>
                </div>
                <!-- ④ 起止时间 -->
                <div class="dm-surface">
                  <div class="dm-block-head">④ 起止时间<span>已默认填好</span></div>
                  <div class="dm-pad">
                    <div class="dm-input" :class="{ 'is-ph': step < 4 }">
                      {{ step >= 4 ? '2026-10-12 18:00 → 2026-10-19 23:59' : '选择起止时间' }}
                    </div>
                  </div>
                </div>
                <!-- 右栏摘要（真实布局里在右侧；演示里放到底部一行，保证小宽度也看得清） -->
                <div class="summary">
                  <span class="dm-sub">将布置</span>
                  <span><b>{{ step >= 2 ? 1 : 0 }}</b> 题</span>
                  <span><b>{{ step >= 3 ? 2 : 0 }}</b> 个班 · <b>{{ step >= 3 ? 98 : 0 }}</b> 人</span>
                  <span class="grow" />
                  <span class="dm-tag" :class="step >= 4 ? 'is-info' : 'is-mute'">
                    {{ step >= 4 ? '✓ 信息齐了，可以布置' : '⚠ 还差：题目、班级、标题' }}
                  </span>
                  <span class="dm-btn dm-target" :class="{ 'is-primary': step >= 4, 'is-hot': step === 4 }">
                    立即布置<i v-if="step === 4" class="dm-cursor is-on" />
                  </span>
                </div>
              </div>
            </div>
            <Transition name="dm-fade">
              <div v-if="step >= 4" class="toast-wrap"><span class="dm-toast">✓ 布置成功</span></div>
            </Transition>
          </div>
        </Transition>
      </DemoFrame>
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
export const meta = { order: 8, title: '8. 作业管理 · 布置作业', anchor: 'assignments' };
</script>

<script setup>
/**
 * 手册 · 第 8 节「作业管理」的可播放演示（金标样板：其余场景照这个写）
 *
 * 结构：ManualStep（播放器/步骤驱动） → DemoFrame（外壳 + 设计单位缩放） → 复刻的假界面
 * 界面只按 props.step 渲染状态，状态之间靠 CSS transition；不调接口、不依赖登录态。
 */
import ManualStep from '../ManualStep.vue';
import DemoFrame from '../DemoFrame.vue';
import { assignHomework as scene } from '../scenes/assignHomework.js';

defineProps({
  /** 截图兜底（由 docs/manual/shots.mjs 生成）；不传则直接显示复刻界面 */
  fallback: { type: String, default: '' },
});
</script>

<style scoped>
.row-toolbar { margin-bottom: calc(var(--u) * 10); }
.grow { flex: 1; min-width: 0; }
.list { transition: opacity var(--duration-base) var(--ease-out); }
.list.is-dim { opacity: 0.42; }
.head { color: var(--text-tertiary); background: var(--bg-surface-2); }
.modal-wrap { position: relative; margin-top: calc(var(--u) * 12); }
.modal { box-shadow: 0 12px 32px rgba(16, 24, 40, 0.16); }
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: calc(var(--u) * 10) calc(var(--u) * 12); border-bottom: 1px solid var(--border-subtle); font-size: calc(var(--u) * 13); }
.modal-body { display: flex; flex-direction: column; gap: calc(var(--u) * 10); padding: calc(var(--u) * 12); }
.wrap { flex-wrap: wrap; }
.dm-btn.is-on { border-color: var(--brand-600); background: var(--bg-selected); color: var(--text-brand); }
.dm-btn.is-on .dm-sub { color: var(--text-brand); }
.dm-input.is-filled { border-color: var(--border-default); }
.picked b { font-size: calc(var(--u) * 12.5); color: var(--text-strong); }
.summary { display: flex; align-items: center; gap: calc(var(--u) * 8); padding: calc(var(--u) * 8) calc(var(--u) * 10); border: 1px dashed var(--border-default); border-radius: calc(var(--u) * 8); font-size: calc(var(--u) * 11.5); color: var(--text-secondary); }
.toast-wrap { position: absolute; right: calc(var(--u) * 10); bottom: calc(var(--u) * -6); }
</style>
