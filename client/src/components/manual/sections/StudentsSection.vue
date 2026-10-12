<template>
  <ManualStep
    :steps="scene.steps"
    :caption="scene.caption"
    :aria-label="scene.ariaLabel"
    :fallback="fallback"
    fallback-alt="学生管理页与「新增学生」弹窗、重置密码确认框截图"
  >
    <template #default="{ step }">
      <DemoFrame chrome="window" title="Deadpan 判题 · 学生管理" :design="720">
        <!-- 页头：标题 + 说明 + 两个主操作（第 0 步高亮「新增学生」） -->
        <div class="dm-row page-head">
          <div class="page-text">
            <div class="dm-title">学生管理</div>
            <div class="page-desc">按班级维护学生名单；支持单个新增与 Excel 批量导入（缺学号或姓名的行会标为待补全）。</div>
          </div>
          <span class="dm-btn">批量导入</span>
          <span class="dm-btn is-primary dm-target" :class="{ 'is-hot': step === 0 }">
            新增学生
            <i v-if="step === 0" class="dm-cursor is-on" />
          </span>
        </div>

        <!-- 工具栏：班级筛选（必选）+ 搜索 + 总人数 -->
        <div class="dm-row bar">
          <span class="dm-input pin">软件工程 1 班</span>
          <span class="dm-input dm-input--search is-ph">搜索学生姓名</span>
          <span class="grow" />
          <span class="dm-sub">共 {{ step >= 3 ? 4 : 3 }} 名学生</span>
        </div>

        <!-- 名单：学号（等宽）/ 姓名（首字头像 + 班级副行）/ 学校 / 操作 -->
        <div class="dm-surface list">
          <div class="dm-row lrow is-head">
            <span class="c-sid">学号</span>
            <span class="grow">姓名</span>
            <span class="c-school">学校</span>
            <span class="c-act">操作</span>
          </div>

          <!-- 新增的学生：第 3 步「确定」后出现在第一行 -->
          <Transition name="dm-fade">
            <div v-if="step >= 3" :key="newStudent.sid" class="dm-row lrow is-new">
              <span class="c-sid"><i class="f-mono">{{ newStudent.sid }}</i></span>
              <span class="grow f-name">
                <i class="f-avatar">{{ newStudent.name.charAt(0) }}</i>
                <span class="f-stack">
                  <b>{{ newStudent.name }}</b>
                  <span>{{ newStudent.className }}</span>
                </span>
              </span>
              <span class="c-school f-school">{{ newStudent.school }}</span>
              <span class="c-act f-actions">
                <i class="dm-btn is-link">编辑</i>
                <i class="dm-btn is-link is-danger">删除</i>
              </span>
            </div>
          </Transition>

          <div v-for="stu in students" :key="stu.sid" class="dm-row lrow" :class="{ 'is-on': step >= 4 && stu.sid === students[0].sid }">
            <span class="c-sid"><i class="f-mono">{{ stu.sid }}</i></span>
            <span class="grow f-name">
              <i class="f-avatar">{{ stu.name.charAt(0) }}</i>
              <span class="f-stack">
                <b>{{ stu.name }}</b>
                <span>{{ stu.className }}</span>
              </span>
            </span>
            <span class="c-school f-school">{{ stu.school }}</span>
            <span class="c-act f-actions">
              <i class="dm-btn is-link">编辑</i>
              <i class="dm-btn is-link is-danger">删除</i>
              <!-- 重置密码只在这一行演示：第 4 步把它点亮 -->
              <i
                v-if="stu.sid === students[0].sid"
                class="dm-btn is-dashed is-danger dm-target"
                :class="{ 'is-hot': step === 4 }"
              >
                重置密码
                <i v-if="step === 4" class="dm-cursor is-on" />
              </i>
            </span>
          </div>
        </div>

        <!-- 新增学生弹窗：第 1 步打开；第 2 步填入学号/姓名/班级；第 3 步「确定」后关闭并落成新行。
             呈现方式与真弹窗一致：遮罩铺满演示屏（页头 + 工具栏 + 名单一起被盖住），弹窗居中压在遮罩之上。
             覆盖层不进文档流 —— 打开与关闭都不会改变演示框高度。 -->
        <template v-if="step >= 1 && step <= 2">
          <div class="dm-mask dm-mask-in" />
          <div class="dm-modal-layer">
            <div class="dm-surface dlg dm-modal dm-modal-in">
              <div class="dm-row dlg-head">
                <b>新增学生</b>
                <span class="grow" />
                <span class="dm-sub">✕</span>
              </div>
              <div class="dlg-body">
                <div class="frow">
                  <span class="flabel">学号</span>
                  <span class="dm-input grow" :class="{ 'is-ph': step < 2, 'is-focus': step === 2 }">
                    {{ step >= 2 ? newStudent.sid : '请输入学号' }}
                  </span>
                </div>
                <div class="frow">
                  <span class="flabel">姓名</span>
                  <span class="dm-input grow" :class="{ 'is-ph': step < 2, 'is-focus': step === 2 }">
                    {{ step >= 2 ? newStudent.name : '请输入姓名' }}
                  </span>
                </div>
                <div class="frow">
                  <span class="flabel">班级</span>
                  <span class="dm-input grow" :class="{ 'is-ph': step < 2, 'is-focus': step === 2 }">
                    {{ step >= 2 ? newStudent.className : '选择班级' }}
                    <span class="grow" />
                    <span class="caret">⌄</span>
                  </span>
                </div>
              </div>
              <div class="dm-row dlg-foot">
                <span class="grow" />
                <span class="dm-btn">取消</span>
                <span class="dm-btn is-primary dm-target" :class="{ 'is-hot': step === 2 }">
                  新增学生
                  <i v-if="step === 2" class="dm-cursor is-on" />
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- 重置密码确认框（第 4 步）：同样是遮罩 + 居中弹窗（覆盖层），确认后弹 toast -->
        <template v-if="step >= 4">
          <div class="dm-mask dm-mask-in" />
          <div class="dm-modal-layer">
            <div class="dm-surface dlg dm-modal dm-modal-in">
              <div class="dm-row dlg-head">
                <b>{{ resetConfirm.title }}</b>
                <span class="grow" />
                <span class="dm-sub">✕</span>
              </div>
              <div class="dlg-body">
                <div class="dm-sub">{{ resetConfirm.desc }}（学生：{{ students[0].name }} · {{ students[0].sid }}）</div>
              </div>
              <div class="dm-row dlg-foot">
                <span class="grow" />
                <span class="dm-btn">{{ resetConfirm.cancelText }}</span>
                <span class="dm-btn is-danger is-solid dm-target" :class="{ 'is-hot': step === 4 }">
                  {{ resetConfirm.okText }}
                  <i v-if="step === 4" class="dm-cursor is-on" />
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- toast 留在文档流里（对应真实界面确认后由 message 弹出的提示条）：它在遮罩之下，与页面一起被压暗 -->
        <Transition name="dm-fade">
          <div v-if="step >= 4" class="mt toast-row">
            <span class="dm-toast">✓ {{ resetConfirm.toast }}</span>
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
export const meta = { order: 4, title: '4. 学生管理 · 添加学生与重置密码', anchor: 'students' };
</script>

<script setup>
/**
 * 手册 · 第 4 节「学生管理」的可播放演示
 *
 * 镜像 client/src/views/teacher/Students.vue 的排版观感：学号走等宽（真实页用全局 .lp-mono）、
 * 姓名列是「24px 首字头像 + 两行式」（.lp-name / .lp-avatar / .lp-stack）、操作区右对齐紧凑（.lp-actions）。
 * 这里用 calc(var(--u) * N) 复刻同一套观感 —— 那批全局类是按真实 px 写死的，直接搬进来会破坏
 * DemoFrame 的设计单位缩放（硬规则 2）。不 import 任何业务组件，假数据全部来自场景文件。
 *
 * 状态只由插槽参数 step 决定，步骤之间用 CSS transition（--duration-base + --ease-out）。
 */
import ManualStep from '../ManualStep.vue';
import DemoFrame from '../DemoFrame.vue';
import { students, newStudent, resetConfirm, studentsScene as scene } from '../scenes/students.js';

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
.dm-input.pin { flex: none; width: calc(var(--u) * 132); white-space: nowrap; }
.dm-input--search { flex: none; width: calc(var(--u) * 122); }

/* ---- 名单：四列定宽走 calc(var(--u) * N)，姓名列吃掉剩余宽度 ----
   弹窗打开时名单不再自己压暗：整屏由 .dm-mask 统一盖住。 */
.lrow { padding: calc(var(--u) * 9) calc(var(--u) * 10); border-bottom: 1px solid var(--border-subtle); }
.lrow:last-child { border-bottom: 0; }
.is-head { background: var(--bg-surface-2); color: var(--text-tertiary); font-size: calc(var(--u) * 11.5); }
.c-sid { flex: none; width: calc(var(--u) * 88); }
.c-school { flex: none; width: calc(var(--u) * 104); }
.c-act { flex: none; margin-left: calc(var(--u) * 2); }
.is-new { background: var(--bg-selected); }

/* 姓名列（镜像 .lp-name + .lp-avatar + .lp-stack） */
.f-name { display: flex; align-items: center; gap: calc(var(--u) * 8); min-width: 0; }
.f-avatar {
  flex: none; width: calc(var(--u) * 24); height: calc(var(--u) * 24); border-radius: 999px;
  display: inline-grid; place-items: center; font-style: normal; font-size: calc(var(--u) * 12);
  font-weight: 600; background: var(--bg-hover); color: var(--text-brand); border: 1px solid var(--border-subtle);
}
.f-stack { display: flex; flex-direction: column; gap: calc(var(--u) * 2); min-width: 0; }
.f-stack > b { font-size: calc(var(--u) * 14); font-weight: 500; line-height: 1.35; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.f-stack > span { font-size: calc(var(--u) * 12); line-height: 1.45; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 学号（镜像 .lp-mono）与学校（单行省略，镜像 .stu-school） */
.f-mono { font-family: var(--font-mono); font-style: normal; font-size: calc(var(--u) * 13); color: var(--text-secondary); white-space: nowrap; }
.f-school { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: calc(var(--u) * 12); color: var(--text-primary); }

/* 操作区（镜像 .lp-actions：右对齐、紧凑） */
.f-actions { display: flex; align-items: center; justify-content: flex-end; gap: calc(var(--u) * 2); position: relative; }
.f-actions .dm-btn { height: calc(var(--u) * 24); padding: 0 calc(var(--u) * 5); font-size: calc(var(--u) * 12); font-style: normal; }
.f-actions .dm-btn.is-link.is-danger { color: var(--status-danger-fg); }
.dm-btn.is-dashed { border-style: dashed; border-color: var(--status-danger-bd); color: var(--status-danger-fg); }
.dm-btn.is-solid { background: var(--status-danger-fg); border-color: var(--status-danger-fg); color: #fff; }

/* ---- 弹窗（新增学生 / 重置密码确认）：本体是 .dm-modal（宽 460u），这里只补视觉细节 ---- */
.dlg { box-shadow: 0 12px 32px rgba(16, 24, 40, 0.16); }
.dlg-head { padding: calc(var(--u) * 10) calc(var(--u) * 12); border-bottom: 1px solid var(--border-subtle); font-size: calc(var(--u) * 13.5); }
.dlg-body { display: flex; flex-direction: column; gap: calc(var(--u) * 10); padding: calc(var(--u) * 12); }
.dlg-foot { padding: calc(var(--u) * 10) calc(var(--u) * 12); border-top: 1px solid var(--border-subtle); background: var(--bg-surface-2); }
.frow { display: flex; align-items: center; gap: calc(var(--u) * 10); }
.flabel { flex: none; width: calc(var(--u) * 44); text-align: right; font-size: calc(var(--u) * 12.5); color: var(--text-secondary); }
.dm-input.is-focus { border-color: var(--brand-600); box-shadow: 0 0 0 calc(var(--u) * 3) var(--ring-focus, rgba(0, 102, 204, 0.18)); }
.caret { flex: none; color: var(--text-tertiary); }
.toast-row { display: flex; justify-content: flex-end; }
</style>
