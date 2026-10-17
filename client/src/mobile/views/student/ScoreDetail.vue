<script setup>
/**
 * ScoreDetail.vue —— 成绩详情 · /m/student/scores/:assignmentId
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #16、10-v1-implementation-contract.md §3/§6/§7
 * 设计参照：docs/mobile-app/preview/screens/student-score-detail.html（只读）
 * 数据：GET /student/scores（仅 published 的汇总行：totalScore/maxScore/subItems[].title/score/feedback）。
 * v1 降级：不显示分数构成、班级均分/最高/排名、等级字母、逐题满分分母（D1/D2）；未发布不显示分数。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import MEmpty from '../../components/MEmpty.vue';
import MIcon from '../../components/MIcon.vue';
import MSkeleton from '../../components/MSkeleton.vue';
import MStatusTag from '../../components/MStatusTag.vue';
import request from '../../../api/request.js';
import { errorText, niceNumber, payload, scorePercent } from './studentPure.js';

const route = useRoute();
const router = useRouter();

const rows = ref([]);
const loading = ref(true);
const error = ref('');
const expanded = reactive({});

const assignmentId = computed(() => String(route.params.assignmentId || ''));
const row = computed(() => rows.value.find((item) => String(item.assignmentId) === assignmentId.value) || null);
const items = computed(() => (row.value && Array.isArray(row.value.subItems) ? row.value.subItems : []));
const totalScore = computed(() => (row.value ? row.value.totalScore : null));
const maxScore = computed(() => (row.value && row.value.maxScore != null ? row.value.maxScore : null));
const percent = computed(() => scorePercent(totalScore.value, maxScore.value));
const scoreTone = computed(() => {
  const p = percent.value;
  if (p == null) return 'si-num--plain';
  if (p >= 90) return 'si-num--excellent';
  if (p >= 60) return 'si-num--good';
  return 'si-num--pass';
});
const attemptText = computed(() => {
  const count = Number(row.value && row.value.attemptCount);
  return count > 0 ? '提交 ' + count + ' 次' : '';
});

function toggleFeedback(index) {
  expanded[index] = !expanded[index];
}
function isLongFeedback(text) {
  return String(text || '').length > 80;
}
function goScores() {
  router.push('/m/student/scores');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await request.get('/student/scores', { silent: true });
    rows.value = payload(res) || [];
  } catch (err) {
    error.value = errorText(err);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <MobileLayout bottom="none">
    <MobileAppBar title="成绩详情" back back-to="/m/student/scores" />

    <main class="scroll">
      <div v-if="loading" class="page mt16">
        <MSkeleton variant="card" :count="3" />
      </div>

      <div v-else-if="error" class="page mt16">
        <MEmpty icon="alert" title="成绩加载失败" :description="error">
          <button type="button" class="btn btn--secondary" @click="load">重新加载</button>
          <button type="button" class="btn btn--ghost" @click="goScores">返回成绩列表</button>
        </MEmpty>
      </div>

      <div v-else-if="!row" class="page mt16">
        <MEmpty icon="scores" title="该成绩尚未发布" description="只有老师发布后的成绩才会显示分数与评语。">
          <button type="button" class="btn btn--primary" @click="goScores">返回成绩列表</button>
        </MEmpty>
      </div>

      <template v-else>
        <div class="si-head">
          <h2>{{ row.assignmentTitle }}</h2>
          <p>
            成绩已发布
            <span v-if="attemptText"> · {{ attemptText }}</span>
            <span v-if="maxScore != null"> · 满分 {{ niceNumber(maxScore) }}</span>
          </p>
        </div>

        <div class="page">
          <article class="card si-hero">
            <div class="si-scoreline">
              <div class="si-num tnum" :class="scoreTone">
                {{ totalScore == null ? '—' : niceNumber(totalScore) }}
                <span v-if="maxScore != null" class="si-den">/ {{ niceNumber(maxScore) }}</span>
              </div>
              <MStatusTag type="success" size="lg">已发布</MStatusTag>
            </div>
            <div class="si-total">
              <span class="si-comp-k">总分</span>
              <span class="v tnum">{{ totalScore == null ? '—' : niceNumber(totalScore) }}<template v-if="maxScore != null"> / {{ niceNumber(maxScore) }}</template></span>
            </div>
          </article>
        </div>

        <div class="sec">
          <h2>逐题得分</h2>
          <span class="sec-note">{{ items.length }} 项</span>
        </div>

        <div class="page">
          <div v-if="items.length" class="list">
            <div v-for="(item, index) in items" :key="index" class="si-q">
              <div class="rowitem si-q-row">
                <span class="si-qnum" aria-hidden="true">{{ index + 1 }}</span>
                <span class="row-main">
                  <span class="row-title">{{ item.title || '第 ' + (index + 1) + ' 题' }}</span>
                  <span class="row-sub">{{ item.score == null ? '暂无得分' : '本题得分' }}</span>
                </span>
                <span class="si-qscore tnum" :class="{ 'si-qscore--empty': item.score == null }">
                  {{ item.score == null ? '—' : niceNumber(item.score) }}
                </span>
              </div>
              <div v-if="item.feedback" class="si-fb">
                <p class="si-fb-text" :class="{ 'si-fb-text--clamp': !expanded[index] && isLongFeedback(item.feedback) }">{{ item.feedback }}</p>
                <button
                  v-if="isLongFeedback(item.feedback)"
                  type="button"
                  class="si-fb-toggle"
                  :aria-expanded="expanded[index] ? 'true' : 'false'"
                  @click="toggleFeedback(index)"
                >
                  {{ expanded[index] ? '收起评语' : '展开完整评语' }}
                </button>
              </div>
            </div>
          </div>
          <div v-else class="banner banner--neutral" role="status">
            <MIcon name="info" />
            <div>本次成绩暂无逐题明细。</div>
          </div>
        </div>

        <div class="page si-foot">
          <button type="button" class="btn btn--secondary btn--block" @click="goScores">
            <MIcon name="back" />返回成绩列表
          </button>
          <p class="si-foot-note">成绩由教师评分并发布后显示；如对成绩有疑问，请联系任课教师。</p>
        </div>
      </template>
    </main>
  </MobileLayout>
</template>

<style scoped>
.si-head { padding: 4px var(--m-gutter) 14px; }
.si-head h2 { font-size: 21px; line-height: 1.35; font-weight: var(--m-fw-bold); letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.si-head p { margin-top: 6px; font-size: var(--m-fs-body-sm); color: var(--text-secondary); }
.si-hero { background: var(--status-success-bg); border-color: var(--status-success-bd); }
.si-scoreline { display: flex; align-items: flex-end; justify-content: space-between; }
.si-num { font-size: 48px; line-height: 0.92; font-weight: var(--m-fw-bold); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.si-num--excellent { color: var(--score-excellent); }
.si-num--good { color: var(--score-good); }
.si-num--pass { color: var(--score-pass); }
.si-den { font-size: 14px; font-weight: var(--m-fw-medium); color: var(--text-secondary); margin-left: 5px; letter-spacing: 0; }
.si-total { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--status-success-bd); font-size: 13.5px; }
.si-comp-k { color: var(--text-secondary); }
.si-total .v { font-size: 17px; font-weight: var(--m-fw-bold); color: var(--text-primary); font-variant-numeric: tabular-nums; }
.si-q + .si-q { border-top: 1px solid var(--border-subtle); }
.si-q-row { width: 100%; }
.si-qnum { width: 28px; height: 28px; border-radius: 9px; background: var(--bg-sunken); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; flex: none; font-size: 13px; font-weight: var(--m-fw-semibold); margin-right: 12px; font-variant-numeric: tabular-nums; }
.si-q-row .row-main { display: flex; flex-direction: column; }
.si-qscore { font-size: 18px; font-weight: var(--m-fw-bold); font-variant-numeric: tabular-nums; flex: none; margin-left: 10px; color: var(--score-good); }
.si-qscore--empty { color: var(--text-tertiary); font-weight: var(--m-fw-medium); }
.si-fb { padding: 0 16px 12px 56px; }
.si-fb-text { max-height: 60em; overflow: hidden; font-size: 13px; line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; transition: max-height .22s var(--m-ease-out); }
.si-fb-text--clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-height: 3.2em; }
.si-fb-toggle { display: inline-flex; align-items: center; min-height: var(--m-touch-min); font-size: 12px; color: var(--text-link); }
@media (prefers-reduced-motion: reduce) { .si-fb-text { transition: none; } }
.si-foot { margin-top: 18px; }
.si-foot .btn .icon { margin-right: 4px; }
.si-foot-note { margin-top: 8px; text-align: center; font-size: 11.5px; line-height: 1.6; color: var(--text-tertiary); }
</style>
