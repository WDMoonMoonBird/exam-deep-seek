<template>
  <div class="sp-page" v-if="data">
    <!-- 顶栏 -->
    <div class="sp-top">
      <a-button type="link" size="small" @click="$router.back()">
        <ArrowLeftOutlined /> 返回
      </a-button>
      <!-- B3-1 ⑤：标题层级与 Layout 的 h1 衔接（h1 → h2 → 页内 h3）：由 h3 提升为 h2，避免 axe heading-order；
         该类的字号/字重/margin 均已在 CSS 显式声明，标签变化不产生任何视觉差异。 -->
      <h2 class="sp-title">{{ q.title }}</h2>
      <a-tag v-if="isPracticeMode" class="tag-success" size="small">练习 · 第 {{ currentAttempt }} 次</a-tag>
      <a-tag v-if="isPracticeMode && maxAttempts" size="small">可提交 {{ remainingAttempts }} 次</a-tag>
      <a-tag class="tag-warning">总分 {{ q.maxScore }} 分</a-tag>
      <a-tag v-if="totalScored > 0" class="tag-success">得分 {{ totalScored }} / {{ q.maxScore }}</a-tag>
      <a-tag v-if="bestScore != null" color="blue">最高分 {{ bestScore }} / {{ q.maxScore }}</a-tag>
      <span v-if="isExpired" class="sp-expired-tag">已过期</span>
    </div>

    <!-- 主体 -->
    <div class="sp-main">
      <!-- 左侧导航 -->
      <nav class="sp-nav">
        <div class="sp-nav-title">题目导航</div>
        <div class="sp-nav-list">
          <template v-for="(sq, i) in subQuestions" :key="sq.id">
            <!-- 小节标题（可折叠） -->
            <div class="n-section-head" @click="toggleCollapse(sq.id)">
              <span class="n-section-arrow" :class="{ collapsed: collapsedSqs.has(sq.id) }">▾</span>
              <span class="n-section-label">{{ getNavLabel(sq, i) }}</span>
              <span class="n-section-count">{{ sq.type === 'objective' ? (sq.objectiveItems || []).length + '问' : '编程' }}</span>
            </div>

            <!-- 主观题：一个方块 -->
            <div v-if="sq.type === 'code' || !sq.type" class="n-grid-wrap" :class="{ collapsed: collapsedSqs.has(sq.id) }">
              <div class="n-grid">
                <div
                  :class="sqBoxClass(sq.id, undefined, getSqResult(sq))"
                  role="button"
                  tabindex="0"
                  :aria-label="boxLabel(i, undefined, getSqResult(sq))"
                  :aria-current="isActiveAnchor('sq-' + sq.id) ? 'true' : null"
                  @click="activateAnchor('sq-' + sq.id); scrollTo('sq-' + sq.id)"
                  @keydown="onBoxKeydown($event, i, undefined)"
                >1</div>
              </div>
            </div>

            <!-- 客观题：每个小问一个方块，横向排列 -->
            <div v-else class="n-grid-wrap" :class="{ collapsed: collapsedSqs.has(sq.id) }">
              <div class="n-grid">
                <div
                  v-for="item in sq.objectiveItems" :key="item.key"
                  :class="sqBoxClass(sq.id, item.key, getItemResult(sq.id, item.key))"
                  :title="itemTypeLabel(item.type)"
                  role="button"
                  tabindex="0"
                  :aria-label="boxLabel(i, item.key, getItemResult(sq.id, item.key))"
                  :aria-current="isActiveAnchor('sq-' + sq.id + '-item-' + item.key) ? 'true' : null"
                  @click="activateAnchor('sq-' + sq.id + '-item-' + item.key); scrollTo('sq-' + sq.id + '-item-' + item.key)"
                  @keydown="onBoxKeydown($event, i, item.key)"
                >{{ item.key + 1 }}</div>
              </div>
            </div>
          </template>
        </div>
        <div class="sp-nav-footer">
          <span v-if="dirtyCount" class="dirty-hint">{{ dirtyCount }} 题未保存</span>
          <span v-else-if="draftNoticeText" class="draft-note">{{ draftNoticeText }}</span>
          <span v-else class="sync-ok">草稿已同步</span>
        </div>
      </nav>

      <!-- 右侧：流式答题区 -->
      <div class="sp-content" ref="contentRef">
        <!-- 材料 -->
        <div v-if="materialText" class="sp-material-bar" @click="showMaterial = !showMaterial">
          <span>题目材料</span>
          <span class="material-arrow" :class="{ open: showMaterial }">▼</span>
        </div>
        <Transition name="collapse">
          <div v-if="showMaterial && materialText" class="sp-material-body">
            <div class="sp-material-inner q-content" v-html="safeMaterial" />
          </div>
        </Transition>

        <!-- 题目流 -->
        <div
          v-for="(sq, i) in subQuestions" :key="sq.id"
          :data-section="'sq-' + sq.id"
          :id="'sq-' + sq.id"
          class="sq-section"
        >
          <!-- 小题头部 -->
          <div class="sq-header">
            <span class="sq-num">第 {{ i + 1 }} 小题</span>
            <a-tag v-if="sq.type === 'objective'" class="tag-accent" size="small">
              {{ getNavLabel(sq, i).replace('第' + (i + 1) + '小题 ', '') || '客观题' }}
            </a-tag>
            <a-tag v-else color="blue" size="small">编程题</a-tag>
            <span class="sq-score">{{ sq.score }} 分</span>
            <span class="sq-status-spacer"></span>
            <a-tag v-if="subStatuses[sq.id] === 'published' || (isPracticeMode && (subStatuses[sq.id] === 'ai_graded' || subStatuses[sq.id] === 'reviewed'))" class="tag-success" size="small">
              得分 {{ subScores[sq.id] }} / {{ sq.score }}
            </a-tag>
            <a-tag v-else-if="subStatuses[sq.id] === 'submitted'" color="blue" size="small">
              <span class="spinner-dot"></span> 评分中...
            </a-tag>
            <a-tag v-else-if="subStatuses[sq.id] === 'ai_graded' || subStatuses[sq.id] === 'reviewed'" color="blue" size="small">
              <span class="spinner-dot"></span> 已提交
            </a-tag>
          </div>

          <!-- 题干 -->
          <div class="sq-stem q-content" v-html="safeSqContent(sq)" />

          <!-- 主观题：CodeEditor -->
          <template v-if="sq.type === 'code' || !sq.type">
            <div class="sq-editor-toolbar">
              <!-- T5-A2：语言选择器没有可见 label；placeholder 不算可访问名称、aria-label 又会被 antd
                   渲染到外层 .ant-select div（落不到 role=combobox 的 input）→ 视觉隐藏 label + for/id。
                   .visually-hidden 走 style.css 的全局工具类（与 t7 各页同值），本页不再重复定义 -->
              <label :for="'sq-lang-' + sq.id" class="visually-hidden">第 {{ i + 1 }} 题代码语言</label>
              <a-select
                :id="'sq-lang-' + sq.id"
                :value="editorLangs[sq.id] || sq.language || 'cpp'"
                @change="(v) => editorLangs[sq.id] = v"
                size="small" class="lang-select"
                :disabled="isSqReadonly(sq.id)"
              >
                <a-select-option v-for="l in langs" :key="l" :value="l">{{ l }}</a-select-option>
              </a-select>
              <a-button size="small" type="text" :disabled="isSqReadonly(sq.id)" @click="formatEditor(sq.id)">
                ⚡ 格式化
              </a-button>
            </div>
            <div v-if="editorMounted[sq.id]" class="sq-editor-wrap" @click="activateAnchor('sq-' + sq.id)">
              <CodeEditor
                :ref="(el) => { if (el) editorRefs[sq.id] = el; }"
                v-model="answers[sq.id]"
                :language="editorLangs[sq.id] || sq.language || 'cpp'"
                :readOnly="isSqReadonly(sq.id)"
                :height="560"
              />
            </div>
            <div
              v-else
              :ref="(el) => setupEditorObserve(el, sq.id)"
              class="sq-editor-placeholder"
              @click="activateAnchor('sq-' + sq.id)"
            >
              <div class="placeholder-inner">
                <span>滚动至此加载编辑器</span>
              </div>
            </div>
          </template>

          <!-- 主观题参考答案（已出分后显示） -->
          <div v-if="sqHasScore(sq.id) && sq.referenceAnswer" class="sq-reference">
            <div class="fb-label">参考答案</div>
            <pre class="reference-code">{{ sq.referenceAnswer }}</pre>
          </div>

          <!-- 客观题：小问列表 -->
          <template v-else-if="sq.type === 'objective'">
            <div
              v-for="item in (sq.objectiveItems || [])" :key="item.key"
              :data-section="'sq-' + sq.id + '-item-' + item.key"
              :id="'sq-' + sq.id + '-item-' + item.key"
              class="oi-card"
              :class="oiCardClass(sq.id, item)"
              @click="activateAnchor('sq-' + sq.id + '-item-' + item.key)"
            >
              <div class="oi-head">
                <span class="oi-num">{{ item.key + 1 }}.</span>
                <a-tag :color="itemTypeColor(item.type)" :class="itemTypeClass(item.type)" size="small">{{ itemTypeLabel(item.type) }}</a-tag>
                <span v-if="item.score" class="oi-score">+{{ item.score }} 分</span>
                <span v-if="isSqReadonly(sq.id) && itemAnswers[getItemKey(sq.id, item.key)]?.correct !== undefined" class="oi-judge" :class="{ correct: itemAnswers[getItemKey(sq.id, item.key)].correct, wrong: !itemAnswers[getItemKey(sq.id, item.key)].correct }">
                  {{ itemAnswers[getItemKey(sq.id, item.key)].correct ? '✓ 正确' : '✗ 错误' }}
                </span>
              </div>
              <div class="oi-stem" :class="{ 'oi-stem-code': isCodeStem(item.stem) }">{{ item.stem }}</div>

              <!-- 单选 -->
              <div v-if="item.type === 'choice'" class="oi-answer">
                <a-radio-group
                  v-model:value="itemAnswers[getItemKey(sq.id, item.key)].answer"
                  :disabled="isSqReadonly(sq.id)"
                  class="oi-answer-col"
                >
                  <a-radio v-for="opt in item.options" :key="opt.key" :value="opt.key">
                    {{ opt.key }}. {{ opt.text || '(待填写)' }}
                  </a-radio>
                </a-radio-group>
              </div>

              <!-- 多选 -->
              <div v-else-if="item.type === 'multi_choice'" class="oi-answer">
                <a-checkbox-group
                  v-model:value="multiAnswerBind[getItemKey(sq.id, item.key)]"
                  :disabled="isSqReadonly(sq.id)"
                  class="oi-answer-col"
                  @change="onMultiBindChange(sq.id, item.key)"
                >
                  <a-checkbox v-for="opt in item.options" :key="opt.key" :value="opt.key">
                    {{ opt.key }}. {{ opt.text || '(待填写)' }}
                  </a-checkbox>
                </a-checkbox-group>
              </div>

              <!-- 判断 -->
              <div v-else-if="item.type === 'judge'" class="oi-answer">
                <a-radio-group
                  v-model:value="itemAnswers[getItemKey(sq.id, item.key)].answer"
                  :disabled="isSqReadonly(sq.id)"
                  style="display:flex;gap:24px;"
                >
                  <a-radio value="true">✓ 正确</a-radio>
                  <a-radio value="false">✗ 错误</a-radio>
                </a-radio-group>
              </div>

              <!-- 填空 -->
              <div v-else-if="item.type === 'fill'" class="oi-answer">
                <a-input
                  v-model:value="itemAnswers[getItemKey(sq.id, item.key)].answer"
                  :disabled="isSqReadonly(sq.id)"
                  placeholder="请输入答案"
                  :style="{ fontFamily: 'var(--font-mono)' }"
                />
              </div>

              <!-- 已出分：显示正确答案 -->
              <div v-if="sqHasScore(sq.id) && item.answer != null" class="oi-reference">
                正确答案：{{ formatItemAnswer(item) }}
              </div>
            </div>
          </template>

          <!-- 评语（已出分时显示） -->
          <div v-if="subFeedbacks[sq.id]" class="sq-feedback">
            <div class="fb-label">评语</div>
            <div class="fb-body">{{ subFeedbacks[sq.id] || '暂无反馈' }}</div>
          </div>
        </div>

        <!-- 底部：练习模式全部出分 → 重新答题 -->
        <div class="sp-submit-bar is-center" v-if="practiceAllGraded">
          <a-button type="primary" size="large" @click="retryPractice">重新答题</a-button>
        </div>

        <!-- 底部提交栏 -->
        <div class="sp-submit-bar" v-else-if="!allSubmitted && !isExpired">
          <div class="sp-submit-info">
            <template v-if="unsubmittedCount === 0">
              <span class="sync-ok">✓ 全部已提交</span>
            </template>
            <template v-else>
              <span>共 {{ subQuestions.length }} 题，{{ unsubmittedCount }} 题未提交</span>
            </template>
          </div>
          <a-button
            type="primary" size="large"
            :loading="submittingAll"
            :disabled="submitDisabled"
            @click="submitAll"
          >
            {{ submitDisabled && !allowResubmit ? '已提交' : '提交全部' }}
          </a-button>
        </div>
        <div class="sp-submit-bar" v-else-if="allowResubmit && !isExpired">
          <a-button type="primary" size="large" @click="submitAll" :loading="submittingAll">
            全部重新提交
          </a-button>
        </div>
        <div class="sp-submit-bar" v-else-if="isExpired">
          <span class="ended-hint">考试已结束</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeftOutlined } from '@ant-design/icons-vue';
import CodeEditor from '../../components/CodeEditor.vue';
import { useConfirm } from '../../composables/useConfirm.js';
import {
  getItemKey, itemTypeLabel, itemTypeColor, itemTypeClass,
  formatItemAnswer, isCodeStem, boxLabel,
} from '../../composables/submit/answerFormat.js';
import { useSubmitPage } from '../../composables/submit/useSubmitPage.js';

const route = useRoute();
const { confirm } = useConfirm();

// 接线根：全部状态与行为由 useSubmitPage 组装（P1 的 22 个状态只在 useAnswerState 里创建一次）
const {
  // —— 模板直接可见（50 个 script 名字 + 1 个模板 ref）——
  data, q, subQuestions, allowResubmit, showMaterial, isPracticeMode, maxAttempts,
  currentAttempt, bestScore, submittingAll, langs,
  answers, itemAnswers, multiAnswerBind, subStatuses, subScores, subFeedbacks, editorLangs,
  contentRef, collapsedSqs, isActiveAnchor,
  onBoxKeydown, toggleCollapse, scrollTo, activateAnchor, retryPractice, sqBoxClass,
  editorMounted, editorRefs, setupEditorObserve, formatEditor,
  dirtyCount, draftNoticeText,
  isExpired, isSqReadonly, materialText, safeMaterial, safeSqContent,
  remainingAttempts, totalScored, unsubmittedCount, allSubmitted,
  submitDisabled, practiceAllGraded, submitAll,
  getNavLabel, sqHasScore, getSqResult, getItemResult, oiCardClass, onMultiBindChange,
  // —— onMounted / onUnmounted 的回调体由 useSubmitPage 提供，注册只发生在本文件、各一次 ——
  onPageMounted, disposePage,
} = useSubmitPage({ route, confirm });

onMounted(onPageMounted);
onUnmounted(disposePage);
</script>

<style scoped>
.sp-page {
  display: flex; flex-direction: column;
  /* 顶格到 topbar 下沿，并抵消 student/Layout.vue 内容区的内距（topbar+space-6 / space-12 / space-10） */
  height: calc(100vh - var(--layout-topbar-h));
  margin: calc(-1 * var(--space-6)) calc(-1 * var(--space-12)) calc(-1 * var(--space-10));
  padding: 0;
  overflow: hidden;
  background: var(--bg-canvas);
}

/* 顶栏（T4 顶部信息条：返回 + 考试名 + 状态标签） */
.sp-top {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-2) var(--space-5);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.sp-title { font-size: var(--fs-title-2); font-weight: var(--fw-bold); margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-expired-tag {
  font-size: var(--fs-caption); color: var(--status-danger-fg);
  border: 1px solid var(--status-danger-fg); border-radius: var(--radius-xs); padding: 0 var(--space-2);
}

/* 主体：左侧题号导航 + 右侧作答区 */
.sp-main {
  flex: 1; display: flex; min-height: 0; overflow: hidden;
}

/* 左侧导航 */
.sp-nav {
  width: 220px; flex-shrink: 0;
  background: var(--bg-surface-2); border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; overflow: hidden;
}
.sp-nav-title {
  padding: var(--space-3) var(--space-3) var(--space-2);
  font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
}
.sp-nav-list {
  flex: 1; overflow-y: auto; padding: var(--space-2) var(--space-3) var(--space-4);
}
.sp-nav-footer {
  padding: var(--space-2) var(--space-3); font-size: var(--fs-caption);
  border-top: 1px solid var(--border-subtle); flex-shrink: 0;
}
.dirty-hint { color: var(--status-warning-fg); }
.sync-ok { color: var(--status-success-fg); }
/* D3：服务端跳过草稿（未入库）时的如实提示 —— 与「未保存」同一警示色 */
.draft-note { color: var(--status-warning-fg); }
/* T4-F2 本页份额：语义警示标签改用 B2-2 的全局类 .tag-warning（定义在 style.css，
   值 = --status-warning-* 三元组）；本页不再自带局部实现，避免两套并存 */
.ended-hint { color: var(--text-tertiary); font-size: var(--fs-body); }

/* 小节标题（可点击折叠） */
.n-section-head {
  display: flex; align-items: center; gap: 6px;
  margin: var(--space-3) 0 var(--space-2); padding: 6px 4px;
  cursor: pointer; user-select: none;
  font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-secondary);
  transition: var(--transition-control);
  border-radius: var(--radius-sm);
}
.n-section-head:first-child { margin-top: 0; }
.n-section-head:hover { color: var(--text-link); }
.n-section-arrow {
  font-size: var(--fs-body); width: 16px; flex-shrink: 0;
  color: var(--text-tertiary); margin-right: 2px;
  transition: transform var(--duration-base) var(--ease-out);
}
.n-section-arrow.collapsed { transform: rotate(-90deg); }
.n-section-head:hover .n-section-arrow { color: var(--text-link); }
.n-section-label { flex: 1; }
.n-section-count {
  /* T4-F3：承载信息（分区题型/问数）而非禁用态 → --text-secondary（亮 5.91:1 / 暗 8.52:1） */
  font-size: 10px; font-weight: var(--fw-regular); color: var(--text-secondary);
  background: var(--bg-sunken); padding: 0 5px; border-radius: var(--radius-pill);
}

/* 方块网格容器（折叠动画） */
.n-grid-wrap {
  max-height: none;
  overflow: visible;
  transition: max-height var(--duration-slow) var(--ease-out), opacity var(--duration-base) var(--ease-out);
  opacity: 1;
}
.n-grid-wrap.collapsed {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
}

/* 方块网格 */
.n-grid {
  display: flex; flex-wrap: wrap; gap: 5px;
  padding: 4px 2px;
}

/* 方块（状态色走 --status-* 三元组） */
.n-box {
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); font-size: var(--fs-caption); font-weight: var(--fw-semibold);
  cursor: pointer; transition: var(--transition-control);
  border: 2px solid transparent;
  user-select: none;
  flex-shrink: 0;
}

/* 已答（未出分） */
.n-box-done {
  background: var(--status-info-bg); border-color: var(--status-info-bd); color: var(--status-info-fg);
}
/* 正确 */
.n-box-correct {
  background: var(--status-success-bg); border-color: var(--status-success-bd); color: var(--status-success-fg);
}
/* 错误 */
.n-box-wrong {
  background: var(--status-danger-bg); border-color: var(--status-danger-bd); color: var(--status-danger-fg);
}
/* 部分正确 */
.n-box-partial {
  background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg);
}
/* 未答（格子里的题号是可读信息，不是禁用文本） */
.n-box-empty {
  /* T4-F3：--text-disabled 误用 → --text-secondary（亮 6.75:1 / 暗 8.07:1） */
  background: var(--bg-surface); border-color: var(--border-default); color: var(--text-secondary);
}

/* 当前激活（规则置于各状态色之后：同优先级即可覆盖，无需提升优先级） */
.n-box-active {
  border-color: var(--brand-600);
  background: var(--bg-selected);
  color: var(--text-brand);
  box-shadow: var(--ring-focus);
}

/* 右侧答题区 */
.sp-content {
  flex: 1; min-width: 0; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
  padding: 0 var(--space-6) var(--space-6);
}

/* 材料 */
.sp-material-bar {
  display: flex; align-items: center; gap: var(--space-2);
  margin-top: var(--space-4); padding: var(--space-3) var(--space-4);
  font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-secondary);
  cursor: pointer; user-select: none;
  background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);
}
.sp-material-bar:hover { background: var(--bg-hover); }
.material-arrow { margin-left: auto; font-size: 10px; transition: transform var(--duration-base) var(--ease-out); }
.material-arrow.open { transform: rotate(180deg); }
.sp-material-body { overflow: hidden; }
.sp-material-inner { padding: var(--space-3) var(--space-4); background: var(--bg-surface-2); border-radius: 0 0 var(--radius-md) var(--radius-md); }
.collapse-enter-active, .collapse-leave-active { transition: max-height var(--duration-slow) var(--ease-out), opacity var(--duration-base) var(--ease-out); }
.collapse-enter-from, .collapse-leave-to { opacity: 0; max-height: 0; }
.collapse-enter-to, .collapse-leave-from { opacity: 1; max-height: 800px; }

/* 题目区段 */
.sq-section {
  margin-top: var(--space-6); padding: var(--space-5) var(--space-6);
  background: var(--card-bg); border-radius: var(--card-radius);
  border: 1px solid var(--card-bd);
  box-shadow: var(--card-shadow);
  scroll-margin-top: var(--space-4);
}
.sq-header {
  display: flex; align-items: center; gap: var(--space-3);
  padding-bottom: var(--space-3); margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}
.sq-num { font-size: var(--fs-title-3); font-weight: var(--fw-bold); color: var(--text-primary); }
.sq-score { margin-left: auto; font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-link); }
.sq-status-spacer { flex: 1; }
.sq-stem { margin-bottom: 16px; }

/* 编辑器 */
.sq-editor-toolbar {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 6px var(--space-3); background: var(--bg-surface-2);
  border: 1px solid var(--border-default); border-bottom: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}
.lang-select { width: 110px; }
.sq-editor-wrap {
  border: 1px solid var(--border-default); border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  overflow: hidden;
}
.sq-editor-wrap :deep(.monaco-editor) { border: none; }
.sq-editor-placeholder {
  border: 1px solid var(--border-default); border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}
.placeholder-inner {
  height: 280px; display: flex; align-items: center; justify-content: center;
  /* T4-F3：占位文案 → --text-tertiary（亮 4.71:1 / 暗 4.65:1，均 ≥4.5） */
  background: var(--bg-surface-2); color: var(--text-tertiary); font-size: var(--fs-body);
}

/* 客观题小问卡片 */
.oi-card {
  margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4);
  border: 2px solid var(--border-subtle); border-radius: var(--radius-md);
  scroll-margin-top: var(--space-4);
  transition: var(--transition-control);
}
.oi-card:hover { border-color: var(--border-strong); }
.oi-card.oi-correct { border-color: var(--status-success-bd); background: var(--status-success-bg); }
.oi-card.oi-wrong { border-color: var(--status-danger-bd); background: var(--status-danger-bg); }
.oi-card:last-child { margin-bottom: 0; }
.oi-head {
  display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);
}
.oi-num { font-weight: var(--fw-bold); font-size: var(--fs-body); }
.oi-score { font-size: var(--fs-caption); color: var(--text-link); font-weight: var(--fw-semibold); }
.oi-judge { margin-left: auto; font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }
.oi-judge.correct { color: var(--status-success-fg); }
.oi-judge.wrong { color: var(--status-danger-fg); }
.oi-stem { font-size: var(--fs-body); line-height: 1.7; margin-bottom: var(--space-2); white-space: pre-wrap; }
.oi-stem-code { font-family: var(--font-mono); font-size: var(--fs-body-sm); background: var(--bg-sunken); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); }
.oi-answer { margin-top: var(--space-2); }
.oi-answer-col { display: flex; flex-direction: column; gap: 6px; }

/* 评语 */
.sq-feedback {
  margin-top: var(--space-4); padding: var(--space-3) var(--space-4);
  background: var(--bg-sunken); border-radius: var(--radius-md);
  border-left: 3px solid var(--brand-600);
}
.fb-label { font-weight: var(--fw-semibold); font-size: var(--fs-body-sm); margin-bottom: 4px; }
.fb-body { font-size: var(--fs-body-sm); color: var(--text-secondary); line-height: 1.7; }

/* 参考答案（仅出分后 + 接口返回 referenceAnswer 时渲染） */
.sq-reference {
  margin-top: var(--space-4); padding: var(--space-3) var(--space-4);
  background: var(--status-success-bg); border: 1px solid var(--status-success-bd); border-radius: var(--radius-md);
  max-height: 360px; overflow: auto;
}
.reference-code {
  margin: var(--space-2) 0 0; font-size: var(--fs-body-sm); line-height: 1.7;
  white-space: pre-wrap; word-break: break-all;
  font-family: var(--font-mono);
  color: var(--text-primary);
}
.oi-reference {
  margin-top: var(--space-2); padding: 6px 10px;
  background: var(--status-warning-bg); border: 1px solid var(--status-warning-bd); border-radius: var(--radius-sm);
  font-size: var(--fs-body-sm); color: var(--status-warning-fg);
}

/* 底部提交栏 */
.sp-submit-bar {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: var(--space-6); margin-bottom: var(--space-10);
  padding: var(--space-4) var(--space-6);
  background: var(--bg-surface); border-radius: var(--card-radius);
  border: 1px solid var(--card-bd);
  box-shadow: var(--shadow-sm);
  position: sticky; bottom: 0; z-index: var(--z-sticky);
}
.sp-submit-bar.is-center { justify-content: center; }
.sp-submit-info { font-size: var(--fs-body); color: var(--text-tertiary); }

/* 通用 */
.q-content { font-size: var(--fs-body-lg); line-height: 1.8; }

.spinner-dot {
  display: inline-block; width: 8px; height: 8px;
  border: 2px solid var(--brand-300); border-top-color: var(--brand-600);
  border-radius: 50%; animation: spin var(--duration-loop-spin) linear infinite;
  vertical-align: middle; margin-right: 2px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ===== <1200px：左侧题号导航折叠为顶部横向滚动条（T4 窄屏形态），条内自滚动、不产生横向溢出 ===== */
@media (max-width: 1199px) {
  .sp-main { flex-direction: column; }
  .sp-nav {
    width: 100%; flex-direction: row; align-items: center;
    border-right: 0; border-bottom: 1px solid var(--border-subtle);
    overflow: hidden;
  }
  .sp-nav-title { display: none; }
  .sp-nav-list {
    flex: 1; min-width: 0;
    display: flex; align-items: center; gap: var(--space-3);
    overflow-x: auto; overflow-y: hidden;
    padding: var(--space-2) var(--space-3);
  }
  .n-section-head { margin: 0; flex: 0 0 auto; }
  .n-grid-wrap { flex: 0 0 auto; }
  .n-grid-wrap.collapsed { display: none; }
  .n-grid { flex-wrap: nowrap; padding: 0; }
  .sp-nav-footer { border-top: 0; border-left: 1px solid var(--border-subtle); }
}

/* ===== ≤768px：与 student/Layout.vue 的 ≤768 内距一致，保证负边距不产生横向溢出 ===== */
@media (max-width: 768px) {
  .sp-page {
    margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-3)) calc(-1 * var(--space-6));
  }
  .sp-content { padding: 0 var(--space-3) var(--space-4); }
  .sq-section { padding: var(--space-4); }
}
</style>
