<template>
  <ManualStep
    :steps="scene.steps"
    :caption="scene.caption"
    :aria-label="scene.ariaLabel"
    :fallback="fallback"
    fallback-alt="班级管理列表与「新增班级」模态框截图"
  >
    <template #default="{ step }">
      <DemoFrame chrome="window" title="Deadpan 判题 · 班级管理" :design="720">
        <!-- 页头：标题 + 说明 + 右上「新增班级」（与 Classes.vue 的 PageShell #actions 同位置） -->
        <div class="dm-row page-head">
          <div class="page-text">
            <div class="dm-title">班级管理</div>
            <div class="page-desc">维护你名下的班级；班级可加入教学团队分享给同事，也能在多个学校之间迁移。</div>
          </div>
          <span class="dm-btn is-primary dm-target" :class="{ 'is-hot': step === 1 }">
            新增班级
            <i v-if="step === 1" class="dm-cursor is-on" />
          </span>
        </div>

        <!-- 工具栏：左＝创建成功提示（第 3 步起，位置留给 antd message），右＝班级总数（创建后 +1） -->
        <div class="dm-row bar">
          <span class="toast-slot">
            <Transition name="dm-fade">
              <span v-if="step >= 3" class="dm-toast">✓ {{ newClass.toast }}</span>
            </Transition>
          </span>
          <span class="grow" />
          <span class="dm-sub">共 {{ step >= 3 ? classRows.length + 1 : classRows.length }} 个班级</span>
        </div>

        <!-- 列表：班级名称（两行式）/ 人数（右对齐等宽数字）/ 创建时间 / 操作 —— 列顺序同 Classes.vue -->
        <div class="dm-surface list" :class="{ 'is-dim': step === 2 }">
          <div class="dm-row lrow is-head">
            <span class="grow">班级名称</span>
            <span class="c-count dm-target" :class="{ 'is-hot': step === 4 }">人数</span>
            <span class="c-time">创建时间</span>
            <span class="c-act c-act--right">操作</span>
          </div>

          <!-- 新建的班级：第 3 步点「新增班级」确定后插到列表第一行，并闪一次高亮 -->
          <div v-if="step >= 3" class="dm-row lrow is-new">
            <span class="grow f-stack">
              <b><span class="f-name">{{ newClass.name }}</span></b>
              <span>{{ newClass.school }}</span>
            </span>
            <span class="c-count" :class="{ 'is-pulse': step === 4 }"><b>0</b><u>人</u></span>
            <span class="c-time">{{ newClass.createdAt }}</span>
            <span class="c-act f-actions">
              <span class="dm-btn is-link">编辑</span>
              <span class="dm-btn is-link">切换学校</span>
              <span class="dm-btn is-link is-danger">删除</span>
            </span>
          </div>

          <div v-for="row in classRows" :key="row.name" class="dm-row lrow">
            <span class="grow f-stack">
              <b>
                <span class="f-name">{{ row.name }}</span>
                <i v-if="row.team" class="dm-tag is-accent">{{ row.team }}</i>
              </b>
              <span>{{ row.school }}</span>
            </span>
            <span class="c-count" :class="{ 'is-pulse': step === 4 }"><b>{{ row.count }}</b><u>人</u></span>
            <span class="c-time">{{ row.createdAt }}</span>
            <span class="c-act f-actions">
              <span class="dm-btn is-link" :class="{ 'is-off': !!row.team }">编辑</span>
              <span class="dm-btn is-link" :class="{ 'is-off': !!row.team }">切换学校</span>
              <span class="dm-btn is-link is-danger" :class="{ 'is-off': !!row.team }">删除</span>
            </span>
          </div>
        </div>

        <!-- 人数说明：第 4 步高亮人数列时给出（人数来自学生名单，不是手填的） -->
        <Transition name="dm-fade">
          <div v-if="step === 4" class="hint">
            <i class="hint-dot">i</i>
            <span>
              <b>人数</b>来自该班级的学生名单：在「学生管理」里导入或移除学生，这个数字会跟着变；
              新建的班级还没有学生，所以先是 <b>0 人</b>。
            </span>
          </div>
        </Transition>

        <!-- 新增班级模态框：第 2 步打开并逐字输入班级名称，第 3 步点「新增班级」确认（文案同 Classes.vue） -->
        <Transition name="dm-fade">
          <div v-if="step === 2 || step === 3" class="mt">
            <div class="dm-surface dlg">
              <div class="dm-row dlg-head">
                <b>{{ newClass.modalTitle }}</b>
                <span class="grow" />
                <span class="dm-sub">✕</span>
              </div>
              <div class="dlg-body">
                <div class="frow">
                  <span class="flabel">班级名称</span>
                  <span class="dm-input grow" :class="{ 'is-focus': step === 2 }">
                    <span class="typed-wrap">
                      <span class="typed">{{ newClass.name }}</span>
                      <i class="caret" />
                    </span>
                    <span class="ph">{{ newClass.namePlaceholder }}</span>
                  </span>
                </div>
                <div class="frow">
                  <span class="flabel">指定教学团队</span>
                  <span class="dm-input grow is-ph">
                    {{ newClass.teamPlaceholder }}
                    <span class="grow" />
                    <span class="chev">⌄</span>
                  </span>
                </div>
              </div>
              <div class="dm-row dlg-foot">
                <span class="grow" />
                <span class="dm-btn">{{ newClass.cancelText }}</span>
                <span class="dm-btn is-primary dm-target" :class="{ 'is-hot': step === 3 }">
                  {{ newClass.okText }}
                  <i v-if="step === 3" class="dm-cursor is-on" />
                </span>
              </div>
            </div>
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
export const meta = { order: 3, title: '3. 班级管理 · 新建与查看人数', anchor: 'classes' };
</script>

<script setup>
/**
 * 手册 · 第 3 节「班级管理」的可播放演示
 *
 * 镜像 client/src/views/teacher/Classes.vue 的排版观感：列顺序是「班级名称 / 人数 / 创建时间 / 操作」，
 * 班级名称走两行式（.lp-stack：上行班级名 + 团队共享标签，下行所属学校），人数是右对齐等宽数字 + 弱化的「人」，
 * 操作区右对齐（编辑 / 切换学校 / 删除，团队共享行禁用）。这里用 calc(var(--u) * N) 复刻同一套观感 ——
 * 那批全局类是按真实 px 写死的，直接搬进来会破坏 DemoFrame 的设计单位缩放（硬规则 2）。
 * 不 import 任何业务组件，假数据全部来自场景文件。
 *
 * 状态只由插槽参数 step 决定，步骤之间用 CSS transition；「打字感」与「新行高亮」用 CSS keyframes 写，
 * 于是播放器暂停时它们也会一起冻结（见 ManualStep 的 animation-play-state 规则）。
 */
import ManualStep from '../ManualStep.vue';
import DemoFrame from '../DemoFrame.vue';
import { classRows, newClass, classesScene as scene } from '../scenes/classes.js';

defineProps({
  /** 截图兜底（由 docs/manual/shots.mjs 生成）；不传则直接显示复刻界面 */
  fallback: { type: String, default: '' },
});
</script>

<style scoped>
.grow { flex: 1; min-width: 0; }
.mt { margin-top: calc(var(--u) * 10); }

/* ---- 页头 / 工具栏 ---- */
.page-head { align-items: flex-start; gap: calc(var(--u) * 12); margin-bottom: calc(var(--u) * 10); }
.page-text { flex: 1; min-width: 0; }
.page-desc { margin-top: calc(var(--u) * 2); font-size: calc(var(--u) * 11.5); line-height: 1.5; color: var(--text-tertiary); }
.bar { margin-bottom: calc(var(--u) * 10); }
/* 提示条固定在工具栏左侧：无论有没有 toast，工具栏高度都不跳 */
.toast-slot { display: flex; align-items: center; min-height: calc(var(--u) * 26); }

/* ---- 列表：三列定宽走 calc(var(--u) * N)，班级名称吃掉剩余宽度 ---- */
.list { transition: opacity var(--duration-base) var(--ease-out); }
.list.is-dim { opacity: 0.5; }
.lrow { align-items: center; padding: calc(var(--u) * 9) calc(var(--u) * 10); border-bottom: 1px solid var(--border-subtle); }
.lrow:last-child { border-bottom: 0; }
.is-head { background: var(--bg-surface-2); color: var(--text-tertiary); font-size: calc(var(--u) * 11.5); }

/* 班级名称：两行式（镜像 .lp-stack） */
.f-stack { display: flex; flex-direction: column; gap: calc(var(--u) * 2); min-width: 0; }
.f-stack > b { display: flex; align-items: center; gap: calc(var(--u) * 6); min-width: 0; font-size: calc(var(--u) * 13.5); font-weight: 500; line-height: 1.35; color: var(--text-strong); }
.f-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.f-stack > b > .dm-tag { flex: none; }
.f-stack > span { font-size: calc(var(--u) * 12); line-height: 1.45; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 人数：右对齐等宽数字 + 弱化的「人」（镜像 .lp-num） */
.c-count { flex: none; width: calc(var(--u) * 74); display: flex; align-items: baseline; justify-content: flex-end; gap: calc(var(--u) * 2); padding: calc(var(--u) * 2) calc(var(--u) * 4); border-radius: calc(var(--u) * 5); font-variant-numeric: tabular-nums; transition: background var(--duration-base) var(--ease-out); }
.c-count > b { font-size: calc(var(--u) * 13); font-weight: 500; color: var(--text-strong); }
.c-count > u { font-size: calc(var(--u) * 11); text-decoration: none; color: var(--text-tertiary); }
.c-count.is-pulse { background: var(--bg-selected); }

.c-time { flex: none; width: calc(var(--u) * 94); font-size: calc(var(--u) * 12); color: var(--text-secondary); font-variant-numeric: tabular-nums; }

/* 操作区（镜像 .lp-actions：右对齐、紧凑，团队共享行禁用） */
/* 操作列定宽：表头只有「操作」两个字，若按内容定宽会让表头与表体的列错位 */
.c-act { flex: none; width: calc(var(--u) * 134); }
/* 表头「操作」跟表体一样右对齐（真实列表的 action 列是 align: 'right'） */
.c-act--right { text-align: right; }
.f-actions { display: flex; align-items: center; justify-content: flex-end; gap: calc(var(--u) * 2); }
.f-actions .dm-btn { height: calc(var(--u) * 24); padding: 0 calc(var(--u) * 5); font-size: calc(var(--u) * 12); }
.f-actions .dm-btn.is-danger { color: var(--status-danger-fg); }
.f-actions .dm-btn.is-off { color: var(--text-tertiary); opacity: 0.55; }

/* 新建的行：入列时闪一次高亮（播放器暂停会一起冻结） */
.is-new { animation: cls-row-in 1500ms var(--ease-out) both; }
@keyframes cls-row-in {
  0% { opacity: 0; transform: translateY(calc(var(--u) * -6)); background: var(--bg-selected); }
  20% { opacity: 1; transform: none; background: var(--bg-selected); }
  100% { opacity: 1; transform: none; background: transparent; }
}

/* ---- 人数说明 ---- */
.hint { display: flex; align-items: flex-start; gap: calc(var(--u) * 8); margin-top: calc(var(--u) * 10); padding: calc(var(--u) * 8) calc(var(--u) * 10); border: 1px dashed var(--border-default); border-radius: calc(var(--u) * 8); font-size: calc(var(--u) * 11.5); line-height: 1.55; color: var(--text-secondary); }
.hint b { color: var(--text-strong); white-space: nowrap; }
.hint-dot { flex: none; width: calc(var(--u) * 16); height: calc(var(--u) * 16); margin-top: calc(var(--u) * 1); display: inline-grid; place-items: center; border-radius: 50%; font-style: normal; font-size: calc(var(--u) * 10); font-weight: 600; color: var(--text-brand); background: var(--bg-selected); }

/* ---- 新增班级模态框（字段与按钮文案同 Classes.vue：班级名称 / 指定教学团队 / 取消 / 新增班级） ---- */
.dlg { box-shadow: 0 12px 32px rgba(16, 24, 40, 0.16); }
.dlg-head { padding: calc(var(--u) * 10) calc(var(--u) * 12); border-bottom: 1px solid var(--border-subtle); font-size: calc(var(--u) * 13.5); }
.dlg-body { display: flex; flex-direction: column; gap: calc(var(--u) * 10); padding: calc(var(--u) * 12); }
.dlg-foot { padding: calc(var(--u) * 10) calc(var(--u) * 12); border-top: 1px solid var(--border-subtle); background: var(--bg-surface-2); }
.frow { display: flex; align-items: center; gap: calc(var(--u) * 10); }
.flabel { flex: none; width: calc(var(--u) * 78); text-align: right; font-size: calc(var(--u) * 12.5); color: var(--text-secondary); }
.dm-input.is-focus { border-color: var(--brand-600); box-shadow: 0 0 0 calc(var(--u) * 3) rgba(31, 122, 224, 0.28); }
.chev { flex: none; color: var(--text-tertiary); }

/* 打字感：先占位提示（600ms）→ 提示淡出，同时文字按 steps 逐字出现 */
.dm-input { position: relative; overflow: hidden; }
.typed-wrap { display: inline-flex; align-items: center; }
.typed { display: inline-block; clip-path: inset(0 100% 0 0); animation: cls-type 900ms steps(8, end) 600ms both; }
@keyframes cls-type { to { clip-path: inset(0 0 0 0); } }
.caret { display: inline-block; width: calc(var(--u) * 1.6); height: calc(var(--u) * 13); margin-left: calc(var(--u) * 1.5); background: var(--text-strong); opacity: 0; animation: cls-caret 1000ms linear 600ms infinite; }
@keyframes cls-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.ph { position: absolute; left: calc(var(--u) * 8); top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--text-tertiary); animation: cls-ph-out 240ms linear 600ms both; }
@keyframes cls-ph-out { to { opacity: 0; } }

/* 高亮环：--ring-focus 这个 token 存的是整条 box-shadow（0 0 0 3px …），
   直接当颜色用会让 box-shadow 变成非法值被丢弃，所以这里显式写一遍同款描边。 */
.dm-target.is-hot { box-shadow: 0 0 0 calc(var(--u) * 3) rgba(31, 122, 224, 0.28); }
</style>
