<template>
  <ManualStep
    :steps="scene.steps"
    :caption="scene.caption"
    :aria-label="scene.ariaLabel"
    :fallback="fallback"
    fallback-alt="评分审核列表页与批改详情页截图"
  >
    <template #default="{ step }">
      <DemoFrame chrome="window" title="Deadpan 判题 · 评分审核与批改" :design="800" class="frame">
        <div class="stage" :class="{ 'has-toast': step >= 4 }">
        <!-- ① 评分审核列表（对齐 Review.vue）：两行式主列 + AI状态 + 审核状态 + 已交/未交迷你进度条 + 操作 -->
        <div class="view list" :class="{ 'is-dim': step >= 1 }">
          <div class="v-head">
            <div class="v-title">{{ listMeta.pageTitle }}</div>
            <div class="v-desc">{{ listMeta.pageDesc }}</div>
          </div>
          <div class="dm-surface">
            <div class="dm-row bar">
              <span class="dm-input is-ph chip">{{ listMeta.classFilter }}</span>
              <span class="grow" />
              <span class="dm-sub">{{ listMeta.totalText }}</span>
            </div>
            <div class="dm-table-row head">
              <span class="c-title">{{ listMeta.columns[0] }}</span>
              <span class="c-ai">{{ listMeta.columns[1] }}</span>
              <span class="c-review">{{ listMeta.columns[2] }}</span>
              <span class="c-stats">{{ listMeta.columns[3] }}</span>
              <span class="c-act">{{ listMeta.columns[4] }}</span>
            </div>
            <div v-for="(row, i) in rows" :key="row.id" class="dm-table-row body">
              <span class="c-title lp-stack">
                <b>{{ row.title }}</b>
                <span>{{ row.className }} · 作答 {{ row.startText }} · 共 {{ row.totalStudents }} 人</span>
              </span>
              <span class="c-ai">
                <span v-if="!row.submittedCount" class="dm-sub">—</span>
                <i v-else class="dm-tag" :class="'is-' + aiStatusOf(row).tone">
                  <i v-if="aiStatusOf(row).dot" class="dot" />{{ aiStatusOf(row).text }}
                </i>
              </span>
              <span class="c-review">
                <i class="dm-tag" :class="'is-' + reviewStatusOf(row).tone">
                  <i class="dot" />{{ reviewStatusOf(row).text }}
                </i>
              </span>
              <span class="c-stats lp-progress">
                <span class="lp-track" :class="{ 'is-ok': row.submittedCount >= row.totalStudents }">
                  <i :style="{ width: progressPercent(row) + '%' }" />
                </span>
                <span class="lp-num">{{ row.submittedCount }}<u>/{{ row.totalStudents }}</u></span>
              </span>
              <span class="c-act lp-actions">
                <span class="dm-btn dm-target is-primary" :class="{ 'is-hot': step === 0 && i === 0 }">
                  审核<i v-if="step === 0 && i === 0" class="dm-cursor is-on" />
                </span>
                <span class="dm-btn">导出</span>
              </span>
            </div>
            <div class="foot"><span>{{ listMeta.foot }}</span><span class="dm-sub">‹ 1 ›</span></div>
          </div>
        </div>

        <!-- ②~⑤ 批改详情（对齐 ReviewDetail.vue）：左=题目导航，中=学生答案/代码，右=评分面板，底部=发布 -->
        <Transition name="dm-fade">
          <div v-if="step >= 1" class="view detail">
            <div class="detail-top">
              <span class="dm-btn is-link back">← 返回</span>
              <b class="q-title">{{ detail.questionTitle }}</b>
              <span class="student">{{ detail.studentName }} / {{ detail.studentNo }}</span>
              <span class="top-spacer" />
              <i class="dm-tag is-mute">总分 {{ detail.maxScore }} 分</i>
              <i class="dm-tag is-info">AI 评分 {{ detail.aiScore }} / {{ detail.maxScore }}</i>
              <Transition name="dm-fade" mode="out-in">
                <i v-if="step >= 4" key="pub" class="dm-tag is-success"><i class="dot" />已发布</i>
                <i v-else key="wait" class="dm-tag is-neutral"><i class="dot" />待审核</i>
              </Transition>
            </div>

            <div class="detail-body">
              <!-- 左：题目导航 -->
              <div class="col-nav">
                <div class="nav-title">题目导航</div>
                <div class="nav-head"><span class="nav-arrow">▾</span><span class="nav-label">第 1 小题</span><span class="nav-count">编程</span></div>
                <div class="nav-grid"><span class="n-box n-box-wrong">1</span></div>
                <div class="nav-head"><span class="nav-arrow">▾</span><span class="nav-label">第 2 小题</span><span class="nav-count">编程</span></div>
                <div class="nav-grid"><span class="n-box n-box-partial">1</span></div>
                <div class="nav-foot"><span class="dm-sub nav-foot-text">AI 总分 {{ detail.aiScore }}/{{ detail.maxScore }}</span></div>
              </div>

              <!-- 中：题目 + 学生答案 -->
              <div class="col-main">
                <div class="sq-section">
                  <div class="sq-head">
                    <span class="sq-num">第 1 小题</span>
                    <i class="dm-tag is-info">编程题</i>
                    <span class="grow" />
                    <span class="sq-score">40 分</span>
                    <i class="dm-tag is-neutral">待审核</i>
                  </div>
                  <div class="sq-stem">给定一个长度为 n 的整数数组 a 与整数 k，把数组每个元素向右循环移动 k 位。要求：原地修改，不得使用额外数组。</div>
                  <div class="ans-head">
                    <b class="ans-label">学生答案</b>
                    <span class="dm-sub">{{ detail.codeLang }}</span>
                    <span class="grow" />
                    <span class="dm-btn">格式化</span>
                  </div>
                  <div class="code-box">
                    <div v-for="(line, li) in detail.codeLines" :key="li" class="code-line">
                      <span v-for="(tk, ti) in line" :key="ti" :class="'tk-' + tk[0]">{{ tk[1] }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 右：评分面板（AI 评分 → 改分 → 评语 → 发布） -->
              <div class="col-panel">
                <div class="panel-head">
                  <span class="panel-title">评分面板</span>
                  <span class="grow" />
                  <span class="panel-collapse">收起</span>
                </div>
                <div class="panel-body">
                  <div class="panel-section">
                    <div class="panel-sec-head">第 1 小题 · 40 分</div>
                    <div class="panel-box">
                      <div class="score-row">
                        <span class="f-label">AI 评分</span>
                        <span class="ai-score">{{ detail.aiScore }} <u>/ {{ detail.maxScore }} 分</u></span>
                        <span class="grow" />
                        <span class="dm-btn">重新评分</span>
                        <span class="dm-btn">提示词</span>
                      </div>
                      <div class="final-row">
                        <span class="dm-btn is-link">使用 AI 评语</span>
                        <span class="grow" />
                        <span class="f-label">最终分</span>
                        <span class="num-box dm-target" :class="{ 'is-hot': step === 2 }">
                          <span class="num-val" :class="{ 'is-changed': step >= 2 }">
                            {{ step >= 2 ? detail.finalScore : detail.aiScore }}
                          </span>
                          <i v-if="step === 2" class="dm-cursor is-on" />
                        </span>
                      </div>
                      <div class="fb-row">
                        <span class="f-label">AI 评语</span>
                        <div class="fb-ai">{{ detail.aiFeedback }}</div>
                      </div>
                      <div class="fb-row">
                        <span class="f-label">教师评语</span>
                        <div class="fb-box dm-target" :class="{ 'is-hot': step === 3 }">
                          <span v-if="step < 3" class="dm-input is-ph ph">教师评语（选填）</span>
                          <span v-else class="fb-teacher">{{ detail.teacherFeedback }}</span>
                          <i v-if="step === 3" class="dm-cursor is-on" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="detail-bar">
              <span class="bar-info">共 2 题，AI 总分 {{ detail.aiScore }} / {{ detail.maxScore }}</span>
              <span class="dm-btn">保存审核</span>
              <span class="dm-btn dm-target" :class="{ 'is-primary': step >= 3, 'is-hot': step === 4 }">
                发布成绩<i v-if="step === 4" class="dm-cursor is-on" />
              </span>
            </div>

            <Transition name="dm-fade">
              <div v-if="step >= 4" class="toast-wrap"><span class="dm-toast">✓ 已发布，学生可见</span></div>
            </Transition>
          </div>
        </Transition>
        </div>
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
export const meta = { order: 11, title: '11. 评分审核 · 改分与发布', anchor: 'review' };
</script>

<script setup>
/**
 * 手册 · 第 11 节「评分审核」的可播放演示
 *
 * 结构：ManualStep（播放器/步骤驱动） → DemoFrame（外壳 + 设计单位缩放） → 复刻的假界面
 * 镜像对象：views/teacher/Review.vue（评分审核列表）与 views/teacher/ReviewDetail.vue（逐份批改）。
 * 界面只按 props.step 渲染状态，状态之间靠 CSS transition；不调接口、不依赖登录态。
 *
 * 步骤与状态：
 *   0 列表里高亮第一行的「审核」         → 1 详情页出现（左右分栏：左=学生答案，右=AI 分数与评语）
 *   2 最终分输入框 85 → 92（高亮）        → 3 教师评语被填上（高亮）
 *   4 点「发布成绩」→ 状态标签变「已发布」+ toast
 */
import ManualStep from '../ManualStep.vue';
import DemoFrame from '../DemoFrame.vue';
import { review as scene, reviewListMeta as listMeta, reviewRows as rows, reviewDetail as detail, aiStatusOf, reviewStatusOf, progressPercent } from '../scenes/review.js';

defineProps({
  /** 截图兜底（由 docs/manual/shots.mjs 生成）；不传则直接显示复刻界面 */
  fallback: { type: String, default: '' },
});
</script>

<style scoped>
.grow { flex: 1; min-width: 0; }
/* 列表↔详情在同一个框里交叉淡入淡出：.stage 固定高（按详情页留），列表叠在上面，
   于是外框尺寸全程不变 —— 播放时页面不抖，截图也不跳。
   注意：高度只写在 .stage 上。--u 由 DemoFrame 在 .df 上声明 container-type 定义，
   而容器查询单位对「容器自身」不生效（cqw 会退回视口宽）—— 在 .df 自己的样式里用
   calc(var(--u) * N) 会得到错误的值，必须挂在后代元素上。 */
.stage { position: relative; height: calc(var(--u) * 500); transition: height var(--duration-base) var(--ease-out); }
/* toast 出现时向下让出一段净空，避免它压住教师评语输入框（窄屏按比例缩得更小，尤其需要） */
.stage.has-toast { height: calc(var(--u) * 540); }
.view { transition: opacity var(--duration-base) var(--ease-out); }
.view.list { position: absolute; inset: 0 0 auto; min-height: calc(var(--u) * 340); }
.view.is-dim { opacity: 0; pointer-events: none; }
/* 详情页固定高 = 顶栏 36 + 主体 348 + 底部 bar 38 + 两处 15 间距（主体内不再被拉伸，
   各列按内容自适应，避免评分面板出现大段空白） */
.detail { position: relative; height: 100%; display: flex; flex-direction: column; }

/* ===== ① 评分审核列表 ===== */
.v-head { margin-bottom: calc(var(--u) * 10); }
.v-title { font-size: calc(var(--u) * 16); font-weight: 600; color: var(--text-strong); }
.v-desc { margin-top: calc(var(--u) * 3); font-size: calc(var(--u) * 11.5); color: var(--text-tertiary); }
.bar { padding: calc(var(--u) * 8) calc(var(--u) * 10); border-bottom: 1px solid var(--border-subtle); }
.chip { width: calc(var(--u) * 120); }
.dm-table-row.head { background: var(--bg-surface-2); color: var(--text-tertiary); }
.c-title { flex: 1 1 auto; width: calc(var(--u) * 250); min-width: 0; }
.c-ai { flex: none; width: calc(var(--u) * 134); }
.c-review { flex: none; width: calc(var(--u) * 116); }
.c-stats { flex: none; width: calc(var(--u) * 116); }
.c-act { flex: none; width: calc(var(--u) * 112); }
.lp-stack { display: flex; flex-direction: column; gap: calc(var(--u) * 2); overflow: hidden; }
.lp-stack > b { font-size: calc(var(--u) * 12.5); font-weight: 500; line-height: 1.3; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-stack > span { font-size: calc(var(--u) * 11); line-height: 1.4; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-progress { display: flex; align-items: center; gap: calc(var(--u) * 8); }
.lp-track { flex: none; width: calc(var(--u) * 66); height: calc(var(--u) * 6); border-radius: calc(var(--u) * 99); background: var(--score-track); overflow: hidden; }
.lp-track > i { display: block; height: 100%; border-radius: calc(var(--u) * 99); background: var(--brand-600); }
.lp-track.is-ok > i { background: var(--green-600); }
.lp-num { font-size: calc(var(--u) * 11.5); font-variant-numeric: tabular-nums; font-weight: 500; color: var(--text-primary); }
.lp-num > u { margin-left: calc(var(--u) * 2); font-size: calc(var(--u) * 10.5); font-weight: 400; text-decoration: none; color: var(--text-tertiary); }
.lp-actions { display: flex; align-items: center; gap: calc(var(--u) * 6); justify-content: flex-end; }
.c-act .dm-btn { height: calc(var(--u) * 24); padding: 0 calc(var(--u) * 9); font-size: calc(var(--u) * 11.5); }
.foot { display: flex; align-items: center; justify-content: space-between; padding: calc(var(--u) * 7) calc(var(--u) * 10); border-top: 1px solid var(--border-subtle); font-size: calc(var(--u) * 11.5); color: var(--text-tertiary); }
.dm-tag .dot { width: calc(var(--u) * 5); height: calc(var(--u) * 5); border-radius: 50%; background: currentColor; flex: none; }
/* 状态色板：dm-* 原子类只有 info/accent/mute，这里按 StatusTag 的语义色补齐（都用令牌） */
.dm-tag.is-success { background: var(--status-success-bg); border-color: var(--status-success-bd); color: var(--status-success-fg); }
.dm-tag.is-warning { background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg); }
.dm-tag.is-danger { background: var(--status-danger-bg); border-color: var(--status-danger-bd); color: var(--status-danger-fg); }
.dm-tag.is-neutral { background: var(--status-neutral-bg); border-color: var(--border-subtle); color: var(--status-neutral-fg); }

/* ===== ②~⑤ 批改详情 ===== */
.detail-top { display: flex; align-items: center; gap: calc(var(--u) * 8); padding-bottom: calc(var(--u) * 9); border-bottom: 1px solid var(--border-subtle); }
.back { flex: none; }
.q-title { font-size: calc(var(--u) * 13.5); font-weight: 600; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.student { flex: none; max-width: calc(var(--u) * 96); font-size: calc(var(--u) * 11.5); color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.top-spacer { flex: 1; min-width: 0; }
.detail-body { display: flex; align-items: flex-start; gap: calc(var(--u) * 12); flex: 1; min-height: 0; padding: calc(var(--u) * 10) 0; }

/* 左：题目导航 */
.col-nav { flex: none; width: calc(var(--u) * 62); display: flex; flex-direction: column; }
.nav-title { padding-bottom: calc(var(--u) * 6); font-size: calc(var(--u) * 11); font-weight: 600; color: var(--text-tertiary); }
.nav-head { display: flex; align-items: center; gap: calc(var(--u) * 3); margin: calc(var(--u) * 4) 0; font-size: calc(var(--u) * 10.5); font-weight: 600; color: var(--text-secondary); }
.nav-arrow { color: var(--text-tertiary); }
.nav-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; }
.nav-count { flex: none; padding: 0 calc(var(--u) * 4); border-radius: calc(var(--u) * 6); background: var(--border-subtle); font-size: calc(var(--u) * 9.5); font-weight: 400; color: var(--text-secondary); }
.nav-grid { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 4); }
.n-box { display: inline-flex; align-items: center; justify-content: center; width: calc(var(--u) * 24); height: calc(var(--u) * 24); border: calc(var(--u) * 1.5) solid transparent; border-radius: calc(var(--u) * 5); font-size: calc(var(--u) * 10.5); font-weight: 600; }
.n-box-wrong { background: var(--status-danger-bg); border-color: var(--status-danger-bd); color: var(--status-danger-fg); }
.n-box-partial { background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg); }
.nav-foot { margin-top: auto; padding-top: calc(var(--u) * 6); border-top: 1px solid var(--border-subtle); }
.nav-foot-text { white-space: nowrap; font-size: calc(var(--u) * 9.5); }

/* 中：题目 + 学生答案 */
.col-main { flex: 1; min-width: 0; }
.sq-section { padding: calc(var(--u) * 9) calc(var(--u) * 10); border: 1px solid var(--border-subtle); border-radius: calc(var(--u) * 9); background: var(--card-bg); }
.sq-head { display: flex; align-items: center; gap: calc(var(--u) * 6); padding-bottom: calc(var(--u) * 8); border-bottom: 1px solid var(--border-subtle); }
.sq-num { font-size: calc(var(--u) * 12.5); font-weight: 600; color: var(--text-strong); }
.sq-score { font-size: calc(var(--u) * 11.5); font-weight: 600; color: var(--text-brand); }
.sq-stem { margin: calc(var(--u) * 8) 0; font-size: calc(var(--u) * 11.5); line-height: 1.65; color: var(--text-secondary); }
.ans-head { display: flex; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 5) calc(var(--u) * 8); background: var(--bg-surface-2); border: 1px solid var(--border-default); border-bottom: 0; border-radius: calc(var(--u) * 6) calc(var(--u) * 6) 0 0; }
.ans-label { font-size: calc(var(--u) * 11.5); font-weight: 600; color: var(--text-tertiary); }
.ans-head .dm-btn { height: calc(var(--u) * 22); padding: 0 calc(var(--u) * 8); font-size: calc(var(--u) * 11); }
.code-box { padding: calc(var(--u) * 8) calc(var(--u) * 10); border: 1px solid var(--border-default); border-radius: 0 0 calc(var(--u) * 6) calc(var(--u) * 6); background: var(--bg-sunken); }
.code-line { font-family: var(--font-mono); font-size: calc(var(--u) * 10.5); line-height: 1.55; white-space: pre; color: var(--text-primary); }
.tk-kw { color: var(--status-info-fg); font-weight: 600; }
.tk-fn { color: var(--text-brand); }
.tk-cm { color: var(--text-tertiary); }

/* 右：评分面板 */
.col-panel { flex: none; width: calc(var(--u) * 292); display: flex; flex-direction: column; border: 1px solid var(--border-default); border-radius: calc(var(--u) * 9); background: var(--bg-surface-2); overflow: hidden; }
.panel-head { display: flex; align-items: center; padding: calc(var(--u) * 8) calc(var(--u) * 10); border-bottom: 1px solid var(--border-subtle); background: var(--card-bg); }
.panel-title { font-size: calc(var(--u) * 11.5); font-weight: 600; color: var(--text-secondary); }
.panel-collapse { padding: 0 calc(var(--u) * 7); height: calc(var(--u) * 22); display: inline-flex; align-items: center; border: 1px solid var(--border-default); border-radius: calc(var(--u) * 6); font-size: calc(var(--u) * 11); color: var(--text-secondary); }
.panel-body { flex: 1; min-height: 0; padding: calc(var(--u) * 9); }
.panel-sec-head { margin-bottom: calc(var(--u) * 6); font-size: calc(var(--u) * 11); font-weight: 600; color: var(--text-tertiary); }
.panel-box { padding: calc(var(--u) * 9); border: 1px solid var(--border-subtle); border-radius: calc(var(--u) * 8); background: var(--card-bg); }
.score-row { display: flex; align-items: center; gap: calc(var(--u) * 6); padding-bottom: calc(var(--u) * 8); border-bottom: 1px solid var(--border-subtle); }
.f-label { flex: none; font-size: calc(var(--u) * 10.5); font-weight: 600; color: var(--text-tertiary); }
.ai-score { font-size: calc(var(--u) * 13); font-weight: 700; color: var(--text-brand); white-space: nowrap; }
.ai-score > u { text-decoration: none; font-size: calc(var(--u) * 10); font-weight: 400; color: var(--text-tertiary); }
.score-row .dm-btn { height: calc(var(--u) * 22); padding: 0 calc(var(--u) * 7); font-size: calc(var(--u) * 10.5); }
.final-row { display: flex; align-items: center; gap: calc(var(--u) * 6); margin-top: calc(var(--u) * 8); }
.final-row .dm-btn.is-link { font-size: calc(var(--u) * 11); }
.num-box { position: relative; display: inline-flex; align-items: center; justify-content: center; width: calc(var(--u) * 62); height: calc(var(--u) * 24); border: 1px solid var(--border-default); border-radius: calc(var(--u) * 6); background: var(--card-bg); }
.num-val { font-size: calc(var(--u) * 12.5); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text-primary); transition: color var(--duration-base) var(--ease-out); }
.num-val.is-changed { color: var(--text-brand); }
.fb-row { margin-top: calc(var(--u) * 8); }
.fb-ai { margin-top: calc(var(--u) * 4); padding: calc(var(--u) * 7) calc(var(--u) * 8); border: 1px solid var(--border-subtle); border-radius: calc(var(--u) * 6); background: var(--bg-surface); font-size: calc(var(--u) * 10.5); line-height: 1.6; color: var(--text-secondary); }
.fb-box { position: relative; display: flex; align-items: center; margin-top: calc(var(--u) * 4); min-height: calc(var(--u) * 40); padding: calc(var(--u) * 7) calc(var(--u) * 8); border: 1px solid var(--border-subtle); border-radius: calc(var(--u) * 6); background: var(--bg-surface); }
.fb-box .ph { height: auto; padding: 0; border: 0; background: transparent; font-size: calc(var(--u) * 10.5); }
.fb-teacher { font-size: calc(var(--u) * 10.5); line-height: 1.6; color: var(--text-primary); }
/* 「输入框」高亮：比 dm-target 的整块描边更贴合真实输入框的聚焦环 */
.dm-target.is-hot.num-box, .dm-target.is-hot.fb-box { box-shadow: inset 0 0 0 calc(var(--u) * 1.5) var(--brand-600), 0 0 0 calc(var(--u) * 3) var(--ring-focus); border-color: var(--brand-600); }

/* 底部审核 bar */
.detail-bar { display: flex; align-items: center; gap: calc(var(--u) * 8); padding-top: calc(var(--u) * 9); border-top: 1px solid var(--border-subtle); }
.bar-info { flex: 1; font-size: calc(var(--u) * 11); color: var(--text-tertiary); }
.detail-bar .dm-btn { height: calc(var(--u) * 28); padding: 0 calc(var(--u) * 12); font-size: calc(var(--u) * 12); }

/* toast 浮在右下角 */
.toast-wrap { position: absolute; right: 0; bottom: calc(var(--u) * 46); }
</style>
