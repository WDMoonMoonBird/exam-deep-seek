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
      <!-- R3-D1（US-B6）：第 k 次提交 / 剩余次数 / 上限态 / 当前计入分（全部开关驱动，不再有「练习」标签） -->
      <a-tag class="tag-success" size="small">{{ attemptTag }}</a-tag>
      <a-tag v-if="remainingTag" size="small">{{ remainingTag }}</a-tag>
      <a-tag v-if="limitReached" class="tag-warning" size="small">{{ limitNote }}</a-tag>
      <a-tag class="tag-warning">总分 {{ q.maxScore }} 分</a-tag>
      <a-tag v-if="totalScored > 0" class="tag-success">得分 {{ totalScored }} / {{ q.maxScore }}</a-tag>
      <a-tag v-if="scoreTag" color="blue">{{ scoreTag }}</a-tag>
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
            <a-tag v-if="sqHasScore(sq.id)" class="tag-success" size="small">
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

          <!-- 主观题参考答案：可见性开关放行时后端才下发（US-B2），前端只做展示 -->
          <div v-if="sq.referenceAnswer" class="sq-reference">
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
                <span v-if="itemAnswers[getItemKey(sq.id, item.key)]?.correct !== undefined" class="oi-judge" :class="{ correct: itemAnswers[getItemKey(sq.id, item.key)].correct, wrong: !itemAnswers[getItemKey(sq.id, item.key)].correct }">
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

              <!-- 正确答案：可见性开关放行时后端才下发（immediate=评分完成即可见 / after_publish=发布后） -->
              <div v-if="item.answer != null" class="oi-reference">
                正确答案：{{ formatItemAnswer(item) }}
              </div>
            </div>
          </template>

          <!-- 已评分但答案不可见时的说明（answerVisibility=after_publish） -->
          <div v-if="answerHintOf(sq)" class="sq-answer-hint" role="note">{{ answerHintOf(sq) }}</div>

          <!-- 评语（已出分时显示） -->
          <div v-if="subFeedbacks[sq.id]" class="sq-feedback">
            <div class="fb-label">评语</div>
            <div class="fb-body">{{ subFeedbacks[sq.id] || '暂无反馈' }}</div>
          </div>
        </div>

        <!-- 底部提交栏（R3-D1：练习模式壳移除，改由三开关驱动 —— 重交 / 次数上限 / 答案可见性） -->
        <div class="sp-submit-bar" v-if="limitReached">
          <span class="limit-note" role="alert">⚠ {{ limitNote }}，如需增加次数请联系老师</span>
        </div>
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
  data, q, subQuestions, allowResubmit, showMaterial,
  submittingAll, langs,
  attemptTag, remainingTag, scoreTag, answerHintOf, limitNote,
  answers, itemAnswers, multiAnswerBind, subStatuses, subScores, subFeedbacks, editorLangs,
  contentRef, collapsedSqs, isActiveAnchor,
  onBoxKeydown, toggleCollapse, scrollTo, activateAnchor, sqBoxClass,
  editorMounted, editorRefs, setupEditorObserve, formatEditor,
  dirtyCount, draftNoticeText,
  isExpired, isSqReadonly, materialText, safeMaterial, safeSqContent,
  totalScored, unsubmittedCount, allSubmitted,
  submitDisabled, limitReached, submitAll,
  getNavLabel, sqHasScore, getSqResult, getItemResult, oiCardClass, onMultiBindChange,
  // —— onMounted / onUnmounted 的回调体由 useSubmitPage 提供，注册只发生在本文件、各一次 ——
  onPageMounted, disposePage,
} = useSubmitPage({ route, confirm });

onMounted(onPageMounted);
onUnmounted(disposePage);
</script>

<style scoped src="./submit-page.css"></style>
