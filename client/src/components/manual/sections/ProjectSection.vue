<template>
  <ManualStep
    :steps="scene.steps"
    :caption="scene.caption"
    :aria-label="scene.ariaLabel"
    :fallback="fallback"
    fallback-alt="实训题编辑页与教师 AI 评分审核页截图"
  >
    <template #default="{ step }">
      <DemoFrame chrome="window" title="Deadpan 判题 · 实训题" :design="720">
        <Transition name="dm-fade" mode="out-in">
          <!-- ============ ① 实训题编辑页 ② 上传标准工程包 ③ 出现文件树（步骤 1-3） ============ -->
          <div v-if="step <= 2" key="edit" class="page">
            <div class="crumb">← 返回题库管理</div>

            <!-- 顶部一行：题目名称 / 难度 / 满分 + 教师操作（窄屏自动换行，不挤压输入框） -->
            <div class="dm-row meta-row">
              <span class="dm-input is-filled title-input">{{ scene.question.title }}</span>
              <span class="dm-tag is-mute">BETA</span>
              <span class="dm-sub">难度</span>
              <span class="dm-btn">{{ scene.question.difficulty }} ▾</span>
              <span class="dm-sub">满分</span>
              <span class="dm-input score-input">{{ scene.question.maxScore }}</span>
              <span class="grow" />
              <span class="dm-btn">题目描述</span>
              <span class="dm-btn">评分标准</span>
              <span class="dm-btn">查看 AI 提示词</span>
              <span class="dm-btn is-primary">保存</span>
            </div>

            <div class="body">
              <!-- 左：题目信息 -->
              <div class="col-left">
                <div class="dm-surface">
                  <div class="dm-block-head">题目信息<span>新建实训题</span></div>
                  <div class="dm-pad dm-col">
                    <div class="kv"><span class="dm-sub">题目名称</span><b>{{ scene.question.title }}</b></div>
                    <div class="kv">
                      <span class="dm-sub">难度</span>
                      <span class="dm-tag is-mute">{{ scene.question.difficulty }}</span>
                    </div>
                    <div class="kv"><span class="dm-sub">满分</span><b>{{ scene.question.maxScore }} 分</b></div>
                    <div class="kv kv--top">
                      <span class="dm-sub">评分标准</span>
                      <span class="rubric">{{ scene.question.rubric }}</span>
                    </div>
                  </div>
                </div>

                <!-- 标准工程包：未上传 = 圆形「+」选择入口；② 高亮它，③ 变成已上传 -->
                <div class="dm-surface">
                  <div class="dm-block-head">标准工程包<span>可选 · zip</span></div>
                  <div class="dm-pad">
                    <div class="zip-slot">
                      <div v-if="step < 2" class="dm-target picker" :class="{ 'is-hot': step === 1 }">
                        <span class="picker-plus">+</span>
                        <span class="picker-hint">{{ scene.zip.hint }}</span>
                        <i v-if="step === 1" class="dm-cursor is-on" />
                      </div>
                      <div v-else class="zip-ok">
                        <span class="dm-tag is-info">✓ 已上传</span>
                        <b class="zip-name">{{ scene.zip.name }}</b>
                        <span class="dm-sub">{{ scene.zip.files }} 个文件 · 已过滤依赖目录</span>
                      </div>
                    </div>
                    <p class="open-hint">{{ scene.openHint }}</p>
                  </div>
                </div>
              </div>

              <!-- 右：IDE（工具栏 + 资源管理器文件树 + 假代码区，不用真实 Monaco） -->
              <div class="col-right dm-surface">
                <div class="ide-bar">
                  <template v-if="step >= 2">
                    <span class="ftab is-on">App.vue</span>
                    <span class="ftab">UserTable.vue</span>
                  </template>
                  <span v-else class="dm-sub">代码区（缩略）</span>
                  <span class="grow" />
                  <span class="dm-btn mini">▶ 运行</span>
                  <span class="dm-btn mini is-primary">提交答案</span>
                </div>
                <div class="ide-body">
                  <div v-if="step >= 2" class="tree">
                    <div class="tree-head">资源管理器</div>
                    <div
                      v-for="f in scene.tree"
                      :key="f.name"
                      class="tree-row"
                      :class="{ 'is-dir': f.dir, 'is-active': f.active }"
                      :style="{ paddingLeft: 'calc(var(--u) * ' + (5 + f.depth * 9) + ')' }"
                    >
                      <span class="tree-ico">{{ f.dir ? '▸' : '·' }}</span>
                      <span class="tree-name">{{ f.name }}</span>
                    </div>
                  </div>
                  <div class="code" :class="{ 'is-dim': step < 2 }">
                    <div v-for="(line, i) in scene.code" :key="i" class="code-line">
                      <span class="ln">{{ i + 1 }}</span>
                      <span class="lt">{{ line }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ============ ④ 教师评审视角：AI 评分卡 ⑤ 发布成绩（步骤 4-5） ============ -->
          <div v-else key="review" class="page">
            <div class="dm-row rv-top">
              <span class="dm-btn is-link">← 返回</span>
              <b class="rv-title">{{ scene.question.title }}</b>
              <span class="dm-tag is-accent">实训题</span>
              <span class="dm-tag is-mute">BETA</span>
              <span class="dm-sub">{{ scene.student.name }} / {{ scene.student.no }}</span>
              <span class="grow" />
              <span class="dm-tag" :class="step >= 4 ? 'tag-pub' : 'is-info'">
                {{ step >= 4 ? '已发布' : 'AI 已评分' }}
              </span>
            </div>

            <div class="rv-main">
              <!-- 左：资源管理器（学生提交 / 标准答案包） -->
              <div class="rv-tree dm-surface">
                <div class="tree-tabs">
                  <span class="ttab is-on">学生提交</span>
                  <span class="ttab">标准答案包</span>
                </div>
                <div class="tree tree--plain">
                  <div
                    v-for="f in scene.tree"
                    :key="f.name"
                    class="tree-row"
                    :class="{ 'is-dir': f.dir, 'is-active': f.active }"
                    :style="{ paddingLeft: 'calc(var(--u) * ' + (5 + f.depth * 9) + ')' }"
                  >
                    <span class="tree-ico">{{ f.dir ? '▸' : '·' }}</span>
                    <span class="tree-name">{{ f.name }}</span>
                  </div>
                </div>
              </div>

              <!-- 中：代码（缩略） -->
              <div class="rv-code dm-surface">
                <div class="ide-bar">
                  <span class="ftab is-on">App.vue ×</span>
                  <span class="ftab">UserTable.vue ×</span>
                </div>
                <div class="code">
                  <div v-for="(line, i) in scene.code" :key="i" class="code-line">
                    <span class="ln">{{ i + 1 }}</span>
                    <span class="lt">{{ line }}</span>
                  </div>
                </div>
              </div>

              <!-- 右：评分面板（AI 区只读 + 教师区） -->
              <div class="rv-panel dm-surface">
                <div class="dm-block-head">评分面板<span>AI {{ scene.ai.score }} 分</span></div>
                <div class="panel-body">
                  <!-- ④ 本步的视觉焦点：AI 评分卡 -->
                  <div class="ai-head dm-target" :class="{ 'is-hot': step === 3 }">
                    <span class="dm-sub">AI 评分</span>
                    <b class="ai-num">{{ scene.ai.score }}<span class="ai-max"> / {{ scene.question.maxScore }}</span></b>
                    <span class="grow" />
                    <span class="dm-btn mini" :class="{ 'is-disabled': step >= 4 }">重新评分</span>
                  </div>

                  <div class="bd-list">
                    <div v-for="b in scene.ai.breakdown" :key="b.item" class="bd-row">
                      <div class="bd-line">
                        <span class="bd-name">{{ b.item }}</span>
                        <i class="dm-tag is-mute tiny">{{ b.kind }}</i>
                        <span class="grow" />
                        <span class="bd-score">{{ b.score }} / {{ b.max }}</span>
                      </div>
                      <div class="bd-comment">{{ b.comment }}</div>
                    </div>
                  </div>

                  <div class="hl-list">
                    <div v-for="h in scene.ai.highlights" :key="h" class="hl good">✓ {{ h }}</div>
                    <div v-for="p in scene.ai.issues" :key="p" class="hl issue">△ {{ p }}</div>
                  </div>

                  <div class="ai-comment">
                    <div class="ai-comment-text">{{ scene.ai.overallComment }}</div>
                    <span class="dm-btn is-link mini">引用到教师评语</span>
                  </div>

                  <div class="t-row">
                    <span class="dm-sub t-label">最终分数</span>
                    <span class="dm-input score-input">{{ scene.ai.finalScore }}</span>
                    <span class="dm-sub">满分 {{ scene.question.maxScore }}</span>
                  </div>
                  <div class="t-row">
                    <span class="dm-sub t-label">教师评语</span>
                    <span class="dm-input is-filled fb">{{ scene.ai.teacherFeedback }}</span>
                  </div>

                  <div class="t-actions">
                    <span class="t-hint">
                      {{ step >= 4 ? '成绩已发布，不可修改' : '审核通过后学生即可看到分数与评语' }}
                    </span>
                    <span class="dm-btn is-primary mini" :class="{ 'is-disabled': step >= 4 }">审核通过</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 底部审核操作条（对齐「评分审核」页的 保存审核 / 发布成绩） -->
            <div class="rv-bar">
              <span class="dm-sub">共 1 题，AI 总分 {{ scene.ai.score }} / {{ scene.question.maxScore }}</span>
              <span class="grow" />
              <span class="dm-btn">保存审核</span>
              <!-- ⑤ 高亮「发布成绩」 -->
              <span class="dm-btn dm-target" :class="{ 'is-hot': step === 4 }">
                发布成绩<i v-if="step === 4" class="dm-cursor is-on" />
              </span>
            </div>

            <Transition name="dm-fade">
              <div v-if="step >= 4" class="toast-wrap"><span class="dm-toast">✓ 全部已发布</span></div>
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
export const meta = { order: 7, title: '7. 实训题 · 新建与 AI 评审', anchor: 'project' };
</script>

<script setup>
/**
 * 手册 · 第 7 节「实训题管理」的可播放演示：新建实训题 → 上传标准工程包 → 教师 AI 评审 → 发布成绩
 *
 * 结构：ManualStep（播放器/步骤驱动） → DemoFrame（外壳 + 设计单位缩放） → 复刻的假界面
 * 界面只按 props.step 渲染状态，状态之间靠 CSS transition；不调接口、不依赖登录态、不 import 业务组件。
 * 文案抄自真实视图（ProjectQuestionEdit.vue / ProjectReviewNew.vue / ReviewDetail.vue），假数据在 scenes/project.js。
 * 代码区是纯文本缩略（行号 + 等宽字），**不是**真实 Monaco。
 */
import ManualStep from '../ManualStep.vue';
import DemoFrame from '../DemoFrame.vue';
import { project as scene } from '../scenes/project.js';

defineProps({
  /** 截图兜底（由 docs/manual/shots.mjs 生成）；不传则直接显示复刻界面 */
  fallback: { type: String, default: '' },
});
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: calc(var(--u) * 10); }
.grow { flex: 1; min-width: 0; }

/* ===== 编辑页 ===== */
.crumb { font-size: calc(var(--u) * 11.5); color: var(--text-brand); }
.meta-row { flex-wrap: wrap; row-gap: calc(var(--u) * 6); }
.title-input { flex: 1 1 auto; min-width: calc(var(--u) * 140); font-weight: 600; }
.score-input { width: calc(var(--u) * 46); justify-content: center; flex: none; }
.body { display: flex; align-items: stretch; gap: calc(var(--u) * 10); }
.col-left { flex: 0 0 calc(var(--u) * 244); min-width: 0; display: flex; flex-direction: column; gap: calc(var(--u) * 10); }
.col-right { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.kv { display: flex; align-items: center; gap: calc(var(--u) * 8); font-size: calc(var(--u) * 12); color: var(--text-primary); min-width: 0; }
.kv .dm-sub { flex: none; width: calc(var(--u) * 52); }
.kv b { font-weight: 600; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kv--top { align-items: flex-start; }
.rubric { min-width: 0; font-size: calc(var(--u) * 11.5); line-height: 1.6; color: var(--text-secondary); }

/* 上传入口（ProjectZipUploader 的圆形「+」+ 提示，演示里压成紧凑一行） */
.zip-slot { display: flex; align-items: center; min-height: calc(var(--u) * 44); }
.picker { flex: 1; display: flex; align-items: center; gap: calc(var(--u) * 9); padding: calc(var(--u) * 8) calc(var(--u) * 10); border: calc(var(--u) * 1.5) dashed var(--border-strong); border-radius: calc(var(--u) * 10); background: var(--bg-surface-2); }
.picker-plus { flex: none; display: grid; place-items: center; width: calc(var(--u) * 28); height: calc(var(--u) * 28); border-radius: 50%; border: calc(var(--u) * 2) dashed var(--border-strong); background: var(--card-bg); color: var(--text-tertiary); font-size: calc(var(--u) * 15); line-height: 1; }
.picker-hint { min-width: 0; font-size: calc(var(--u) * 11.5); color: var(--text-tertiary); }
.zip-ok { display: flex; align-items: center; flex-wrap: wrap; gap: calc(var(--u) * 6); font-size: calc(var(--u) * 11.5); }
.zip-name { font-weight: 600; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.open-hint { margin: calc(var(--u) * 8) 0 0; font-size: calc(var(--u) * 10.5); line-height: 1.6; color: var(--text-tertiary); }

/* IDE（工具栏 / 文件树 / 假代码区） */
.ide-bar { display: flex; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 5) calc(var(--u) * 8); background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); }
.ide-body { flex: 1; display: flex; min-height: calc(var(--u) * 200); background: var(--bg-sunken); }
.ftab { display: inline-flex; align-items: center; height: calc(var(--u) * 19); padding: 0 calc(var(--u) * 8); border-radius: calc(var(--u) * 5); background: var(--bg-sunken); font-size: calc(var(--u) * 10.5); color: var(--text-secondary); white-space: nowrap; }
.ftab.is-on { background: var(--card-bg); color: var(--text-primary); font-weight: 600; }
.tree { flex: 0 0 calc(var(--u) * 130); padding: calc(var(--u) * 6) 0; background: var(--bg-surface-2); border-right: 1px solid var(--border-subtle); overflow: hidden; }
.tree-head { padding: 0 calc(var(--u) * 8) calc(var(--u) * 5); font-size: calc(var(--u) * 9.5); font-weight: 600; color: var(--text-secondary); letter-spacing: calc(var(--u) * 0.5); }
.tree-row { display: flex; align-items: center; gap: calc(var(--u) * 4); padding-right: calc(var(--u) * 6); font-size: calc(var(--u) * 11); line-height: calc(var(--u) * 17); color: var(--text-primary); }
.tree-row.is-active { background: var(--bg-selected); color: var(--text-brand); }
.tree-ico { flex: none; width: calc(var(--u) * 10); text-align: center; color: var(--text-tertiary); }
.tree-row.is-dir .tree-ico { color: var(--status-warning-fg); }
.tree-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code { flex: 1 1 auto; min-width: 0; padding: calc(var(--u) * 7) 0; background: var(--card-bg); overflow: hidden; transition: opacity var(--duration-base) var(--ease-out); }
.code.is-dim { opacity: 0.38; }
.code-line { display: flex; gap: calc(var(--u) * 8); padding: 0 calc(var(--u) * 8); font-family: MonacoDSH, ui-monospace, Menlo, monospace; font-size: calc(var(--u) * 10.5); line-height: calc(var(--u) * 14.5); color: var(--text-primary); }
.ln { flex: none; width: calc(var(--u) * 13); text-align: right; color: var(--text-tertiary); }
.lt { overflow: hidden; text-overflow: ellipsis; white-space: pre; }

/* ===== 评审页 ===== */
.rv-top { flex-wrap: wrap; row-gap: calc(var(--u) * 6); }
.rv-title { font-size: calc(var(--u) * 13); font-weight: 700; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-pub { background: var(--status-success-bg); border-color: var(--status-success-bd); color: var(--status-success-fg); }
.rv-main { display: flex; align-items: stretch; gap: calc(var(--u) * 8); }
.rv-tree { flex: 0 0 calc(var(--u) * 130); min-width: 0; display: flex; flex-direction: column; }
.tree-tabs { display: flex; gap: calc(var(--u) * 8); padding: calc(var(--u) * 5) calc(var(--u) * 8) 0; border-bottom: 1px solid var(--border-subtle); }
.ttab { padding-bottom: calc(var(--u) * 5); font-size: calc(var(--u) * 10.5); color: var(--text-secondary); border-bottom: calc(var(--u) * 2) solid transparent; white-space: nowrap; }
.ttab.is-on { color: var(--text-brand); border-bottom-color: var(--brand-600); font-weight: 600; }
.tree--plain { flex: 1; border-right: 0; background: transparent; }
.rv-code { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.rv-code .code { flex: 1; }
.rv-panel { flex: 0 0 calc(var(--u) * 236); min-width: 0; display: flex; flex-direction: column; }
.panel-body { display: flex; flex-direction: column; gap: calc(var(--u) * 6); padding: calc(var(--u) * 8); }
.ai-head { display: flex; align-items: center; gap: calc(var(--u) * 6); padding: calc(var(--u) * 6) calc(var(--u) * 7); border-radius: calc(var(--u) * 7); background: var(--bg-surface-2); }
.ai-num { font-size: calc(var(--u) * 16); font-weight: 700; color: var(--text-brand); line-height: 1; }
.ai-max { font-size: calc(var(--u) * 10.5); font-weight: 400; color: var(--text-tertiary); }
.bd-list { display: flex; flex-direction: column; }
.bd-row { display: flex; flex-direction: column; gap: calc(var(--u) * 2); padding: calc(var(--u) * 4) 0; border-bottom: 1px dashed var(--border-subtle); }
.bd-row:last-child { border-bottom: 0; }
.bd-line { display: flex; align-items: center; gap: calc(var(--u) * 4); font-size: calc(var(--u) * 10.5); color: var(--text-primary); }
.bd-name { font-weight: 600; }
.bd-score { color: var(--text-brand); font-weight: 600; white-space: nowrap; }
.bd-comment { font-size: calc(var(--u) * 10); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hl-list { display: flex; flex-direction: column; gap: calc(var(--u) * 3); }
.hl { font-size: calc(var(--u) * 10.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hl.good { color: var(--status-success-fg); }
.hl.issue { color: var(--status-warning-fg); }
.ai-comment { padding: calc(var(--u) * 6) calc(var(--u) * 7); border-left: calc(var(--u) * 3) solid var(--brand-600); border-radius: calc(var(--u) * 5); background: var(--bg-surface-2); }
.ai-comment-text { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: calc(var(--u) * 10.5); line-height: 1.6; color: var(--text-primary); }
.t-row { display: flex; align-items: center; gap: calc(var(--u) * 6); min-width: 0; }
.t-label { flex: none; width: calc(var(--u) * 52); white-space: nowrap; }
.fb { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); }
.t-actions { display: flex; align-items: center; gap: calc(var(--u) * 6); }
.t-hint { flex: 1; min-width: 0; font-size: calc(var(--u) * 10); line-height: 1.5; color: var(--text-tertiary); }
.rv-bar { display: flex; align-items: center; gap: calc(var(--u) * 8); padding: calc(var(--u) * 7) calc(var(--u) * 9); border: 1px solid var(--border-default); border-radius: calc(var(--u) * 9); background: var(--bg-surface-2); }
.toast-wrap { display: flex; justify-content: flex-end; }

/* 小尺寸控件（提高选择器权重压过 DemoFrame 的 dm-* 原子类） */
.dm-btn.mini { height: calc(var(--u) * 20); padding: 0 calc(var(--u) * 7); font-size: calc(var(--u) * 10.5); }
.dm-tag.tiny { height: calc(var(--u) * 14); padding: 0 calc(var(--u) * 4); font-size: calc(var(--u) * 9); }
.dm-btn.is-disabled { opacity: 0.5; }
</style>
