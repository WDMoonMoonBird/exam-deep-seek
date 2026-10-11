<template>
  <div class="checker-wizard">
    <a-steps :current="stepIndex" size="small" class="cw-steps">
      <a-step title="生成与校准" />
      <a-step title="确认规则" />
      <a-step title="完成" />
    </a-steps>

    <div class="cw-body">
      <!-- Step 1 开始：材料已自动带入，项目类型自动检测，无任何选择 -->
      <div v-if="step === 1">
        <div class="cw-desc">
          系统已自动带入：评分标准、满分（{{ maxScore }}）、标准工程包；
          并已识别项目类型 <b>{{ detectedLang }}</b>，将自动套用对应规则骨架生成评分规则。
          全流程约 1-3 分钟，可关闭弹窗稍后查看。
        </div>
        <a-alert type="info" show-icon class="cw-alert"
          message="无需选择项目类型"
          description="系统从标准工程包自动检测语言 / 框架（Vue、Java、Python…）并按该类型生成规则；任何工程项目类型都适用，无需教师操作。" />
      </div>

      <!-- Step 2 生成与校准（完成后常驻，直到教师手动前进） -->
      <div v-else-if="step === 2">
        <a-alert
          v-if="pendingResult && status === 'ready'"
          type="success" show-icon class="cw-alert"
          message="规则生成完成（校准满分通过）" description="已自动就绪，点击右下角「查看结果」进入完成页。" />
        <a-alert
          v-else-if="pendingResult && status === 'review'"
          type="warning" show-icon class="cw-alert"
          message="规则生成完成（校准达标，含失分项待处理）"
          description="下方为标准包检查报告，点击右下角「进入确认规则」逐项处理失分项。" />
        <GenerateProgress
          :status="status" :logs="logs" :report="report" :error="error"
          :hide-report="pendingResult && status === 'review'"
        />
        <!-- review 完成态：报告可直接操作（转主观/豁免/接受失分），无需先进确认步 -->
        <HealthReportTable
          v-if="pendingResult && status === 'review'"
          :report="report"
          :threshold="report.threshold"
          actionable
          style="margin-top:12px;"
          @action="handleReportAction"
        />
      </div>

      <!-- Step 3 确认规则 -->
      <div v-else-if="step === 3">
        <a-alert
          v-if="pendingCount"
          type="warning"
          show-icon
          class="cw-alert"
          :message="`还有 ${pendingCount} 项失分待处理（转主观 / 豁免 / 接受），处理完即可启用`"
        />
        <RuleSummaryCard :rules="rules" />
        <HealthReportTable
          :report="report"
          :threshold="report.threshold"
          actionable
          style="margin-top:12px;"
          @action="handleReportAction"
        />
      </div>

      <!-- Step 4 完成 -->
      <div v-else-if="step === 4">
        <a-alert type="success" show-icon class="cw-alert"
          message="规则已启用" :description="`规则版本 ${activeVersionLabel} 将用于评分（影响 ${impactCount} 名学生）。可随时回滚到历史版本。`" />
        <div v-if="logs.length" class="cw-calib-log">
          <div class="cw-calib-title">校准记录（本次生成）</div>
          <div v-for="(log, i) in logs" :key="i" class="cw-calib-item">
            第 {{ log.round }} 轮
            <b :class="(log.totalScore ?? log.score) === null || (log.totalScore ?? log.score) === undefined ? '' : (log.totalScore ?? log.score) >= 90 ? 'cw-ok' : 'cw-warn'">
              得分 {{ log.totalScore ?? log.score ?? '—' }}/{{ report.max_score || maxScore }}
            </b>
            <span v-if="log.detail" class="cw-calib-detail">{{ log.detail }}</span>
          </div>
        </div>
        <div class="cw-version-row">
          <label for="cw-rollback-version" class="visually-hidden">历史版本</label>
          <span class="cw-vlabel">历史版本：</span>
          <a-select id="cw-rollback-version" v-model:value="rollbackTarget" style="width: 420px" size="small" placeholder="选择要回滚的版本">
            <a-select-option v-for="v in versions" :key="v.id" :value="v.id">
              {{ v.version }}（{{ v.status === 'active' ? '当前启用' : v.status === 'draft' ? '草稿' : '已归档' }}）{{ v.reason }} · {{ v.createdAt }}
            </a-select-option>
          </a-select>
          <a-popconfirm title="回滚到该版本？" description="将切换启用版本并重新影响后续评分" ok-text="回滚" cancel-text="取消"
            :disabled="!rollbackTarget" @confirm="handleRollback">
            <a-button size="small" :disabled="!rollbackTarget">回滚</a-button>
          </a-popconfirm>
        </div>
      </div>

      <!-- 高级模式：JSON 查看/编辑（仅进阶教师，Schema 校验兜底） -->
      <a-collapse v-if="step >= 3" v-model:activeKey="jsonOpen" ghost class="cw-json">
        <a-collapse-panel key="json" header="高级模式：查看 / 编辑规则 JSON（v2 Schema）">
          <div class="cw-json-bar">
            <span class="cw-json-tip">{{ jsonEditing ? '编辑后点击保存，将重新执行 Schema 校验' : '只读预览；修改需先切换为编辑' }}</span>
            <a-space>
              <a-button size="small" @click="toggleJsonEdit">{{ jsonEditing ? '取消编辑' : '编辑' }}</a-button>
              <a-button size="small" type="primary" v-if="jsonEditing" @click="saveJson">保存并校验</a-button>
            </a-space>
          </div>
          <CodeEditor v-model="jsonText" language="json" :read-only="!jsonEditing" :height="260" />
        </a-collapse-panel>
      </a-collapse>
    </div>

    <!-- 底部操作区 -->
    <div class="cw-footer">
      <!-- Step 1 -->
      <template v-if="step === 1">
        <span class="cw-hint">生成后将自动进入校准，无需任何人工干预</span>
        <a-popconfirm title="生成自动评分器？" description="约 1-3 分钟，期间可关闭弹窗稍后查看" ok-text="生成" cancel-text="取消" @confirm="handleGenerate">
          <a-button type="primary">生成自动评分器</a-button>
        </a-popconfirm>
      </template>

      <!-- Step 2 -->
      <template v-else-if="step === 2">
        <template v-if="pendingResult">
          <span class="cw-hint">{{ status === 'ready' ? '生成完成，可查看结果' : status === 'review' ? '生成完成，请处理失分项后确认启用' : '生成失败，可重试' }}</span>
          <a-space>
            <template v-if="status === 'failed'">
              <a-button @click="giveUp">放弃</a-button>
              <a-button type="primary" @click="handleGenerate">重试</a-button>
            </template>
            <a-button v-else type="primary" @click="pendingResult = false">
              {{ status === 'ready' ? '查看结果' : '进入确认规则' }}
            </a-button>
          </a-space>
        </template>
        <span v-else class="cw-hint">正在生成评分规则，请稍候…（可关闭弹窗，稍后回来查看）</span>
      </template>

      <!-- Step 3 -->
      <template v-else-if="step === 3">
        <span class="cw-hint" :class="{ warn: pendingCount }">{{ pendingCount ? '尚有失分项未处理' : '全部失分项已处理，可启用' }}</span>
        <a-space>
          <a-popconfirm title="重新生成评分器？" description="将重新执行多轮生成与校准，当前草稿保留为历史版本" ok-text="重新生成评分器" cancel-text="取消" @confirm="handleRegenerate">
            <a-button>重新生成评分器</a-button>
          </a-popconfirm>
          <a-button @click="giveUp">放弃</a-button>
          <a-button type="primary" :loading="confirming" @click="handleConfirm">确认启用</a-button>
        </a-space>
      </template>

      <!-- Step 3 完成（右下角「完成」由弹窗底部统一提供，避免重复按钮） -->
      <template v-else-if="step === 4">
        <span class="cw-hint">评分规则已启用，点击右下角「完成」关闭</span>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { message } from 'ant-design-vue';
import GenerateProgress from './GenerateProgress.vue';
import HealthReportTable from './HealthReportTable.vue';
import RuleSummaryCard from './RuleSummaryCard.vue';
import CodeEditor from '../CodeEditor.vue';
import {
  getCheckerStatus, generateChecker, confirmChecker, rollbackChecker,
  mockRules, mockHealthReport, mockVersions,
} from '../../api/checker.js';
import { detectProjectType } from '../../domain/projectType.js';

const props = defineProps({
  questionId: { type: [String, Number], required: true },
  maxScore: { type: Number, default: 100 },
  mock: { type: Boolean, default: true },      // 原型阶段：true 走本地模拟流程
  initialStatus: { type: String, default: 'none' }, // 演示用：可传 'review' / 'ready' 直达后续步骤
  projectTree: { type: Array, default: () => [] }, // 标准工程包文件树（真实检测项目类型，非写死）
});
const emit = defineEmits(['confirm', 'status-change']);

// ---- 状态 ----
const status = ref(props.initialStatus);
const step = computed(() => {
  if (pendingResult.value) return 2; // 生成完成但未手动前进 → 停留"生成与校准"
  if (status.value === 'review') return 3;
  if (status.value === 'ready') return 4;
  if (status.value === 'failed') return 2;
  if (status.value === 'generating' || status.value === 'calibrating') return 2;
  return 1; // none
});
// 步骤条索引：none/generating/calibrating/failed → 0，review → 1，ready → 2
const stepIndex = computed(() => (step.value === 1 || step.value === 2) ? 0 : step.value - 2);

// 项目类型：从标准工程包文件树真实检测（projectType.js 路径启发式），教师无需选择
const detectedLang = computed(() => {
  const r = detectProjectType(props.projectTree);
  return r.paths ? r.label + '（自动检测）' : r.label;
});
const logs = ref([]);
const report = ref({ score: 0, max_score: props.maxScore, threshold: 90, items: [] });
const rules = ref(null);
const versions = ref([]);
const rollbackTarget = ref(null);
const activeVersion = ref(null);
const error = ref('');
const confirming = ref(false);
const jsonOpen = ref([]);
const jsonEditing = ref(false);
const jsonText = ref('');

const timers = [];
// 用户体验（2026-08-18）：生成完成后 Step2 一直停留，直到教师手动点击前进
const pendingResult = ref(false);

const pendingCount = computed(() => (report.value.items || []).filter(i => i.status === 'pending' || i.status === 'miss').length);
const activeVersionLabel = computed(() => {
  const v = versions.value.find(x => x.id === activeVersion.value) || versions.value[0];
  return v ? v.version : '—';
});
const impactCount = 59; // 原型固定值：题目 353 全班人数

function later(fn, ms) {
  const t = setTimeout(fn, ms);
  timers.push(t);
  return t;
}
function clearTimers() {
  while (timers.length) clearTimeout(timers.pop());
}

function setStatus(s) {
  status.value = s;
  emit('status-change', s);
}

function nextVersions() {
  if (!versions.value.length) return mockVersions();
  const maxId = Math.max(...versions.value.map(v => v.id));
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  return [{
    id: maxId + 1,
    version: 'v' + (maxId + 1),
    status: 'draft',
    schemaVersion: 2,
    reason: '多轮生成取最优（重构方案 §4.2）',
    createdAt: now,
  }, ...versions.value];
}

// ---- 生成 + 校准（mock：完整模拟 none→generating→calibrating→review）----
function handleGenerate() {
  clearTimers();
  logs.value = [];
  error.value = '';
  pendingResult.value = false;
  setStatus('generating');
  report.value = { score: 0, max_score: props.maxScore, threshold: 90, items: [] };

  if (props.mock) {
    later(() => { logs.value.push({ round: 1, score: null, feedback: '生成规则 JSON…' }); }, 700);
    later(() => { setStatus('calibrating'); logs.value.push({ round: 1, score: 92, feedback: '标准包首轮校准' }); }, 1600);
    later(() => { logs.value.push({ round: 2, score: 94, feedback: '命中 2 条已知缺陷，自动豁免' }); }, 2800);
    later(() => { logs.value.push({ round: 3, score: 94, feedback: '缺陷豁免后达到就绪阈值' }); }, 3800);
    later(() => {
      // 校准完成 → review 态（锁定 Step2，等待教师手动前进）
      report.value = mockHealthReport();
      report.value.max_score = props.maxScore;
      rules.value = mockRules();
      rules.value.max_score = props.maxScore;
      versions.value = nextVersions();
      activeVersion.value = versions.value[0].id;
      jsonText.value = JSON.stringify(rules.value, null, 2);
      setStatus('review');
      pendingResult.value = true;
      message.success('校准完成：94/' + props.maxScore + '，请点击进入确认规则');
    }, 5000);
    return;
  }

  // 真实后端：不传模板，服务端按标准包自动检测项目类型并套用规则骨架
  (async () => {
    try {
      await generateChecker(props.questionId);
      setStatus('generating');
      pollReal();
    } catch (e) {
      error.value = e.response?.data?.message || e.message;
      setStatus('failed');
    }
  })();
}

/** 真实模式：把 GET /checker 返回的完整状态应用到本地（status/script/meta） */
function applyState(d) {
  if (!d) return;
  const meta = d.meta || {};
  setStatus(d.status || 'none');
  error.value = meta.error || '';
  logs.value = Array.isArray(meta.log) ? meta.log : [];
  if (d.status === 'review' || d.status === 'ready') {
    let parsed = null;
    try { parsed = d.script ? JSON.parse(d.script) : null; } catch { parsed = null; }
    rules.value = meta.rules || parsed || rules.value;
    report.value = meta.report || { score: 0, max_score: props.maxScore, threshold: 90, items: [] };
    versions.value = Array.isArray(meta.versions) ? meta.versions : [];
    activeVersion.value = meta.activeVersionId ?? null;
    jsonText.value = d.script || '';
  }
}

/** 真实模式：拉取一次完整状态（页面加载 / 轮询共用） */
async function refreshState() {
  const r = await getCheckerStatus(props.questionId);
  applyState(r.data || {});
  return r.data || {};
}

function stopPollTimer(timer) {
  clearInterval(timer);
  const idx = timers.indexOf(timer);
  if (idx >= 0) timers.splice(idx, 1);
}

function pollReal() {
  const timer = setInterval(async () => {
    try {
      const r = await getCheckerStatus(props.questionId);
      const d = r.data || {};
      const st = d.status || 'none';
      const isFinal = ['review', 'ready', 'failed'].includes(st);
      const fromActive = ['generating', 'calibrating'].includes(status.value);
      if (isFinal && fromActive) {
        // 生成完成：应用完整数据，但锁定 Step2 等待教师手动前进
        await applyState(d);
        pendingResult.value = true;
        stopPollTimer(timer);
        return;
      }
      await applyState(d);
      if (isFinal) stopPollTimer(timer);
    } catch (e) {
      stopPollTimer(timer);
      error.value = e.message;
      setStatus('failed');
      pendingResult.value = true;
    }
  }, 1000);
  timers.push(timer);
}

// ---- Step3 体检报告操作（转主观/豁免/接受失分）----
async function handleReportAction(record, action) {
  const item = report.value.items.find(i => i.id === record.id);
  if (!item) return;
  if (props.mock) {
    if (action === 'to_subjective') {
      item.status = 'accept';
      item.note = '已转为主观分项（由 LLM 温度 0 单次评分）';
      if (rules.value) rules.value.subjective_items.push({ id: 's' + (rules.value.subjective_items.length + 1), item: item.ruleLabel, max_score: item.deduction, reason: '教师确认转主观' });
      message.success('已转主观：' + item.ruleLabel);
    } else if (action === 'exempt') {
      item.status = 'exempt';
      item.note = '教师豁免（不计入失分）';
      message.success('已豁免：' + item.ruleLabel);
    } else if (action === 'accept') {
      item.status = 'accept';
      item.note = '接受失分（- ' + item.deduction + '）';
      message.success('已接受失分');
    }
    return;
  }
  // 真实链路：确认 API 落库（转主观会由服务端迁移规则项并重写 checker_script）
  try {
    const r = await confirmChecker(props.questionId, { action, itemIds: [record.id] });
    const d = r.data || {};
    if (d.error) { message.error(d.error); return; }
    applyState(d);
    message.success('已处理：' + item.ruleLabel);
  } catch (e) {
    message.error('处理失败：' + (e.response?.data?.message || e.message));
  }
}

// ---- Step3 确认启用 ----
async function handleConfirm() {
  confirming.value = true;
  try {
    if (props.mock) {
      await new Promise(res => setTimeout(res, 600));
      versions.value[0].status = 'active';
      activeVersion.value = versions.value[0].id;
      setStatus('ready');
      message.success('规则已启用（版本 ' + activeVersionLabel.value + '）');
    } else {
      const r = await confirmChecker(props.questionId, { action: 'confirm' });
      applyState(r.data || {});
      message.success('规则已启用（版本 ' + activeVersionLabel.value + '）');
    }
  } finally {
    confirming.value = false;
  }
}

function handleRegenerate() {
  const v = versions.value[0];
  if (v) v.status = 'archived';
  handleGenerate();
}

// ---- Step4 回滚 ----
async function handleRollback() {
  if (props.mock) {
    activeVersion.value = rollbackTarget.value;
    message.success('已回滚到 ' + activeVersionLabel.value);
    return;
  }
  const r = await rollbackChecker(props.questionId, rollbackTarget.value);
  applyState(r.data || {});
  message.success('已回滚到 ' + activeVersionLabel.value);
}

// ---- 高级模式 JSON ----
function toggleJsonEdit() { jsonEditing.value = !jsonEditing.value; }
async function saveJson() {
  let parsed;
  try {
    parsed = JSON.parse(jsonText.value);
    if (!parsed.objective_items || !Array.isArray(parsed.objective_items)) throw new Error('缺少 objective_items');
  } catch (e) {
    message.error('JSON 非法：' + e.message);
    return;
  }
  if (props.mock) {
    rules.value = parsed;
    message.success('Schema v2 校验通过，已更新规则草稿');
    jsonEditing.value = false;
    return;
  }
  try {
    const r = await confirmChecker(props.questionId, { action: 'update_rules', rules: parsed });
    const d = r.data || {};
    if (d.error) { message.error('校验失败：' + d.error); return; }
    applyState(d);
    message.success('Schema 校验通过，已保存规则草稿');
    jsonEditing.value = false;
  } catch (e) {
    message.error('保存失败：' + (e.response?.data?.message || e.message));
  }
}

function giveUp() {
  clearTimers();
  if (props.mock) {
    setStatus('none');
    message.info('已放弃本次生成');
  } else {
    setStatus('none');
    message.info('已关闭本次生成（若已在生成中，后端将继续完成，可稍后查看）');
  }
}

onMounted(async () => {
  if (props.mock) {
    if (props.initialStatus === 'review') {
      report.value = mockHealthReport();
      report.value.max_score = props.maxScore;
      rules.value = mockRules();
      rules.value.max_score = props.maxScore;
      versions.value = mockVersions();
      activeVersion.value = versions.value[0].id;
      jsonText.value = JSON.stringify(rules.value, null, 2);
    } else if (props.initialStatus === 'ready') {
      report.value = mockHealthReport();
      report.value.max_score = props.maxScore;
      rules.value = mockRules();
      rules.value.max_score = props.maxScore;
      versions.value = mockVersions();
      versions.value[0].status = 'active';
      activeVersion.value = versions.value[0].id;
      jsonText.value = JSON.stringify(rules.value, null, 2);
    }
  } else {
    try {
      const d = await refreshState();
      if (d.status === 'generating' || d.status === 'calibrating') pollReal();
    } catch { /* 后端未就绪 */ }
  }
});

onBeforeUnmount(clearTimers);
</script>

<style scoped>
.cw-steps { margin-bottom: 16px; }
.cw-body { min-height: 320px; }
.cw-desc { font-size: var(--fs-body-sm); color: var(--text-secondary); margin-bottom: 12px; }
.cw-alert { margin-bottom: 12px; }
.cw-version-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.cw-vlabel { font-size: var(--fs-body-sm); color: var(--text-secondary); }
.cw-json { margin-top: 14px; border-top: 1px dashed var(--border-default); padding-top: 6px; }
.cw-json-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cw-json-tip { font-size: var(--fs-caption); color: var(--text-tertiary); }
.cw-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-subtle);
}
.cw-hint { font-size: var(--fs-caption); color: var(--text-tertiary); }
.cw-hint.warn { color: var(--status-warning-fg); }
.cw-calib-log { margin-top: 12px; border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 10px 12px; background: var(--bg-sunken); }
.cw-calib-title { font-size: var(--fs-caption); font-weight: var(--fw-semibold); color: var(--text-secondary); margin-bottom: 6px; }
.cw-calib-item { font-size: var(--fs-caption); padding: 2px 0; color: var(--text-secondary); }
.cw-calib-detail { color: var(--text-secondary); margin-left: 8px; }
.cw-ok { color: var(--status-success-fg); }
.cw-warn { color: var(--status-warning-fg); }
</style>
