<template>
  <ManualStep
    :steps="scene.steps"
    :caption="scene.caption"
    :aria-label="scene.ariaLabel"
    :fallback="fallback"
    fallback-alt="新建实训题页与教师评审页（AI 评分审核）截图"
  >
    <template #default="{ step }">
      <!-- design=1084 = 真实页面内容区宽度（1440 视口 − 侧栏 260 − 内容内距 96），
           于是下面所有尺寸的 N 都直接写真实源码里的 px 值，便于与视图逐条对照。 -->
      <DemoFrame chrome="window" title="Deadpan 判题 · 实训题" :design="1084">
        <Transition name="dm-fade" mode="out-in">
          <!-- ==================== ① 新建实训题页（步骤 0-2，ProjectQuestionEdit.vue） ==================== -->
          <div v-if="step <= 2" key="new" class="new-page">
            <!-- A. compact 页头：只有左上角一行「← 返回题库管理」
                 （compact 下标题 visually-hidden，页面上看不见大标题；#actions 教师态为空） -->
            <div class="head-back">
              <span class="dm-btn is-link back-btn">← 返回题库管理</span>
            </div>

            <!-- B. 新建页唯一的信息条（不是左栏卡片）：题目名 / BETA / 难度 / 满分 + 同一行右对齐的操作
                 「查看 AI 提示词」只在编辑态出现（v-if="isEdit"），新建态没有；
                 「自动评分器」被 FEATURE_CHECKER_ENTRY 关闭，也不画。 -->
            <div class="dm-row meta-row">
              <span class="dm-input is-ph title-input">{{ scene.question.titlePlaceholder }}</span>
              <span class="dm-tag is-warning">BETA</span>
              <span class="dm-btn select">{{ scene.question.difficulty }}<i class="caret">▾</i></span>
              <span class="meta-label">满分</span>
              <span class="dm-input score-input">{{ scene.question.maxScore }}</span>
              <span class="grow" />
              <span class="dm-btn">题目描述</span>
              <span class="dm-btn">评分标准</span>
              <span class="dm-btn is-primary">保存</span>
            </div>

            <!-- C. 主体：一整块 ide-stage（不是左右分栏）。新建时默认「阶段一」= 垂直水平居中的圆形「+」 -->
            <Transition name="stage-swap" mode="out-in">
              <div v-if="step < 2" key="picker" class="ide-stage">
                <div class="picker-slot">
                  <span class="kind-add-btn dm-target" :class="{ 'is-hot': step === 0, 'is-busy': step === 1 }">
                    <span v-if="step === 0" class="plus">+</span>
                    <span v-else class="spin" />
                    <i v-if="step === 0" class="dm-cursor is-on" />
                  </span>
                  <p class="kind-hint">{{ step === 0 ? scene.zip.hint : '正在解析中...' }}</p>
                  <!-- 真实页解析完成会直接切到阶段二，没有中间态；演示把「解析中 → 解析完成」
                       压在本步内用一段 keyframes 演完，玩家暂停时也随之冻结。 -->
                  <div v-if="step === 1" class="zip-status">
                    <span class="zs zs-doing">{{ scene.zip.name }}</span>
                    <span class="zs zs-done">✓ 已解析 {{ scene.zip.files }} 个代码文件</span>
                  </div>
                </div>
                <p class="open-hint">{{ scene.openHint }}</p>
              </div>

              <!-- 阶段二：VSCode 风格 IDE（左文件树 sidebar + 右 tab 标签条与代码区） -->
              <div v-else key="editor" class="ide-stage">
                <div class="ide-body">
                  <div class="sidebar dm-target" :class="{ 'is-hot': step === 2 }">
                    <div class="sidebar-title">资源管理器</div>
                    <div class="zu-tree">
                      <div
                        v-for="f in scene.tree"
                        :key="f.name"
                        class="tree-row"
                        :class="{ 'is-dir': f.dir, 'is-active': f.active }"
                        :style="{ paddingLeft: 'calc(var(--u) * ' + (4 + f.depth * 12) + ')' }"
                      >
                        <span class="tree-ico">{{ f.dir ? '▸' : '·' }}</span>
                        <span class="tree-name">{{ f.name }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="editor-area">
                    <div class="tab-bar">
                      <div class="tab active"><span class="tab-name">App.vue</span><span class="tab-close">×</span></div>
                      <div class="tab"><span class="tab-name">UserTable.vue</span><span class="tab-close">×</span></div>
                      <div class="tab-bar-fill" />
                    </div>
                    <div class="code">
                      <div v-for="(line, i) in scene.code" :key="i" class="code-line">
                        <span class="ln">{{ i + 1 }}</span>
                        <span class="lt"><template v-for="(tk, j) in tokenize(line)" :key="j"><span :class="tk.cls">{{ tk.text }}</span></template></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- ==================== ② 教师评审页（步骤 3-5，ProjectReviewNew.vue） ==================== -->
          <div v-else key="review" class="rv-page">
            <!-- 顶栏：返回 + 题目名 + 标签 + 学生/学号 + 状态徽标（待评分 / AI 已评分 / 已审核 / 已发布） -->
            <div class="rv-top">
              <span class="dm-btn is-link back-btn">← 返回</span>
              <b class="rv-title">{{ scene.question.title }}</b>
              <span class="rv-tag is-brand">实训题</span>
              <span class="rv-tag is-warning">BETA</span>
              <span class="rv-student">{{ scene.student.name }} / {{ scene.student.no }}</span>
              <span class="rv-tag" :class="statusClass(step)"><i class="dot" />{{ statusText(step) }}</span>
            </div>

            <div class="rv-main">
              <!-- 左：资源管理器（学生提交 / 标准答案包 双数据源 + 文件树） -->
              <div class="sidebar">
                <div class="sidebar-title">资源管理器</div>
                <div class="tree-tabs">
                  <span class="ttab is-on">学生提交</span>
                  <span class="ttab">标准答案包</span>
                </div>
                <div class="zu-tree">
                  <div
                    v-for="f in scene.tree"
                    :key="f.name"
                    class="tree-row"
                    :class="{ 'is-dir': f.dir, 'is-active': f.active }"
                    :style="{ paddingLeft: 'calc(var(--u) * ' + (4 + f.depth * 12) + ')' }"
                  >
                    <span class="tree-ico">{{ f.dir ? '▸' : '·' }}</span>
                    <span class="tree-name">{{ f.name }}</span>
                  </div>
                </div>
              </div>

              <!-- 中：多标签代码区 -->
              <div class="editor-area">
                <div class="tab-bar">
                  <div class="tab active"><span class="tab-name">App.vue</span><span class="tab-close">×</span></div>
                  <div class="tab"><span class="tab-name">UserTable.vue</span><span class="tab-close">×</span></div>
                  <div class="tab-bar-fill" />
                </div>
                <div class="code">
                  <div v-for="(line, i) in scene.code" :key="i" class="code-line">
                    <span class="ln">{{ i + 1 }}</span>
                    <span class="lt"><template v-for="(tk, j) in tokenize(line)" :key="j"><span :class="tk.cls">{{ tk.text }}</span></template></span>
                  </div>
                </div>
              </div>

              <!-- 右：评分面板（AI 区只读 + 教师区），≥1200px 常驻右栏 384px -->
              <aside class="rv-panel">
                <div class="panel-header">
                  <span class="panel-arrow">▸</span>
                  <span class="panel-title">评分面板</span>
                  <span class="rv-tag is-success">AI {{ scene.ai.score }} 分</span>
                  <span
                    v-if="step >= 4"
                    class="rv-tag"
                    :class="step >= 5 ? 'is-success' : 'is-brand'"
                  >{{ step >= 5 ? '已发布' : '已审核' }}</span>
                  <span class="panel-toggle">收起</span>
                </div>

                <div class="panel-body">
                  <!-- AI 区 -->
                  <div class="ai-section dm-target" :class="{ 'is-hot': step === 3 }">
                    <div class="ai-head">
                      <span class="ai-score-label">AI 评分</span>
                      <span class="ai-score-num">{{ scene.ai.score }}<span class="ai-max"> / {{ scene.question.maxScore }}</span></span>
                      <span class="grow" />
                      <span class="dm-btn mini">重新评分</span>
                      <span class="dm-btn mini">查看提示词</span>
                    </div>

                    <div class="bd-collapse"><i class="caret">▸</i>评分标准（{{ scene.ai.breakdown.length }} 项）</div>

                    <div class="hl-list">
                      <div v-for="h in scene.ai.highlights" :key="h" class="hl-item good">✓ {{ h }}</div>
                      <div v-for="p in scene.ai.issues" :key="p" class="hl-item issue">△ {{ p }}</div>
                    </div>

                    <div class="ai-comment">
                      <div class="ai-comment-text">{{ scene.ai.overallComment }}</div>
                      <span class="dm-btn is-link mini">引用到教师评语</span>
                    </div>
                  </div>

                  <!-- 教师区 -->
                  <div class="teacher-section">
                    <div class="t-row">
                      <span class="t-label">最终分数</span>
                      <span class="dm-input t-score" :class="{ 'is-locked': step >= 5 }">{{ scene.ai.finalScore }}</span>
                      <span class="t-max">满分 {{ scene.question.maxScore }}</span>
                    </div>
                    <div class="t-row t-feedback">
                      <span class="t-label">教师评语</span>
                      <span class="dm-input t-fb is-ph" :class="{ 'is-locked': step >= 5 }">{{ scene.ai.feedbackPlaceholder }}</span>
                    </div>
                    <div class="t-actions">
                      <span class="t-hint">{{ hintText(step) }}</span>
                      <span class="dm-btn is-primary approve" :class="{ 'is-locked': step >= 5 }">{{ approveText(step) }}</span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>

            <!-- 审核通过的 antd message 提示（真实文案：message.success('审核通过，学生已可见成绩')） -->
            <div class="toast-wrap">
              <Transition name="dm-fade">
                <span v-if="step === 4" class="dm-toast msg"><i class="ok">✓</i>审核通过，学生已可见成绩</span>
              </Transition>
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
export const meta = { order: 7, title: '7. 实训题 · 新建与 AI 评审', anchor: 'project' };
</script>

<script setup>
/**
 * 手册 · 第 7 节「实训题管理」的可播放演示（按真实代码复刻）
 *
 * 结构：ManualStep（播放器/步骤驱动） → DemoFrame（外壳 + 设计单位缩放） → 复刻的假界面
 * 界面只按 props.step 渲染状态，状态之间靠 CSS transition；不调接口、不依赖登录态、不 import 业务组件。
 * 页面结构照抄两个真实视图：
 *   · ProjectQuestionEdit.vue（新建实训题页）—— compact 页头（只有「← 返回题库管理」）+ 一行 meta-row
 *     （题目名 / BETA / 难度 / 满分 + 题目描述 / 评分标准 / 保存）+ 一整块 ide-stage
 *     （阶段一 = 居中圆形「+」+「点击上传标准工程包」+ 开放性题目说明；阶段二 = 左文件树 + 右标签页与代码）
 *   · ProjectReviewNew.vue（教师评审页）—— 顶栏（返回 / 题目名 / 实训题 / BETA / 学生 / 状态徽标）
 *     + 三栏（资源管理器 | 代码区 | 评分面板）+ 右侧面板（AI 评分 → 评分标准折叠 → 优点与问题 → AI 评语
 *     → 最终分数 → 教师评语 → 提示 + 「审核通过」/「更新审核」）
 * 代码区是纯文本缩略（行号 + 等宽字 + 关键字着色），**不是**真实 Monaco。
 */
import ManualStep from '../ManualStep.vue';
import DemoFrame from '../DemoFrame.vue';
import { project as scene } from '../scenes/project.js';

defineProps({
  /** 截图兜底（由 docs/manual/shots.mjs 生成）；不传则直接显示复刻界面 */
  fallback: { type: String, default: '' },
});

/* ===== 评审页状态文案（逐字取自 ProjectReviewNew.vue） =====
   状态徽标：submitted 待评分 / ai_graded AI 已评分 / reviewed 已审核 / published 已发布
   底部提示：published「成绩已发布，不可修改」/ reviewed「已审核，可修改后重新提交」
             / 其余「审核通过后学生即可看到分数与评语」
   主按钮：reviewed 之后「更新审核」，否则「审核通过」（published 时按钮禁用 = locked） */
function statusText(step) {
  if (step >= 5) return '已发布';
  if (step >= 4) return '已审核';
  return 'AI 已评分';
}
function statusClass(step) {
  if (step >= 4 && step < 5) return 'is-brand';
  return 'is-success';
}
function hintText(step) {
  if (step >= 5) return '成绩已发布，不可修改';
  if (step >= 4) return '已审核，可修改后重新提交';
  return '审核通过后学生即可看到分数与评语';
}
function approveText(step) {
  return step >= 4 ? '更新审核' : '审核通过';
}

/* ===== 极简「Monaco 观感」着色（演示用，不是真的语法解析） ===== */
const KEYWORDS = new Set([
  'import', 'from', 'export', 'default', 'const', 'let', 'function', 'return',
  'async', 'await', 'new', 'if', 'else', 'ref', 'onMounted', 'reactive', 'computed', 'setup', 'script', 'template',
]);
const TOKEN_RE = /\/\/[^\n]*|'[^']*'|"[^"]*"|<\/?[A-Za-z][\w-]*|\b[A-Za-z_$][\w$]*\b|\s+|[^\s]/g;
function tokenize(line) {
  const out = [];
  for (const m of line.matchAll(TOKEN_RE)) {
    const text = m[0];
    let cls = 'tk';
    if (text.startsWith('//')) cls = 'tk-cm';
    else if (text.startsWith("'") || text.startsWith('"')) cls = 'tk-str';
    else if (text.startsWith('<')) cls = 'tk-tag';
    else if (KEYWORDS.has(text)) cls = 'tk-kw';
    out.push({ text, cls });
  }
  return out;
}
</script>

<style scoped>
/* ===== 公共 ===== */
.grow { flex: 1; min-width: 0; }
/* 演示框 = 真实页面的「内容区」，页面自带内距（真实 .content 为 28px 48px 40px），
   先用负边距抵掉 DemoFrame 的 body 内距，再按真实值给内距。 */
.new-page { --stage: 515; margin: calc(var(--u) * -14); padding: calc(var(--u) * 14) calc(var(--u) * 48) calc(var(--u) * 24); }
.rv-page { --stage: 515; position: relative; margin: calc(var(--u) * -14); }
.back-btn { font-size: calc(var(--u) * 14); }

/* ===== ① 新建实训题页 ===== */
.head-back { display: flex; align-items: center; min-height: calc(var(--u) * 32); margin-bottom: calc(var(--u) * 12); }
.meta-row { gap: calc(var(--u) * 12); margin-bottom: calc(var(--u) * 12); flex-wrap: wrap; row-gap: calc(var(--u) * 8); }
/* 题目名输入框：真实 width:260px + font-size:var(--fs-title-2) + font-weight:700（占位符「新建实训题」） */
.dm-input.title-input { width: calc(var(--u) * 260); height: calc(var(--u) * 32); font-size: calc(var(--u) * 18); font-weight: 700; }
/* 难度下拉（width:100px）、满分数字框（width:80px）、「满分」文字、按钮，均为 antd 默认控件尺寸 32 高 */
.dm-btn.select { height: calc(var(--u) * 32); width: calc(var(--u) * 100); padding: 0 calc(var(--u) * 11); justify-content: space-between; font-size: calc(var(--u) * 14); }
.meta-label { font-size: calc(var(--u) * 14); color: var(--text-tertiary); white-space: nowrap; }
.dm-input.score-input { width: calc(var(--u) * 80); height: calc(var(--u) * 32); padding: 0 calc(var(--u) * 11); font-size: calc(var(--u) * 14); }
.meta-row .dm-btn { height: calc(var(--u) * 32); padding: 0 calc(var(--u) * 15); font-size: calc(var(--u) * 14); border-radius: calc(var(--u) * 6); }
.caret { font-size: calc(var(--u) * 12); color: var(--text-tertiary); }
/* BETA 标签：真实是 antd a-tag class="tag-warning"（走语义告警色三元组） */
.dm-tag.is-warning { height: calc(var(--u) * 22); padding: 0 calc(var(--u) * 8); border-radius: calc(var(--u) * 6); background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg); font-size: calc(var(--u) * 12); }

.ide-stage { height: calc(var(--u) * var(--stage)); display: flex; flex-direction: column; overflow: hidden; }
.picker-slot { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(var(--u) * 12); }
/* 圆形「+」入口（ProjectZipUploader.kind-add-btn：56×56 虚线圆、禁用时呼吸） */
.kind-add-btn { width: calc(var(--u) * 56); height: calc(var(--u) * 56); border-radius: 50%; border: calc(var(--u) * 2) dashed var(--border-strong); background: var(--bg-surface-2); color: var(--text-tertiary); display: flex; align-items: center; justify-content: center; transition: all var(--duration-base) var(--ease-out); }
.kind-add-btn .plus { font-size: calc(var(--u) * 24); line-height: 1; }
.kind-add-btn.is-busy { cursor: not-allowed; opacity: 0.8; animation: upload-pulse 1600ms var(--ease-in-out, ease-in-out) infinite; }
@keyframes upload-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
.spin { width: calc(var(--u) * 18); height: calc(var(--u) * 18); border: calc(var(--u) * 2) solid var(--border-default); border-top-color: var(--brand-600); border-radius: 50%; animation: zu-spin 800ms linear infinite; }
@keyframes zu-spin { to { transform: rotate(360deg); } }
.kind-hint { margin: 0; font-size: calc(var(--u) * 13); color: var(--text-tertiary); transition: color var(--duration-base) var(--ease-out); }
/* 解析状态：真实页解析完直接切阶段二，演示在本步内演完「解析中 → 解析完成」 */
.zip-status { position: relative; display: grid; place-items: center; height: calc(var(--u) * 24); font-size: calc(var(--u) * 13); }
.zs { grid-area: 1 / 1; display: inline-flex; align-items: center; gap: calc(var(--u) * 6); white-space: nowrap; }
.zs-doing { color: var(--text-tertiary); animation: zs-out 2500ms var(--ease-out) forwards; }
.zs-done { opacity: 0; color: var(--status-success-fg); animation: zs-in 2500ms var(--ease-out) forwards; }
@keyframes zs-out { 0%, 45% { opacity: 1; } 55%, 100% { opacity: 0; } }
@keyframes zs-in { 0%, 45% { opacity: 0; } 55%, 100% { opacity: 1; } }
/* 开放性题目说明：真实 .open-project-hint（居中灰字、max-width:760px、行高 1.8） */
.open-hint { flex: none; margin: 0 auto calc(var(--u) * 20); padding: 0 calc(var(--u) * 24); max-width: calc(var(--u) * 760); font-size: calc(var(--u) * 13); line-height: 1.8; color: var(--text-tertiary); text-align: center;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* 阶段二：.ide-body（真实 border:1px solid var(--border-strong) + radius-xs） */
.ide-body { flex: 1; min-height: 0; display: flex; overflow: hidden; border: 1px solid var(--border-strong); border-radius: calc(var(--u) * 4); }
.sidebar { flex: 0 0 calc(var(--u) * 260); min-width: 0; background: var(--bg-sunken); border-right: 1px solid var(--border-strong); display: flex; flex-direction: column; overflow: hidden; }
.sidebar-title { padding: calc(var(--u) * 10) calc(var(--u) * 12); font-size: calc(var(--u) * 11); font-weight: 600; text-transform: uppercase; color: var(--text-secondary); letter-spacing: calc(var(--u) * 0.5); flex: none; }
.zu-tree { flex: 1; overflow: hidden; padding: calc(var(--u) * 4) 0; }
.tree-row { display: flex; align-items: center; gap: calc(var(--u) * 6); padding-right: calc(var(--u) * 6); font-size: calc(var(--u) * 13); line-height: calc(var(--u) * 22); color: var(--text-primary); }
.tree-row.is-active { background: var(--bg-active); }
.tree-ico { flex: none; width: calc(var(--u) * 14); text-align: center; color: var(--text-tertiary); }
.tree-row.is-dir .tree-ico { color: var(--status-warning-fg); }
.tree-row.is-dir .tree-name { font-weight: 500; }
.tree-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor-area { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.tab-bar { display: flex; align-items: flex-end; flex: none; height: calc(var(--u) * 35); min-height: calc(var(--u) * 35); background: var(--bg-sunken); overflow: hidden; }
.tab { display: flex; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 7) calc(var(--u) * 12); font-size: calc(var(--u) * 12); color: var(--text-secondary); background: var(--bg-sunken); border-right: 1px solid var(--border-strong); white-space: nowrap; min-width: calc(var(--u) * 80); }
.tab.active { background: var(--card-bg); color: var(--text-primary); }
.tab-name { overflow: hidden; text-overflow: ellipsis; }
.tab-close { color: var(--text-tertiary); line-height: 1; }
.tab-bar-fill { flex: 1; height: calc(var(--u) * 35); border-bottom: calc(var(--u) * 2) solid var(--bg-sunken); }
.code { flex: 1; min-height: 0; padding: calc(var(--u) * 6) 0; background: var(--card-bg); overflow: hidden; }
.code-line { display: flex; gap: calc(var(--u) * 10); padding: 0 calc(var(--u) * 10); font-family: MonacoDSH, ui-monospace, Menlo, monospace; font-size: calc(var(--u) * 12.5); line-height: calc(var(--u) * 19); color: var(--text-primary); }
.ln { flex: none; width: calc(var(--u) * 18); text-align: right; color: var(--text-tertiary); }
.lt { white-space: pre; overflow: hidden; text-overflow: ellipsis; }
.tk-kw { color: var(--text-brand); }
.tk-str { color: var(--status-warning-fg); }
.tk-tag { color: var(--status-success-fg); }
.tk-cm { color: var(--text-tertiary); }

/* ===== ② 教师评审页 ===== */
.rv-top { display: flex; align-items: center; gap: calc(var(--u) * 12); padding: calc(var(--u) * 10) calc(var(--u) * 20); border-bottom: 1px solid var(--border-subtle); flex-wrap: wrap; row-gap: calc(var(--u) * 6); }
.rv-title { font-size: calc(var(--u) * 18); font-weight: 700; color: var(--text-strong); }
.rv-student { flex: 1; min-width: 0; font-size: calc(var(--u) * 13); color: var(--text-tertiary); }
/* 状态徽标 = StatusTag（tone + dot）：实心语义色块、22 高、6px 圆点 */
.rv-tag { display: inline-flex; align-items: center; gap: calc(var(--u) * 5); height: calc(var(--u) * 22); padding: 0 calc(var(--u) * 8); border-radius: calc(var(--u) * 6); font-size: calc(var(--u) * 12); font-weight: 500; line-height: 1; white-space: nowrap; }
.rv-tag .dot { width: calc(var(--u) * 6); height: calc(var(--u) * 6); border-radius: 50%; background: currentColor; }
.rv-tag.is-brand { background: var(--status-info-bg); color: var(--status-info-fg); }
.rv-tag.is-success { background: var(--status-success-bg); color: var(--status-success-fg); }
.rv-tag.is-warning { background: var(--status-warning-bg); color: var(--status-warning-fg); }

.rv-main { display: flex; align-items: stretch; height: calc(var(--u) * var(--stage)); border-top: 1px solid var(--border-strong); overflow: hidden; }
.tree-tabs { display: flex; gap: calc(var(--u) * 16); padding: 0 calc(var(--u) * 12); border-bottom: 1px solid var(--border-subtle); flex: none; }
.ttab { padding: calc(var(--u) * 8) 0; font-size: calc(var(--u) * 13); color: var(--text-secondary); border-bottom: calc(var(--u) * 2) solid transparent; white-space: nowrap; }
.ttab.is-on { color: var(--text-brand); border-bottom-color: var(--brand-600); font-weight: 500; }

.rv-panel { flex: 0 0 calc(var(--u) * 384); min-width: 0; display: flex; flex-direction: column; background: var(--card-bg); border-left: 1px solid var(--border-default); overflow: hidden; }
.panel-header { display: flex; align-items: center; gap: calc(var(--u) * 8); padding: calc(var(--u) * 7) calc(var(--u) * 16); border-bottom: 1px solid var(--border-subtle); font-size: calc(var(--u) * 13); color: var(--text-secondary); flex: none; }
.panel-arrow { font-size: calc(var(--u) * 10); color: var(--text-tertiary); transform: rotate(90deg); }
.panel-title { font-weight: 600; color: var(--text-primary); }
.panel-toggle { margin-left: auto; font-size: calc(var(--u) * 12); color: var(--text-tertiary); }
.panel-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.ai-section { flex: 0 0 auto; padding: calc(var(--u) * 12) calc(var(--u) * 16); border-bottom: 1px solid var(--border-subtle); }
.ai-head { display: flex; align-items: center; gap: calc(var(--u) * 10); margin-bottom: calc(var(--u) * 8); }
.ai-score-label { font-size: calc(var(--u) * 12); color: var(--text-tertiary); }
.ai-score-num { font-size: calc(var(--u) * 22); font-weight: 700; color: var(--text-brand); line-height: 1; }
.ai-max { font-size: calc(var(--u) * 13); font-weight: 400; color: var(--text-tertiary); }
.bd-collapse { display: flex; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 4) 0 calc(var(--u) * 6); font-size: calc(var(--u) * 13); color: var(--text-secondary); }
.hl-list { display: flex; flex-direction: column; gap: calc(var(--u) * 2); margin: calc(var(--u) * 4) 0; }
.hl-item { font-size: calc(var(--u) * 12.5); line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hl-item.good { color: var(--status-success-fg); }
.hl-item.issue { color: var(--status-warning-fg); }
.ai-comment { display: flex; flex-direction: column; align-items: flex-start; gap: calc(var(--u) * 4); margin-top: calc(var(--u) * 8); padding: calc(var(--u) * 8) calc(var(--u) * 10); background: var(--bg-surface-2); border-radius: calc(var(--u) * 6); border-left: calc(var(--u) * 3) solid var(--brand-600); }
.ai-comment-text { font-size: calc(var(--u) * 12.5); line-height: 1.7; color: var(--text-primary); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.teacher-section { flex: 1 0 auto; display: flex; flex-direction: column; gap: calc(var(--u) * 10); padding: calc(var(--u) * 12) calc(var(--u) * 16); }
.t-row { display: flex; align-items: center; gap: calc(var(--u) * 8); min-width: 0; }
.t-label { flex: none; width: calc(var(--u) * 56); font-size: calc(var(--u) * 13); color: var(--text-secondary); }
.dm-input.t-score { width: calc(var(--u) * 110); height: calc(var(--u) * 32); padding: 0 calc(var(--u) * 11); font-size: calc(var(--u) * 14); }
.t-max { font-size: calc(var(--u) * 12); color: var(--text-tertiary); }
.t-feedback { align-items: flex-start; }
/* 教师评语：真实是 a-textarea :rows="3"（placeholder 逐字照抄），锁定后禁用 */
.dm-input.t-fb { flex: 1; min-width: 0; height: auto; min-height: calc(var(--u) * 62); align-items: flex-start; padding: calc(var(--u) * 6) calc(var(--u) * 8); font-size: calc(var(--u) * 13); line-height: 1.6; white-space: normal; }
.t-actions { display: flex; align-items: center; gap: calc(var(--u) * 10); margin-top: auto; padding-top: calc(var(--u) * 8); }
.t-hint { flex: 1; min-width: 0; font-size: calc(var(--u) * 12); line-height: 1.5; color: var(--text-tertiary); }
.dm-btn.approve { height: calc(var(--u) * 32); padding: 0 calc(var(--u) * 15); font-size: calc(var(--u) * 14); border-radius: calc(var(--u) * 6); }
.dm-btn.is-locked, .dm-input.is-locked { opacity: 0.5; }
/* 小号控件（antd size="small" = 24 高 / 12 号字），提高权重压过 DemoFrame 的 dm-* 原子类 */
.dm-btn.mini { height: calc(var(--u) * 24); padding: 0 calc(var(--u) * 8); font-size: calc(var(--u) * 12); border-radius: calc(var(--u) * 4); }
.dm-btn.is-link.mini { padding: 0 calc(var(--u) * 4); }

/* antd message：顶部居中浮层（真实 message.success 的位置与观感） */
.toast-wrap { position: absolute; top: calc(var(--u) * 10); left: 50%; transform: translateX(-50%); z-index: 2; }
.dm-toast.msg { font-size: calc(var(--u) * 13); padding: calc(var(--u) * 8) calc(var(--u) * 14); border-radius: calc(var(--u) * 8); }
.dm-toast.msg .ok { color: var(--status-success-fg); }

/* 阶段一 ↔ 阶段二 的切换（真实 .kind-pick-switch：淡出 + 缩放 .9） */
.stage-swap-enter-active, .stage-swap-leave-active { transition: opacity var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out); }
.stage-swap-enter-from, .stage-swap-leave-to { opacity: 0; transform: scale(0.9); }
</style>
