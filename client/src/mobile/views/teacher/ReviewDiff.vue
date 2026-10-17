<script setup>
/**
 * 教师代码差异 —— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6、05-page-specs 屏 24、09 §4 降级口径。
 * 数据：GET /teacher/submissions/:id/project（standardFiles vs studentFiles 的 tree+contents）
 * 前端逐行 LCS 自研 diff（不引入依赖）；相同行折叠、只看差异开关、按块引用到评语。
 * 仅实训题有工程包；非实训题显示空态，不请求 project 接口。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MEmpty, MIcon, MSkeleton, MStatusTag } from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useMobileToast } from '../../composables/useMobileToast.js';

const MAX_LINES = 800;
const MAX_CHARS = 200000;
const route = useRoute();
const router = useRouter();
const toast = useMobileToast();
const submissionId = computed(() => Number(route.params.submissionId));
const assignmentId = computed(() => {
  const n = Number(route.query.assignmentId);
  return Number.isInteger(n) && n > 0 ? String(n) : '';
});
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherReviewDiff.vue', action: '加载代码差异' });

const submission = ref(null);
const loading = ref(false);
const loadError = ref('');
const project = ref(null);
const projectError = ref('');
const activeFile = ref('');
const onlyDiff = ref(true);

const isProject = computed(() => !!submission.value && submission.value.question && submission.value.question.type === 'project');
const backTo = computed(() => {
  const query = assignmentId.value ? '?assignmentId=' + assignmentId.value : '';
  return '/m/teacher/review/' + submissionId.value + '/code' + query;
});
const detailTo = computed(() => {
  const query = assignmentId.value ? { assignmentId: assignmentId.value } : {};
  return { path: '/m/teacher/review/' + submissionId.value, query };
});

function keysOf(contents) {
  if (!contents || typeof contents !== 'object') return [];
  return Object.keys(contents).filter((key) => typeof contents[key] === 'string').sort();
}

const studentContents = computed(() => (project.value && project.value.studentFiles && project.value.studentFiles.contents) || {});
const standardContents = computed(() => (project.value && project.value.standardFiles && project.value.standardFiles.contents) || {});
const allFiles = computed(() => {
  const merged = [];
  keysOf(studentContents.value).concat(keysOf(standardContents.value)).forEach((key) => {
    if (merged.indexOf(key) < 0) merged.push(key);
  });
  return merged;
});

function splitLines(text) {
  if (!text) return [];
  return String(text).split(/\r?\n/);
}

function buildOps(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  if (n > MAX_LINES || m > MAX_LINES) return null;
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (oldLines[i] === newLines[j]) {
        dp[i * width + j] = dp[(i + 1) * width + j + 1] + 1;
      } else {
        const down = dp[(i + 1) * width + j];
        const right = dp[i * width + j + 1];
        dp[i * width + j] = down >= right ? down : right;
      }
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'equal', oldNo: i + 1, newNo: j + 1, text: oldLines[i] });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      ops.push({ type: 'del', oldNo: i + 1, newNo: null, text: oldLines[i] });
      i += 1;
    } else {
      ops.push({ type: 'add', oldNo: null, newNo: j + 1, text: newLines[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: 'del', oldNo: i + 1, newNo: null, text: oldLines[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: 'add', oldNo: null, newNo: j + 1, text: newLines[j] });
    j += 1;
  }
  return ops;
}

function buildHunks(ops, context) {
  if (!ops || !ops.length) return [];
  const ctx = context == null ? 3 : context;
  const changed = [];
  ops.forEach((op, index) => { if (op.type !== 'equal') changed.push(index); });
  if (!changed.length) return [];
  const ranges = [];
  let start = changed[0];
  let end = changed[0];
  for (let k = 1; k < changed.length; k += 1) {
    const index = changed[k];
    if (index - end - 1 <= ctx * 2) {
      end = index;
    } else {
      ranges.push({ start, end });
      start = index;
      end = index;
    }
  }
  ranges.push({ start, end });
  return ranges.map((range, index) => {
    const from = Math.max(0, range.start - ctx);
    const to = Math.min(ops.length - 1, range.end + ctx);
    const lines = ops.slice(from, to + 1);
    let added = 0;
    let removed = 0;
    lines.forEach((op) => {
      if (op.type === 'add') added += 1;
      if (op.type === 'del') removed += 1;
    });
    return { index: index + 1, from, to, lines, added, removed };
  });
}

const activeData = computed(() => {
  const name = activeFile.value;
  if (!name) return null;
  const oldText = standardContents.value[name];
  const newText = studentContents.value[name];
  if ((oldText || '') === (newText || '')) return { name, same: true, tooLarge: false, ops: [], hunks: [], added: 0, removed: 0 };
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const tooLarge = (oldText || '').length > MAX_CHARS || (newText || '').length > MAX_CHARS
    || oldLines.length > MAX_LINES || newLines.length > MAX_LINES;
  if (tooLarge) {
    return { name, same: false, tooLarge: true, ops: [], hunks: [], added: 0, removed: 0 };
  }
  const ops = buildOps(oldLines, newLines);
  const hunks = buildHunks(ops || []);
  let added = 0;
  let removed = 0;
  ops.forEach((op) => {
    if (op.type === 'add') added += 1;
    if (op.type === 'del') removed += 1;
  });
  return { name, same: false, tooLarge: false, ops, hunks, added, removed };
});

const fileStats = computed(() => allFiles.value.map((name) => {
  const oldText = standardContents.value[name] || '';
  const newText = studentContents.value[name] || '';
  const oldLines = splitLines(oldText).length;
  const newLines = splitLines(newText).length;
  const tooLarge = String(oldText).length > MAX_CHARS || String(newText).length > MAX_CHARS
    || oldLines > MAX_LINES || newLines > MAX_LINES;
  return { name, same: (oldText || '') === (newText || ''), tooLarge };
}));
const visibleFiles = computed(() => fileStats.value.slice(0, 60));

const changedFiles = computed(() => fileStats.value.filter((item) => !item.same));
const noDifference = computed(() => isProject.value && !!project.value && allFiles.value.length > 0 && changedFiles.value.length === 0);
const noPackage = computed(() => isProject.value && !!project.value && !allFiles.value.length);

function pickFile() {
  if (!allFiles.value.length) {
    activeFile.value = '';
    return;
  }
  const firstChanged = changedFiles.value[0];
  if (activeFile.value && allFiles.value.indexOf(activeFile.value) >= 0) return;
  activeFile.value = firstChanged ? firstChanged.name : allFiles.value[0];
}

function selectFile(name) {
  activeFile.value = name;
}

function lineNo(op) {
  return op.type === 'del' ? op.oldNo : op.newNo;
}

function lineSign(op) {
  if (op.type === 'add') return '+';
  if (op.type === 'del') return '−';
  return ' ';
}

function visibleLines(hunk) {
  if (!onlyDiff.value) return hunk.lines;
  return hunk.lines.filter((op) => op.type !== 'equal');
}

function foldedBefore(hunk, prevTo) {
  return hunk.from - prevTo - 1;
}

function foldedAfter(lastTo) {
  const ops = (activeData.value && activeData.value.ops) || [];
  return ops.length - lastTo - 1;
}

function hunkQuote(hunk) {
  const lines = hunk.lines.map((op) => {
    const sign = op.type === 'add' ? '+ ' : (op.type === 'del' ? '- ' : '  ');
    return sign + op.text;
  });
  const text = '代码差异 · ' + activeData.value.name + '（第 ' + hunk.index + ' 块）\n' + lines.join('\n');
  return text.length > 1200 ? text.slice(0, 1200) + '\n…' : text;
}

function quoteHunk(hunk) {
  const query = { quote: hunkQuote(hunk) };
  if (assignmentId.value) query.assignmentId = assignmentId.value;
  router.push({ path: '/m/teacher/review/' + submissionId.value, query });
}

function quoteAll() {
  const changed = changedFiles.value;
  if (!changed.length) {
    toast.show('没有可引用的差异');
    return;
  }
  const lines = changed.map((item) => item.name);
  const query = { quote: '存在差异的文件：\n' + lines.join('\n') };
  if (assignmentId.value) query.assignmentId = assignmentId.value;
  router.push({ path: '/m/teacher/review/' + submissionId.value, query });
}

async function loadDetail() {
  loading.value = true;
  loadError.value = '';
  const r = await safeLoad(() => request.get('/teacher/submissions/' + submissionId.value));
  loading.value = false;
  if (r.error) {
    loadError.value = r.message || '提交详情加载失败';
    return;
  }
  submission.value = r.data || null;
  if (!isProject.value) return;
  await loadProject();
}

async function loadProject() {
  projectError.value = '';
  const r = await safeLoad(
    () => request.get('/teacher/submissions/' + submissionId.value + '/project'),
    { action: '加载工程包差异' }
  );
  if (r.error) {
    projectError.value = r.message || '工程包加载失败';
    return;
  }
  project.value = r.data || null;
  pickFile();
}

onMounted(loadDetail);
</script>

<template>
  <MobileLayout role="" active="" bottom="actionbar">
    <MobileAppBar title="代码对比" back :back-to="backTo">
      <template #right>
        <MStatusTag v-if="isProject" type="accent">实训题</MStatusTag>
      </template>
    </MobileAppBar>

    <main class="scroll">
      <div v-if="loading" class="page mt8"><MSkeleton variant="card" :count="1" /></div>
      <div v-else-if="loadError" class="page mt8">
        <div class="banner banner--danger" role="alert">
          <MIcon name="alert" /><div>{{ loadError }}<button type="button" class="banner-link" @click="loadDetail">重试</button></div>
        </div>
        <button type="button" class="btn btn--secondary btn--block mt16" @click="router.push(backTo)">返回代码页</button>
      </div>

      <div v-else-if="!isProject" class="page mt8">
        <MEmpty
          icon="file"
          title="该题没有工程包"
          description="代码差异仅支持实训题（工程包提交）；该提交为通用题，请查看代码与参考答案。"
        >
          <button type="button" class="btn btn--primary" @click="router.push(backTo)">查看代码与参考答案</button>
        </MEmpty>
      </div>

      <template v-else-if="projectError">
        <div class="page mt8">
          <div class="banner banner--danger" role="alert">
            <MIcon name="alert" /><div>{{ projectError }}<button type="button" class="banner-link" @click="loadProject">重试</button></div>
          </div>
        </div>
      </template>

      <template v-else-if="project">
        <div class="page mt8">
          <div class="card switch-card">
            <div class="grow">
              <div class="switch-title">只看差异</div>
              <div class="switch-sub">{{ changedFiles.length }} 个文件有差异 · 相同行默认折叠</div>
            </div>
            <button
              type="button"
              class="switch"
              :class="{ on: onlyDiff }"
              role="switch"
              :aria-checked="onlyDiff ? 'true' : 'false'"
              aria-label="只看差异"
              @click="onlyDiff = !onlyDiff"
            ></button>
          </div>

          <div v-if="noPackage" class="mt12">
            <MEmpty icon="folder" title="没有工程包文件" description="该题未上传标准工程包，或提交为空，无法逐文件对比" />
          </div>
          <div v-else-if="noDifference" class="mt12">
            <MEmpty icon="check-circle" title="与标准包一致" description="学生提交的文件与标准工程包逐行相同" />
          </div>

          <template v-else>
            <div class="file-chips" role="group" aria-label="选择差异文件">
              <button
                v-for="item in visibleFiles"
                :key="item.name"
                type="button"
                class="file-chip"
                :class="{ active: activeFile === item.name, same: item.same }"
                :aria-pressed="activeFile === item.name"
                @click="selectFile(item.name)"
              >
                {{ item.name }}
                <span class="file-stat">{{ item.same ? '一致' : '有差异' }}</span>
              </button>
            </div>

            <div v-if="allFiles.length > visibleFiles.length" class="banner banner--warning mt12">
              <MIcon name="alert" /><div>差异文件较多，仅列出前 {{ visibleFiles.length }} 个；完整对比请在电脑端查看。</div>
            </div>

            <div v-if="activeData && activeData.tooLarge" class="banner banner--warning mt12">
              <MIcon name="alert" /><div>该文件较大，手机端不计算差异；请在电脑端查看完整对比。</div>
            </div>

            <div v-else-if="activeData && activeData.same" class="banner banner--success mt12">
              <MIcon name="check-circle" /><div>该文件与标准包一致，没有差异。</div>
            </div>

            <template v-else-if="activeData">
              <div class="diff-summary">
                <span class="tag tag--success">+ {{ activeData.added }} 行</span>
                <span class="tag tag--danger">− {{ activeData.removed }} 行</span>
                <span class="diff-summary-file">{{ activeData.name }}</span>
              </div>

              <div class="diff-list">
                <template v-for="(hunk, hunkIndex) in activeData.hunks" :key="'hunk-' + hunk.index">
                  <button
                    v-if="hunk.from > (hunkIndex === 0 ? 0 : activeData.hunks[hunkIndex - 1].to + 1)"
                    type="button"
                    class="fold-bar"
                    :aria-label="'展开相同行 ' + foldedBefore(hunk, hunkIndex === 0 ? -1 : activeData.hunks[hunkIndex - 1].to)"
                    @click="onlyDiff = false"
                  >
                    <MIcon name="chevron-down" />
                    相同 {{ foldedBefore(hunk, hunkIndex === 0 ? -1 : activeData.hunks[hunkIndex - 1].to) }} 行 · 点击展开
                  </button>

                  <section class="diffcard">
                    <div class="diffhead">
                      <span class="diff-hunk">差异块 {{ hunk.index }} · +{{ hunk.added }} −{{ hunk.removed }}</span>
                      <button type="button" class="diff-quote" :aria-label="'引用差异块 ' + hunk.index + ' 到评语'" @click="quoteHunk(hunk)">引用</button>
                    </div>
                    <div class="diffbody">
                      <div
                        v-for="(op, opIndex) in visibleLines(hunk)"
                        :key="hunk.index + '-' + opIndex"
                        class="diffline"
                        :class="{ add: op.type === 'add', del: op.type === 'del' }"
                      >
                        <span class="dln" aria-hidden="true">{{ lineNo(op) == null ? '' : lineNo(op) }}</span>
                        <span class="dsign" aria-hidden="true">{{ lineSign(op) }}</span>
                        <span class="dcode">{{ op.text || ' ' }}</span>
                      </div>
                      <p v-if="onlyDiff && !visibleLines(hunk).length" class="diff-empty">该块仅包含相同行</p>
                    </div>
                  </section>
                </template>

                <button
                  v-if="activeData.hunks.length && foldedAfter(activeData.hunks[activeData.hunks.length - 1].to) > 0"
                  type="button"
                  class="fold-bar"
                  @click="onlyDiff = false"
                >
                  <MIcon name="chevron-down" />
                  相同 {{ foldedAfter(activeData.hunks[activeData.hunks.length - 1].to) }} 行 · 点击展开
                </button>
              </div>
            </template>
          </template>

          <div v-if="changedFiles.length" class="banner banner--info mt12">
            <MIcon name="info" />
            <div>共 {{ changedFiles.length }} 个文件有差异；点击差异块右上角「引用」可把该块文本带到教师评语。</div>
          </div>
        </div>
      </template>
    </main>

    <div class="actionbar">
      <button type="button" class="btn btn--secondary" @click="router.push(detailTo)">返回审核</button>
      <button type="button" class="btn btn--primary" :disabled="!changedFiles.length" @click="quoteAll">引用差异到评语</button>
    </div>
  </MobileLayout>
</template>

<style scoped>
.switch-card { display: flex; align-items: center; }
.switch-title { font-size: 14.5px; font-weight: 600; }
.switch-sub { margin-top: 2px; font-size: 12px; color: var(--text-tertiary); }
.switch-card .switch { margin-left: 12px; }
.file-chips {
  display: flex;
  overflow-x: auto;
  margin-top: 12px;
  padding-bottom: 4px;
  scrollbar-width: none;
}
.file-chips::-webkit-scrollbar { display: none; }
.file-chip {
  flex: none;
  position: relative;
  min-height: 36px;
  margin-right: 8px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--m-radius-chip);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
}
.file-chip::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 44px; transform: translateY(-50%); }
.file-chip.active { background: var(--brand-600); border-color: var(--brand-600); color: var(--text-on-brand); }
.file-chip.same { opacity: 0.72; }
.file-stat { margin-left: 6px; font-size: 11px; font-variant-numeric: tabular-nums; opacity: 0.8; }
.diff-summary { display: flex; align-items: center; margin: 14px 0 10px; }
.diff-summary .tag + .tag { margin-left: 6px; }
.diff-summary-file {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diff-list { margin-top: 4px; }
.fold-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 40px;
  margin: 8px 0;
  border-radius: 10px;
  background: var(--bg-surface-2);
  color: var(--text-tertiary);
  font-size: 12px;
}
.fold-bar .icon { width: 14px; height: 14px; margin-right: 5px; }
.diffcard + .diffcard { margin-top: 10px; }
.diff-hunk { font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.diff-quote {
  position: relative;
  flex: none;
  margin-left: 8px;
  padding: 2px 10px;
  border-radius: 8px;
  color: var(--text-link);
  font-size: 12.5px;
  font-weight: 600;
}
.diff-quote::after { content: ""; position: absolute; left: -4px; right: -4px; top: 50%; height: 44px; transform: translateY(-50%); }
.diffline .dsign { flex: none; width: 14px; text-align: center; opacity: 0.9; }
.diffline .dcode { white-space: pre; }
.diff-empty { padding: 8px 12px; font-size: 12px; color: var(--text-tertiary); }
</style>
