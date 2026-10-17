<script setup>
/**
 * AssignmentDetail.vue —— 作业详情 · /m/student/assignments/:id
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #9、10-v1-implementation-contract.md §3/§6/§7
 * 设计参照：docs/mobile-app/preview/screens/student-assignment-detail.html（只读）
 * 数据：GET /student/assignments/:id（assignment + assignmentQuestions.question.subQuestions + submissions）。
 * 说明：手机端「题」的作答单位是小题（subQuestion）；作业详情按题组展示、按小题统计已答，避免把
 *       _count.assignmentQuestions（题）与 answeredCount（小题提交行）混成「4/6 题」。
 * v1 降级：不显示均分/排名；编程题不提供编辑器（去 Answer 页只读 + 复制链接）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileActionBar from '../../layout/MobileActionBar.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import MEmpty from '../../components/MEmpty.vue';
import MIcon from '../../components/MIcon.vue';
import MProgress from '../../components/MProgress.vue';
import MSkeleton from '../../components/MSkeleton.vue';
import MStatusTag from '../../components/MStatusTag.vue';
import request from '../../../api/request.js';
import {
  assignmentState, buildUnits, deadlineLabel, errorText, formatDateTime,
  formatRemaining, limitInfo, niceNumber, parseObjectiveAnswer, payload,
} from './studentPure.js';

const route = useRoute();
const router = useRouter();

const detail = ref(null);
const loading = ref(true);
const error = ref('');
const now = ref(Date.now());
let nowTimer = null;

const assignmentId = computed(() => route.params.id);

const built = computed(() => buildUnits(detail.value));
const assignment = computed(() => built.value.assignment);
const units = computed(() => built.value.units);
const byKey = computed(() => built.value.byKey);
const submissions = computed(() => built.value.submissions);
// 详情接口的 submissions 与 assignment 平级；合并后再推导状态（列表接口则内嵌 submissions）
const state = computed(() => assignmentState({ ...assignment.value, submissions: submissions.value }, now.value));

const totalUnits = computed(() => units.value.length);
const answeredCount = computed(() => units.value.filter(unitAnswered).length);
const limit = computed(() => limitInfo(assignment.value, submissions.value));

const deadlineText = computed(() => deadlineLabel(assignment.value.endTime, now.value));
const remainingText = computed(() => {
  if (!assignment.value || !assignment.value.endTime) return '';
  return formatRemaining(new Date(assignment.value.endTime).getTime() - now.value);
});

const maxScoreTotal = computed(() => {
  const questions = assignment.value.assignmentQuestions || [];
  if (!questions.length) return null;
  let sum = 0;
  let has = false;
  questions.forEach((aq) => {
    const score = Number(aq && aq.question ? aq.question.maxScore : NaN);
    if (Number.isFinite(score)) { sum += score; has = true; }
  });
  return has ? sum : null;
});

const attemptText = computed(() => {
  const max = assignment.value.maxAttempts;
  if (max != null) return '限 ' + max + ' 次提交';
  return assignment.value.allowResubmit ? '允许重复提交' : '提交后不可修改';
});

const answerPath = computed(() => '/m/student/assignments/' + assignmentId.value + '/answer');
const sheetPath = computed(() => answerPath.value + '?sheet=1');

const canOpenAnswer = computed(() => state.value.canEnter && state.value.key !== 'upcoming');
const position = computed(() => {
  if (state.value.key === 'active') return answeredCount.value > 0 ? '继续作答' : '开始作答';
  if (state.value.key === 'submitted') return '查看已提交';
  if (state.value.key === 'graded') return '查看成绩';
  if (state.value.key === 'upcoming') return '暂未开放';
  if (state.value.key === 'expired') return '已截止';
  if (state.value.key === 'locked') return '已锁定';
  return '开始作答';
});

function unitAnswered(unit) {
  const sub = byKey.value[unit.key];
  if (!sub) return false;
  if (unit.type === 'objective') {
    return parseObjectiveAnswer(sub.answer).some((entry) => String(entry && entry.answer ? entry.answer : '').trim() !== '');
  }
  if (unit.type === 'project') return !!sub.status && sub.status !== 'draft';
  const answer = String(sub.answer == null ? '' : sub.answer).trim();
  return answer !== '' || (!!sub.status && sub.status !== 'draft');
}

/** 题组（按作业里的每个 Question 聚合它下面的小题） */
const questionGroups = computed(() => {
  const questions = (assignment.value && assignment.value.assignmentQuestions) || [];
  return questions.map((aq, index) => {
    const q = aq && aq.question ? aq.question : null;
    const groupUnits = units.value.filter((u) => u.qIndex === index);
    const types = {};
    groupUnits.forEach((u) => { types[u.type] = true; });
    let typeLabel = '编程题';
    if (q && q.type === 'project') typeLabel = '实训题';
    else if (types.objective && types.code) typeLabel = '客观 + 编程';
    else if (types.objective) typeLabel = '客观题';
    const answered = groupUnits.filter(unitAnswered).length;
    const score = groupUnits.reduce((sum, u) => sum + (Number(u.score) || 0), 0);
    return {
      key: index,
      index,
      title: (q && q.title) || '第 ' + (index + 1) + ' 题',
      typeLabel,
      units: groupUnits,
      answered,
      total: groupUnits.length,
      score,
      firstUnitIndex: units.value.findIndex((u) => u.qIndex === index),
      unitIndexes: groupUnits.map((u) => units.value.indexOf(u)),
    };
  });
});

function openAnswer(params) {
  if (!canOpenAnswer.value) return;
  router.push(params || answerPath.value);
}
function openSheet() {
  if (!canOpenAnswer.value) return;
  router.push(sheetPath.value);
}
function goBottomPrimary() {
  if (state.value.key === 'graded') {
    router.push('/m/student/scores/' + assignmentId.value);
    return;
  }
  if (state.value.key === 'submitted') {
    router.push('/m/student/assignments/' + assignmentId.value + '/done');
    return;
  }
  if (state.value.key === 'active') openAnswer();
}
function jumpToQuestion(group) {
  if (!canOpenAnswer.value) return;
  if (group.firstUnitIndex < 0) return;
  router.push(answerPath.value + '?q=' + group.firstUnitIndex);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await request.get('/student/assignments/' + assignmentId.value, { silent: true });
    detail.value = payload(res) || null;
  } catch (err) {
    error.value = errorText(err);
    detail.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  nowTimer = setInterval(() => { now.value = Date.now(); }, 30000);
});
onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer);
});
</script>

<template>
  <MobileLayout bottom="actionbar">
    <MobileAppBar title="作业详情" back back-to="/m/student/assignments" />

    <main class="scroll">
      <div v-if="loading" class="page mt16">
        <MSkeleton variant="card" :count="3" />
      </div>

      <div v-else-if="error" class="page mt16">
        <MEmpty icon="alert" title="作业加载失败" :description="error">
          <button type="button" class="btn btn--secondary" @click="load">重新加载</button>
          <button type="button" class="btn btn--ghost" @click="router.push('/m/student/assignments')">返回作业列表</button>
        </MEmpty>
      </div>

      <template v-else>
        <div class="sd-head">
          <h2 class="sd-title">{{ assignment.title }}</h2>
          <div class="sd-tags">
            <MStatusTag :type="state.tone" dot>{{ state.text }}</MStatusTag>
            <MStatusTag v-if="assignment.maxAttempts" type="neutral">限 {{ assignment.maxAttempts }} 次</MStatusTag>
            <MStatusTag v-else-if="assignment.allowResubmit" type="accent">可重交</MStatusTag>
          </div>
        </div>

        <div class="page">
          <article class="card sd-deadline">
            <div class="sd-deadline-row">
              <span class="sd-deadline-icon" aria-hidden="true"><MIcon name="clock" /></span>
              <div class="sd-deadline-main">
                <div class="t">{{ deadlineText || '未设置截止时间' }}</div>
                <div class="s tnum">{{ state.key === 'active' ? '剩余 ' + remainingText + ' · 请及时提交' : (state.key === 'submitted' ? '已提交，等待老师评分' : (state.key === 'graded' ? '成绩已发布，可查看反馈' : '当前不可作答')) }}</div>
              </div>
              <MStatusTag v-if="state.key === 'active'" type="warning">已答 {{ answeredCount }} 项</MStatusTag>
            </div>
            <div class="sd-progress">
              <MProgress :value="answeredCount" :max="totalUnits || 1" size="sm" label="已答小题进度" />
              <span class="num tnum">{{ answeredCount }}/{{ totalUnits }} 小题</span>
            </div>
          </article>

          <article class="card sd-card mt12">
            <h3 class="card-title">作业信息</h3>
            <div class="sd-facts mt12">
              <div class="sd-fact"><div class="k">开放时间</div><div class="v">{{ formatDateTime(assignment.startTime) || '—' }}</div></div>
              <div class="sd-fact"><div class="k">截止时间</div><div class="v">{{ formatDateTime(assignment.endTime) || '—' }}</div></div>
              <div class="sd-fact"><div class="k">满分</div><div class="v">{{ maxScoreTotal == null ? '—' : niceNumber(maxScoreTotal) + ' 分' }}</div></div>
              <div class="sd-fact"><div class="k">题目</div><div class="v">{{ questionGroups.length }} 题 · {{ totalUnits }} 小题</div></div>
              <div class="sd-fact"><div class="k">提交次数</div><div class="v">{{ attemptText }}</div></div>
              <div class="sd-fact"><div class="k">已提交次数</div><div class="v">{{ limit.submittedAttempts }} 次</div></div>
            </div>
          </article>

          <div v-if="assignment.description" class="card sd-card mt12 sd-desc">
            <h3 class="card-title">作业说明</h3>
            <p class="sd-desc-text">{{ assignment.description }}</p>
          </div>

          <div class="banner banner--info sd-note" role="note">
            <MIcon name="info" />
            <div>
              <b>作答须知</b>：
              <template v-if="state.key === 'upcoming'">作业尚未开放，开放后即可作答。</template>
              <template v-else-if="state.key === 'expired'">已过截止时间，无法再提交，可查看已填写内容。</template>
              <template v-else-if="state.key === 'locked'">老师已锁定该作业，如有疑问请联系任课教师。</template>
              <template v-else-if="state.key === 'graded'">成绩已发布，可查看逐题反馈；作答记录只读。</template>
              <template v-else-if="state.key === 'submitted'">已提交，等待老师评分；评分发布后可在「成绩」查看反馈。</template>
              <template v-else>可提前交卷；交卷后不可修改。客观题在手机上完成，编程题请复制链接到电脑继续作答。</template>
            </div>
          </div>

          <div class="sec sd-sec">
            <h2>题目<span class="sec-note">共 {{ totalUnits }} 小题</span></h2>
            <button type="button" class="link" :disabled="!canOpenAnswer" @click="openSheet">
              答题卡<MIcon name="chevron-right" />
            </button>
          </div>

          <div class="list">
            <button
              v-for="group in questionGroups"
              :key="group.key"
              type="button"
              class="rowitem rowitem--tap sd-qrow"
              :class="{ 'sd-qrow--todo': group.answered < group.total }"
              :disabled="!canOpenAnswer"
              :aria-label="'第 ' + (group.index + 1) + ' 题 ' + group.title + '，' + group.typeLabel + '，已答 ' + group.answered + '/' + group.total + ' 小题'"
              @click="jumpToQuestion(group)"
            >
              <span class="sd-qnum" aria-hidden="true">{{ group.index + 1 }}</span>
              <span class="row-main">
                <span class="row-title">{{ group.title }}</span>
                <span class="row-sub">
                  {{ group.typeLabel }}
                  <span v-if="group.score"> · {{ niceNumber(group.score) }} 分</span>
                  <span v-if="group.total > 1"> · {{ group.answered }}/{{ group.total }} 小题已答</span>
                </span>
              </span>
              <span class="sd-qstate" :class="group.answered >= group.total ? 'sd-qstate--done' : 'sd-qstate--todo'">
                <MIcon :name="group.answered >= group.total ? 'check-circle' : 'alert'" />
                {{ group.total > 1 ? group.answered + '/' + group.total : (group.answered >= group.total ? '已答' : '未答') }}
              </span>
              <MIcon v-if="canOpenAnswer" name="chevron-right" class="chevron" />
            </button>
            <div v-if="!questionGroups.length" class="sd-listfoot">该作业暂未配置题目。</div>
            <div v-else class="sd-listfoot">客观题在手机上完成；编程题不提供手机编辑器，可复制链接到电脑继续作答。</div>
          </div>
        </div>
      </template>
    </main>

    <MobileActionBar v-if="!loading && !error">
      <button
        v-if="state.key === 'active'"
        type="button"
        class="btn btn--secondary"
        :disabled="!totalUnits"
        @click="openSheet"
      >
        答题卡
      </button>
      <button
        v-if="state.key === 'active'"
        type="button"
        class="btn btn--primary"
        :disabled="!totalUnits"
        @click="openAnswer()"
      >
        {{ position }}
      </button>
      <button
        v-else-if="state.key === 'submitted'"
        type="button"
        class="btn btn--secondary"
        @click="openAnswer()"
      >
        查看作答
      </button>
      <button v-if="state.key === 'submitted'" type="button" class="btn btn--primary" @click="goBottomPrimary">
        查看已提交
      </button>
      <button v-else-if="state.key === 'graded'" type="button" class="btn btn--secondary" @click="openAnswer()">
        查看作答
      </button>
      <button v-if="state.key === 'graded'" type="button" class="btn btn--primary" @click="goBottomPrimary">
        查看成绩
      </button>
      <button
        v-if="state.key === 'upcoming' || state.key === 'expired' || state.key === 'locked'"
        type="button"
        class="btn btn--secondary"
        disabled
        aria-disabled="true"
      >
        {{ position }}
      </button>
      <button
        v-if="state.key === 'upcoming' || state.key === 'expired' || state.key === 'locked'"
        type="button"
        class="btn btn--primary"
        @click="router.push('/m/student/assignments')"
      >
        返回作业列表
      </button>
    </MobileActionBar>
  </MobileLayout>
</template>

<style scoped>
.sd-head { padding: 6px var(--m-gutter) 14px; }
.sd-title { font-size: 21px; line-height: 1.35; font-weight: var(--m-fw-bold); letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.sd-tags { display: flex; align-items: center; flex-wrap: wrap; margin-top: 10px; }
.sd-tags .tag + .tag { margin-left: 8px; }
.sd-card + .sd-card { margin-top: 12px; }
.sd-deadline { position: relative; overflow: hidden; padding-left: 18px; }
.sd-deadline::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--status-warning-fg); }
.sd-deadline-row { display: flex; align-items: center; }
.sd-deadline-icon { width: 38px; height: 38px; border-radius: 11px; background: var(--status-warning-bg); color: var(--status-warning-fg); display: flex; align-items: center; justify-content: center; flex: none; }
.sd-deadline-icon .icon { width: 20px; height: 20px; }
.sd-deadline-main { flex: 1; min-width: 0; margin-left: 12px; }
.sd-deadline-main .t { font-size: 15px; font-weight: var(--m-fw-semibold); }
.sd-deadline-main .s { margin-top: 2px; font-size: 12.5px; color: var(--status-warning-fg); font-weight: var(--m-fw-medium); }
.sd-progress { display: flex; align-items: center; margin-top: 12px; }
.sd-progress .bar { flex: 1; }
.sd-progress .num { margin-left: 10px; font-size: 12px; color: var(--text-secondary); font-weight: var(--m-fw-medium); font-variant-numeric: tabular-nums; }
.sd-facts { display: grid; grid-template-columns: repeat(2, 1fr); grid-gap: 0 12px; gap: 0 12px; }
.sd-fact { padding: 10px 0; border-top: 1px solid var(--border-subtle); }
.sd-fact:nth-child(1), .sd-fact:nth-child(2) { border-top: 0; padding-top: 2px; }
.sd-fact .k { font-size: 12px; color: var(--text-tertiary); }
.sd-fact .v { margin-top: 3px; font-size: 14px; font-weight: var(--m-fw-semibold); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-desc-text { margin-top: 8px; font-size: 14px; line-height: 1.65; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; }
.sd-note { margin-top: 12px; }
.sd-sec { margin-top: 22px; }
.sd-sec .link[disabled] { opacity: 0.45; }
.sd-qrow .row-main { display: flex; flex-direction: column; }
.sd-qnum { width: 30px; height: 30px; border-radius: 9px; background: var(--bg-sunken); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; flex: none; font-size: 13.5px; font-weight: var(--m-fw-semibold); margin-right: 12px; font-variant-numeric: tabular-nums; }
.sd-qrow--todo .sd-qnum { background: var(--status-warning-bg); color: var(--status-warning-fg); }
.sd-qstate { display: inline-flex; align-items: center; font-size: 12px; color: var(--text-tertiary); flex: none; margin-left: 8px; }
.sd-qstate .icon { width: 14px; height: 14px; margin-right: 3px; }
.sd-qstate--done { color: var(--status-success-fg); }
.sd-qstate--todo { color: var(--status-warning-fg); }
.sd-listfoot { padding: 12px var(--m-card-pad); font-size: 12px; line-height: 1.55; color: var(--text-tertiary); background: var(--bg-surface-2); border-top: 1px solid var(--border-subtle); }
</style>
