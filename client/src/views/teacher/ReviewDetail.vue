<template>
  <div class="rp-page wb-shell" v-if="data" :class="{ 'wb-drawer-open': panelOpen }">
    <!-- 顶栏：返回条 + 对象名 + 状态徽标（Workbench 壳） -->
    <div class="rp-top wb-top">
      <!-- ★R2-B47（U-1）：返回落点确定性（有站内历史且落在复审流内才 back()，否则显式回复审列表） -->
      <a-button type="link" size="small" @click="goBack">
        ← 返回
      </a-button>
      <!-- B3-1 ⑤：标题层级与 Layout 的 h1 衔接（h1 → h2 → 页内 h3）：由 h3 提升为 h2，避免 axe heading-order；
         该类的字号/字重/margin 均已在 CSS 显式声明，标签变化不产生任何视觉差异。 -->
      <h2 class="rp-title">{{ q.title }}</h2>
      <!-- ★R3-D9（t17 / F-C4-2）：不再按作业模式挂「练习模式」标签（mode 不驱动任何展示/行为） -->
      <span class="rp-student">{{ studentName }} / {{ displayStudentNo }}</span>
      <StatusTag tone="neutral" :text="'总分 ' + q.maxScore + ' 分'" />
      <StatusTag v-if="totalAiScore > 0" tone="brand" :text="'AI 评分 ' + totalAiScore + ' / ' + q.maxScore" />
      <StatusTag :tone="pageStatus.tone" :text="pageStatus.text" dot />
    </div>

    <!-- 主体 -->
    <div class="rp-main wb-body">
      <!-- 左侧导航 -->
      <nav class="rp-nav wb-left">
        <div class="rp-nav-title">题目导航</div>
        <div class="rp-nav-list">
          <template v-for="(sq, i) in subQuestions" :key="sq.id">
            <div class="n-section-head" @click="toggleCollapse(sq.id)">
              <span class="n-section-arrow" :class="{ collapsed: collapsedSqs.has(sq.id) }">▾</span>
              <span class="n-section-label">{{ getNavLabel(sq, i) }}</span>
              <span class="n-section-count">{{ sq.type === 'objective' ? (sq.objectiveItems || []).length + '问' : '编程' }}</span>
            </div>

            <div v-if="sq.type === 'code' || !sq.type" class="n-grid-wrap" :class="{ collapsed: collapsedSqs.has(sq.id) }">
              <div class="n-grid">
                <div :class="sqBoxClass(sq.id, undefined, sqResultColor(sq))" @click="activateAnchor('sq-' + sq.id); scrollTo('sq-' + sq.id)">1</div>
              </div>
            </div>

            <div v-else class="n-grid-wrap" :class="{ collapsed: collapsedSqs.has(sq.id) }">
              <div class="n-grid">
                <div
                  v-for="item in sq.objectiveItems" :key="item.key"
                  :class="sqBoxClass(sq.id, item.key, itemResultColor(sq.id, item))"
                  :title="itemTypeLabel(item.type)"
                  @click="activateAnchor('sq-' + sq.id + '-item-' + item.key); scrollTo('sq-' + sq.id + '-item-' + item.key)"
                >{{ item.key + 1 }}</div>
              </div>
            </div>
          </template>
        </div>
        <div class="rp-nav-footer">
          <span v-if="totalAiScore > 0">AI 总分 {{ totalAiScore }} / {{ q.maxScore }}</span>
          <span v-else style="color:var(--text-tertiary);">未评分</span>
        </div>
      </nav>

      <!-- 右侧：流式阅卷区 -->
      <div class="rp-content wb-mid" ref="contentRef">
        <!-- 材料 -->
        <div v-if="materialText" class="rp-material-bar" @click="showMaterial = !showMaterial">
          <span>题目材料</span>
          <span class="material-arrow" :class="{ open: showMaterial }">▼</span>
        </div>
        <Transition name="collapse">
          <div v-if="showMaterial && materialText" class="rp-material-body">
            <div class="rp-material-inner q-content" v-html="safeMaterial" />
          </div>
        </Transition>

        <!-- 题目流 -->
        <div
          v-for="(sq, i) in subQuestions" :key="sq.id"
          :data-section="'sq-' + sq.id"
          :id="'sq-' + sq.id"
          class="sq-section"
        >
          <div class="sq-header">
            <span class="sq-num">第 {{ i + 1 }} 小题</span>
            <!-- T4-F2 类别收口：antd purple 预置色在暗色下 3.39:1 → 走全局语义类 .tag-accent（亮 5.60 / 暗 7.90） -->
            <a-tag v-if="sq.type === 'objective'" class="tag-accent" size="small">
              {{ getNavLabel(sq, i).replace('第' + (i + 1) + '小题 ', '') || '客观题' }}
            </a-tag>
            <a-tag v-else color="blue" size="small">编程题</a-tag>
            <span class="sq-score">{{ sq.score }} 分</span>
            <span class="sq-status-spacer"></span>
            <a-tag v-if="getSub(sq.id)" :color="subStatusColor(getSub(sq.id))" :class="subStatusTagClass(getSub(sq.id))">
              {{ subStatusText(getSub(sq.id)) }}
            </a-tag>
          </div>

          <div class="sq-stem q-content" v-html="safeSqContent(sq)" />

          <!-- 主观题：学生代码 + 参考答案 -->
          <template v-if="sq.type === 'code' || !sq.type">
            <div class="sq-answer-label">
              <span class="label-text">学生答案</span>
              <span style="font-size:var(--fs-caption);color:var(--text-tertiary);">{{ sq.language || 'cpp' }}</span>
              <a-button size="small" style="margin-left:8px;" @click="formatCode(sq.id)">格式化</a-button>
            </div>
            <div class="sq-editor-wrap">
              <CodeEditor
                :ref="(el) => setEditorRef(sq.id, el)"
                :modelValue="getSub(sq.id)?.answer || ''"
                :language="sq.language || 'cpp'"
                readOnly
                :height="220"
              />
            </div>
          </template>

          <!-- 客观题：小问列表 -->
          <div v-else class="oi-section">
            <div
              v-for="item in (sq.objectiveItems || [])" :key="item.key"
              :data-section="'sq-' + sq.id + '-item-' + item.key"
              :id="'sq-' + sq.id + '-item-' + item.key"
              class="oi-card"
              :class="{ 'oi-correct': isItemCorrect(sq.id, item), 'oi-wrong': !isItemCorrect(sq.id, item) && isItemAnswered(sq.id, item) }"
            >
              <div class="oi-head">
                <span class="oi-num">{{ item.key + 1 }}.</span>
                <a-tag :color="itemTypeColor(item.type)" :class="itemTypeTagClass(item.type)" size="small">{{ itemTypeLabel(item.type) }}</a-tag>
                <span v-if="item.score" class="oi-score">+{{ item.score }} 分</span>
                <span v-if="isItemAnswered(sq.id, item)" class="oi-judge" :class="{ correct: isItemCorrect(sq.id, item), wrong: !isItemCorrect(sq.id, item) }">
                  {{ isItemCorrect(sq.id, item) ? '✓ 正确' : '✗ 错误' }}
                </span>
                <span v-else class="oi-judge unanswered">（未作答）</span>
              </div>
              <div class="oi-stem" :class="{ 'oi-stem-code': isCodeStem(item.stem) }">{{ item.stem }}</div>

              <div class="oi-compare">
                <div class="oi-compare-row">
                  <span class="oi-compare-tag student">作答</span>
                  <span :class="{ 'oi-wrong-text': !isItemCorrect(sq.id, item) && isItemAnswered(sq.id, item) }">
                    {{ getItemStudentStr(sq.id, item) }}
                  </span>
                </div>
                <div class="oi-compare-row">
                  <span class="oi-compare-tag correct">答案</span>
                  <span>{{ getItemRefStr(item) }}</span>
                </div>
              </div>
            </div>

            <!-- 客观题得分摘要 -->
            <div v-if="getSub(sq.id)" class="sq-obj-score-bar">
              <span style="font-size:var(--fs-body-sm);color:var(--text-tertiary);">自动评分</span>
              <span class="sq-review-score">{{ getSub(sq.id)?.aiScore ?? '—' }} / {{ sq.score }} 分</span>
            </div>
          </div>
        </div>

        <!-- 底部审核 bar（★R3-D9：不再按作业模式隐藏 —— 历史「练习」作业同样要能保存审核/发布成绩） -->
        <div class="rp-submit-bar">
          <div class="rp-submit-info">
            <span>共 {{ subQuestions.length }} 题，AI 总分 {{ totalAiScore }} / {{ q.maxScore }}</span>
          </div>
          <a-button type="primary" size="large" :loading="reviewingAll" @click="reviewAll">保存审核</a-button>
          <a-button size="large" :loading="publishingAll" @click="publishAll">发布成绩</a-button>
        </div>
      </div>

      <!-- 右侧评分面板（Workbench 壳：≥1200px 常驻右栏；<1200px 抽屉化） -->
      <aside class="wb-right" :class="{ open: panelOpen, 'is-collapsed': collapsed }" aria-label="评分面板">
        <div class="wb-right-head">
          <span class="wb-right-title">评分面板</span>
          <button
            type="button"
            class="wb-collapse-btn"
            :aria-expanded="collapsed ? 'false' : 'true'"
            aria-controls="rp-score-panel"
            :aria-label="collapsed ? '展开评分面板' : '收起评分面板'"
            @mousedown.prevent
            @click="collapsed = !collapsed"
          >{{ collapsed ? '展开' : '收起' }}</button>
          <a-button v-if="narrow" type="link" size="small" @click="panelOpen = false">关闭</a-button>
        </div>
        <Transition name="wb-panel">
        <div v-show="!collapsed" id="rp-score-panel" class="wb-right-body">
          <template v-for="(sq, i) in subQuestions" :key="'pn-' + sq.id">
            <div v-if="(sq.type === 'code' || !sq.type) && getSub(sq.id)" class="wb-panel-section">
              <div class="wb-panel-head">第 {{ i + 1 }} 小题 · {{ sq.score }} 分</div>
              <div class="sq-review-box">
                <div class="sq-review-bar">
                  <span class="sq-review-label">AI 评分</span>
                  <span class="sq-review-score">{{ getSub(sq.id)?.aiScore ?? '—' }} / {{ sq.score }} 分</span>
                  <a-button size="small" :loading="regrading[sq.id]" @click="regrade(sq)">重新评分</a-button>
                  <a-button size="small" @click="showPrompt(sq)">提示词</a-button>
                  <a-button size="small" @click="useAiFeedback(sq.id)">使用 AI 评语</a-button>
                  <a-input-number
                    v-model:value="reviewScores[sq.id]"
                    :min="0" :max="sq.score"
                    size="small" class="wb-final-score"
                  />
                  <span class="wb-final-label">最终分</span>
                </div>
                <div class="sq-review-fb-row">
                  <div class="sq-review-fb-col">
                    <span class="sq-review-fb-label">AI 评语</span>
                    <div class="sq-review-fb-ai">
                      <template v-if="fbOf(sq.id).kind === 'checker'">
                        <!-- ★R2-B43：有总评 ⇒ 顶部醒目总评 + 一行依据 + 分项清单**默认折叠**；无总评 ⇒ 回落既有分项面板（不白屏） -->
                        <div v-if="fbOf(sq.id).summary" class="ai-sum-box">
                          <span class="ai-sum-tag">AI 总评</span>
                          <p class="ai-sum-text">{{ fbOf(sq.id).summary.text }}</p>
                          <p v-if="fbOf(sq.id).summary.truncated" class="muted ai-sum-note">（该总评因模型输出长度限制被截断，可重新生成）</p>
                        </div>
                        <div v-else class="ai-fb-summary">
                          AI 评分依据：本次 {{ fbOf(sq.id).scoreText }} / {{ fbOf(sq.id).maxText }} 分
                          ｜ {{ fbOf(sq.id).total }} 项中 {{ fbOf(sq.id).hits }} 项达标
                        </div>
                        <div class="ai-fb-basis">{{ fbOf(sq.id).basisText }}</div>
                        <a-collapse
                          ghost size="small" class="ai-fb-collapse"
                          :defaultActiveKey="fbOf(sq.id).summary ? [] : ['items']"
                        >
                          <a-collapse-panel key="items" :header="'分项清单（' + fbOf(sq.id).total + ' 项' + (fbOf(sq.id).summary ? '，点击展开' : '') + '）'">
                            <div class="ai-fb-list">
                              <div v-for="(row, ri) in fbOf(sq.id).rows" :key="ri" class="ai-fb-row">
                                <span class="ai-fb-mark" :title="row.status || ''">{{ row.ok === true ? '✅' : (row.ok === false ? '❌' : '•') }}</span>
                                <span class="ai-fb-title">{{ row.title || row.item || '（未命名分项）' }}</span>
                                <span class="ai-fb-score">{{ row.score ?? '—' }} / {{ row.maxScore ?? '—' }}</span>
                                <span class="ai-fb-comment" :class="{ 'is-evidence': /证据[:：]/.test(row.comment) }">{{ row.comment || '（无判据说明）' }}</span>
                              </div>
                            </div>
                          </a-collapse-panel>
                        </a-collapse>
                      </template>
                      <template v-else-if="fbOf(sq.id).kind === 'text'">{{ fbOf(sq.id).text }}</template>
                      <template v-else>暂无评语</template>
                    </div>
                  </div>
                  <div class="sq-review-fb-col">
                    <span class="sq-review-fb-label">教师评语</span>
                    <a-textarea
                      v-model:value="reviewFeedbacks[sq.id]"
                      size="small" placeholder="教师评语（选填）"
                      class="teacher-fb-textarea"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
        </Transition>
      </aside>

      <button v-if="narrow" type="button" class="wb-drawer-toggle" aria-controls="rp-score-panel" :aria-expanded="panelOpen ? 'true' : 'false'" @click="panelOpen = !panelOpen">
        {{ panelOpen ? '收起评分面板' : '评分面板' }}
      </button>
    </div>
  </div>

  <!-- AI 提示词（该次评分的实际提示词，含学生答案） -->
  <a-modal v-model:open="promptModalOpen" :title="'AI 提示词 — ' + (promptSubTitle || '')" :footer="null" :width="820">
    <a-spin :spinning="promptLoading">
      <template v-if="promptData">
        <div class="prompt-block">
          <div class="prompt-role-label">System（角色设定）</div>
          <pre class="prompt-pre">{{ promptData.system }}</pre>
          <div class="prompt-role-label">User（评分任务，含学生提交的答案）</div>
          <pre class="prompt-pre">{{ promptData.user }}</pre>
        </div>
      </template>
      <a-empty v-else-if="!promptLoading" description="暂无数据" :image="false" />
    </a-spin>
  </a-modal>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import CodeEditor from '../../components/CodeEditor.vue';
import StatusTag from '../../components/StatusTag.vue';
import { useReviewPage } from '../../composables/review/useReviewPage.js';
import { parseCheckerFeedback } from '../../composables/review/parseCheckerFeedback.js';

// 接线根唯一入口（方案 §2.1-b）：7 个单元在 setup 同步阶段无条件各调用一次，跨单元共享一律参数注入。
// 本文件不得出现任何响应式原语（ref / reactive / computed / watch）—— 出现即等于造第二个真值源。
const {
  data, pageStatus, studentName, displayStudentNo, q, subQuestions, showMaterial, getSub,
  reviewScores, reviewFeedbacks, regrading, reviewingAll, publishingAll,
  materialText, safeMaterial, totalAiScore,
  contentRef, collapsedSqs, toggleCollapse, getNavLabel, sqResultColor, sqBoxClass, scrollTo, activateAnchor,
  isItemAnswered, isItemCorrect, getItemStudentStr, getItemRefStr, itemResultColor,
  promptModalOpen, promptLoading, promptData, promptSubTitle, showPrompt,
  setEditorRef, formatCode, useAiFeedback, regrade, reviewAll, publishAll,
  narrow, panelOpen, collapsed, itemTypeLabel, itemTypeColor, itemTypeTagClass, safeSqContent, isCodeStem,
  subStatusColor, subStatusTagClass, subStatusText, onPageMounted, onPageUnmounted,
} = useReviewPage();

const router = useRouter();

/**
 * ★R2-B47（U-1）：返回落点确定性 + 兜底（无站内历史时裸 back() 会"什么都不做"⇒ 用户以为白屏）。
 * 注：本文件禁止响应式原语（ref/reactive/computed/watch）⇒ 这里只用普通函数与 router，不引入任何真值源。
 */
function goBack() {
  const back = router.options && router.options.history && router.options.history.state
    ? router.options.history.state.back : null;
  if (typeof back === 'string' && back.startsWith('/teacher/review')) router.back();
  else router.push('/teacher/review');
}

// ★R2-B41：AI 评分依据（纯函数 + 模块级缓存；本文件禁止响应式原语 ⇒ 不用 computed）
function fbOf(sqId) {
  return parseCheckerFeedback(getSub(sqId)?.aiFeedback);
}

onMounted(onPageMounted);
onUnmounted(onPageUnmounted);
</script>

<style scoped src="./review-detail.css"></style>
