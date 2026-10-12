<template>
  <ManualStep
    :steps="scene.steps"
    :caption="scene.caption"
    :aria-label="scene.ariaLabel"
    :fallback="fallback"
    fallback-alt="教学团队列表与团队详情（班级管理标签）截图"
  >
    <template #default="{ step }">
      <DemoFrame chrome="window" title="Deadpan 判题 · 教学团队" :design="720">
        <!-- 两屏之间切换：列表页（第 0 步 / 保存后的第 3 步）↔ 团队详情页（第 1~2 步） -->
        <Transition name="dm-fade" mode="out-in">
          <!-- ============ ① 团队列表（镜像 views/teacher/Teams.vue） ============ -->
          <div v-if="step === 0 || step >= 3" key="list" class="page">
            <Transition name="dm-fade">
              <div v-if="step >= 3" class="toast-wrap"><span class="dm-toast">✓ 班级已更新</span></div>
            </Transition>

            <div class="phead">
              <div class="phead-main">
                <span class="ptitle">教学团队</span>
                <span class="pdesc">把班级和同事编入团队，团队内的班级、题库可共享给成员。</span>
              </div>
              <span class="dm-btn is-primary">创建团队</span>
            </div>

            <div class="dm-surface">
              <div class="toolbar"><span class="dm-sub">共 2 个团队</span></div>
              <div class="dm-table-row head">
                <span class="c-name">团队名称</span>
                <span class="c-owner">创建者</span>
                <span class="c-members">成员</span>
                <span class="c-classes">班级</span>
                <span class="c-act">操作</span>
              </div>

              <div class="dm-table-row">
                <span class="c-name stack">
                  <b>软件工程教研室</b>
                  <em>3 位成员</em>
                </span>
                <span class="c-owner">王建国</span>
                <span class="c-members">
                  <i class="avi">王</i><i class="avi">李</i><i class="avi">赵</i>
                  <em class="num">3<u>教师</u></em>
                </span>
                <span class="c-classes dm-target" :class="{ 'is-hot': step >= 3 }">
                  <em class="num">{{ step >= 3 ? 2 : 1 }}<u>班级</u></em>
                  <span v-if="step >= 3" class="dm-tag is-accent bump">+1</span>
                </span>
                <span class="c-act">
                  <span class="dm-btn is-link dm-target" :class="{ 'is-hot': step === 0 }">
                    管理<i v-if="step === 0" class="dm-cursor is-on cur-text" />
                  </span>
                  <span class="lnk is-danger">删除</span>
                </span>
              </div>

              <div class="dm-table-row">
                <span class="c-name stack">
                  <b>数据结构课程组</b>
                  <em>2 位成员</em>
                </span>
                <span class="c-owner">李慧敏</span>
                <span class="c-members">
                  <i class="avi">李</i><i class="avi">赵</i>
                  <em class="num">2<u>教师</u></em>
                </span>
                <span class="c-classes"><em class="num">2<u>班级</u></em></span>
                <span class="c-act">
                  <span class="dm-btn is-link">管理</span>
                  <span class="lnk">退出</span>
                </span>
              </div>

              <div class="foot">
                <span class="dm-sub">第 1 页 · 每页 20 条</span>
                <span class="pager"><i>‹</i><i class="is-on">1</i><i>›</i></span>
              </div>
            </div>
          </div>

          <!-- ============ ②③ 团队详情（镜像 views/teacher/TeamEdit.vue） ============ -->
          <div v-else key="edit" class="page">
            <div class="back-row"><span class="dm-btn is-link">← 返回教学团队</span></div>

            <div class="phead">
              <div class="phead-main">
                <span class="ptitle">软件工程教研室</span>
                <span class="pdesc">维护团队成员与共享班级；改动会自动保存。</span>
              </div>
            </div>

            <div class="card">
              <!-- 块 1：成员列表（真实页是「教师管理」标签） -->
              <div class="dm-surface">
                <div class="dm-block-head">教师管理<span>创建者不可移除</span></div>
                <div class="dm-table-row head">
                  <span class="t-name">姓名</span>
                  <span class="t-acc">工号</span>
                  <span class="t-role">角色</span>
                  <span class="t-act">操作</span>
                </div>
                <div class="dm-table-row">
                  <span class="t-name">王建国</span>
                  <span class="t-acc">wangjianguo</span>
                  <span class="t-role">创建者</span>
                  <span class="t-act"><span class="lnk is-disabled">移除</span></span>
                </div>
                <div class="dm-table-row">
                  <span class="t-name">李慧敏</span>
                  <span class="t-acc">lihuimin</span>
                  <span class="t-role">教师</span>
                  <span class="t-act"><span class="lnk is-danger">移除</span></span>
                </div>
                <div class="dm-table-row">
                  <span class="t-name">赵鹏</span>
                  <span class="t-acc">zhaopeng</span>
                  <span class="t-role">教师</span>
                  <span class="t-act"><span class="lnk is-danger">移除</span></span>
                </div>
              </div>

              <!-- 块 2：班级列表 + 添加班级（真实页是「班级管理」标签） -->
              <div class="dm-surface">
                <div class="dm-block-head">班级管理<span>搜索并添加班级，选中即加入团队</span></div>
                <div class="dm-pad picker">
                  <div class="dm-input" :class="{ 'is-ph': step < 2 }">
                    {{ step >= 2 ? '已选 2 个' : '已选 1 个' }}
                  </div>
                  <!-- 下拉展开：勾选「软件工程 2 班」（第 2 步） -->
                  <Transition name="dm-fade">
                    <div v-if="step >= 2" class="dropdown">
                      <div class="opt">
                        <span class="dm-check is-on">✓</span>
                        <span class="grow">软件工程 1 班</span>
                        <span class="dm-sub">50 人</span>
                      </div>
                      <div class="opt is-hot dm-target">
                        <span class="dm-check is-on">✓</span>
                        <span class="grow"><span class="opt-name">软件工程 2 班<i class="dm-cursor is-on" /></span></span>
                        <span class="dm-sub">48 人</span>
                      </div>
                      <div class="opt">
                        <span class="dm-check" />
                        <span class="grow">计算机科学与技术 3 班</span>
                        <span class="dm-sub">46 人</span>
                      </div>
                    </div>
                  </Transition>
                </div>
                <div class="dm-table-row head">
                  <span class="k-name">班级名称</span>
                  <span class="k-owner">归属教师</span>
                  <span class="k-act">操作</span>
                </div>
                <div class="dm-table-row">
                  <span class="k-name">软件工程 1 班</span>
                  <span class="k-owner"><span class="own">自己</span></span>
                  <span class="k-act"><span class="lnk is-danger">移除</span></span>
                </div>
                <Transition name="dm-fade">
                  <div v-if="step >= 2" class="dm-table-row is-new">
                    <span class="k-name">软件工程 2 班 <span class="dm-tag is-accent">团队</span></span>
                    <span class="k-owner"><span class="dm-tag is-accent">他人</span></span>
                    <span class="k-act"><span class="lnk is-danger">移除</span></span>
                  </div>
                </Transition>
              </div>
            </div>

            <!-- 底部动作条（真实页 FormPage #actionbar：左状态文本、右主操作） -->
            <div class="actionbar">
              <span class="dm-sub grow">{{ step >= 2 ? '同步中…' : '改动会自动保存' }}</span>
              <span class="dm-btn is-primary">保存</span>
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
 *   order   Number  在「交互演示」区里的排序（用对应章节号）
 *   title   String  小节标题
 *   anchor  String  对应原手册章节 id（Doc.vue 第 5 章 id="teams"）
 */
export const meta = { order: 5, title: '5. 教学团队 · 建团与共享班级', anchor: 'teams' };
</script>

<script setup>
/**
 * 手册 · 第 5 节「教学团队」的可播放演示（照金标样板 AssignHomeworkSection.vue 写）
 *
 * 结构：ManualStep（播放器/步骤驱动） → DemoFrame（外壳 + 设计单位缩放） → 复刻的假界面
 * 界面只按插槽参数 step 渲染状态，状态之间靠 CSS transition；不调接口、不依赖登录态、不 import 业务组件。
 */
import ManualStep from '../ManualStep.vue';
import DemoFrame from '../DemoFrame.vue';
import { teams as scene } from '../scenes/teams.js';

defineProps({
  /** 截图兜底（由 docs/manual/shots.mjs 生成）；不传则直接显示复刻界面 */
  fallback: { type: String, default: '' },
});
</script>

<style scoped>
/* ===== 页头（镜像 PageShell：标题 + 说明 + 右上主操作） ===== */
.phead { display: flex; align-items: flex-start; gap: calc(var(--u) * 10); margin-bottom: calc(var(--u) * 10); }
.phead-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: calc(var(--u) * 3); }
.ptitle { font-size: calc(var(--u) * 14); font-weight: 600; color: var(--text-strong); }
.pdesc { font-size: calc(var(--u) * 11); line-height: 1.5; color: var(--text-secondary); }

/* ===== 列表页 ===== */
.toolbar { display: flex; align-items: center; justify-content: flex-end; padding: calc(var(--u) * 7) calc(var(--u) * 10); border-bottom: 1px solid var(--border-subtle); }
.head { color: var(--text-tertiary); background: var(--bg-surface-2); }
.c-name { flex: 1 1 auto; min-width: 0; }
.c-owner { flex: none; width: calc(var(--u) * 76); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-members { flex: none; width: calc(var(--u) * 132); display: flex; align-items: center; gap: calc(var(--u) * 6); }
.c-classes { flex: none; width: calc(var(--u) * 86); display: flex; align-items: center; gap: calc(var(--u) * 5); border-radius: calc(var(--u) * 6); }
.c-act { flex: none; width: calc(var(--u) * 96); display: flex; align-items: center; justify-content: flex-end; gap: calc(var(--u) * 6); }

/* 团队名称两行式（主 = 团队名，次 = 成员数） */
.stack { display: flex; flex-direction: column; gap: calc(var(--u) * 1.5); min-width: 0; }
.stack > b { font-size: calc(var(--u) * 12); font-weight: 600; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stack > em { font-style: normal; font-size: calc(var(--u) * 10.5); color: var(--text-tertiary); }

/* 成员头像组 */
.avi {
  flex: none; width: calc(var(--u) * 17); height: calc(var(--u) * 17); border-radius: 50%; font-style: normal;
  display: inline-grid; place-items: center; font-size: calc(var(--u) * 9.5); font-weight: 600;
  background: var(--bg-hover); color: var(--text-brand); border: 1px solid var(--border-subtle);
}
.avi + .avi { margin-left: calc(var(--u) * -5); }

/* 数字 + 单位（镜像列表页 .lp-num） */
.num { font-style: normal; font-size: calc(var(--u) * 11.5); color: var(--text-primary); font-variant-numeric: tabular-nums; }
.num > u { text-decoration: none; margin-left: calc(var(--u) * 2); font-size: calc(var(--u) * 10.5); color: var(--text-tertiary); }

/* 链接型操作（镜像 antd a-button type="link"） */
.lnk { flex: none; padding: 0 calc(var(--u) * 3); border-radius: calc(var(--u) * 5); font-size: calc(var(--u) * 11.5); color: var(--text-brand); white-space: nowrap; }
.lnk.is-danger { color: var(--status-danger-fg); }
.lnk.is-disabled { color: var(--text-tertiary); }

/* 列表底部（分页栏） */
.foot { display: flex; align-items: center; justify-content: space-between; padding: calc(var(--u) * 7) calc(var(--u) * 10); border-top: 1px solid var(--border-subtle); }
.pager { display: flex; align-items: center; gap: calc(var(--u) * 4); }
.pager > i { font-style: normal; min-width: calc(var(--u) * 18); height: calc(var(--u) * 18); display: inline-grid; place-items: center; border: 1px solid var(--border-subtle); border-radius: calc(var(--u) * 5); font-size: calc(var(--u) * 10.5); color: var(--text-secondary); }
.pager > i.is-on { border-color: var(--brand-600); color: var(--text-brand); }

/* 「+1」标记：班级数变化时弹一下（动画会被播放器在暂停时冻结） */
.bump { animation: tm-bump 620ms var(--ease-out) both; }
@keyframes tm-bump {
  0% { opacity: 0; transform: scale(0.62); }
  55% { opacity: 1; transform: scale(1.12); }
  100% { opacity: 1; transform: scale(1); }
}

/* ===== 详情页 ===== */
.back-row { margin-bottom: calc(var(--u) * 6); }
.card { display: flex; flex-direction: column; gap: calc(var(--u) * 8); padding: calc(var(--u) * 10); border: 1px solid var(--border-default); border-radius: calc(var(--u) * 10); background: var(--card-bg); }
/* 列宽比例照真实页截图量取（教师表 337:356:231:208，班级表 560:301:271） */
.t-name { flex: 1.45 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.t-acc { flex: 1.53 1 0; min-width: 0; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.t-role { flex: 1 1 0; min-width: 0; color: var(--text-secondary); }
.t-act { flex: 0.9 1 0; min-width: 0; display: flex; justify-content: flex-end; }
.k-name { flex: 2.07 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.k-owner { flex: 1.11 1 0; min-width: 0; }
.k-act { flex: 1 1 0; min-width: 0; display: flex; justify-content: flex-end; }
.own { font-size: calc(var(--u) * 11.5); color: var(--text-tertiary); }
.is-new { background: var(--bg-selected); }

/* 班级选择器：收起 = 一个输入框；展开 = 输入框 + 选项列表 */
.picker { position: relative; }
.dm-input.is-ph { color: var(--text-tertiary); }
.dropdown { margin-top: calc(var(--u) * 4); padding: calc(var(--u) * 3) 0; border: 1px solid var(--border-default); border-radius: calc(var(--u) * 8); background: var(--card-bg); box-shadow: 0 6px 16px rgba(16, 24, 40, 0.1); }
/* 光标不要贴着单元格右缘（会盖住右边的「删除」）：挪到文字右下角 */
.cur-text { right: calc(var(--u) * 6); bottom: calc(var(--u) * -3); }
.opt-name { position: relative; display: inline-block; }
.opt { position: relative; display: flex; align-items: center; gap: calc(var(--u) * 7); margin: 0 calc(var(--u) * 3); padding: calc(var(--u) * 6) calc(var(--u) * 7); border-radius: calc(var(--u) * 6); font-size: calc(var(--u) * 11.5); color: var(--text-primary); }
.opt.is-hot { background: var(--bg-selected); }
.grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 底部动作条（镜像 FormPage #actionbar） */
.actionbar { display: flex; align-items: center; gap: calc(var(--u) * 8); margin-top: calc(var(--u) * 10); padding: calc(var(--u) * 8) calc(var(--u) * 10); border: 1px solid var(--border-default); border-radius: calc(var(--u) * 9); background: var(--bg-surface-2); }

/* 保存成功的提示（镜像 message.success('班级已更新')） */
.toast-wrap { display: flex; justify-content: center; margin-bottom: calc(var(--u) * 9); }
</style>
