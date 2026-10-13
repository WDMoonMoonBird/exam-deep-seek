<template>
  <PageShell
    title="批改记录"
    description="每次批改/造尺运行的只读留档：计数口径、会话销毁证据与逐份结果。本页只读，不触发写操作。"
    :max-width="'var(--layout-content-max)'"
  >
    <template #actions>
      <StatusTag :tone="loading ? 'neutral' : 'success'" :text="`共 ${total} 条`" />
      <a-button size="small" :loading="loading" @click="load">刷新</a-button>
    </template>
    <a-card size="small" class="filter-card">
      <a-space wrap>
        <a-input-number v-model:value="filters.assignmentId" placeholder="作业ID" style="width: 120px" :min="1" />
        <a-select v-model:value="filters.type" placeholder="类型" style="width: 150px" allowClear :options="typeOptions" />
        <a-select v-model:value="filters.sessions_purged" placeholder="会话销毁" style="width: 170px" allowClear :options="purgeOptions" />
        <a-select v-model:value="filters.status" placeholder="状态" style="width: 140px" allowClear :options="statusOptions" />
        <a-button type="primary" size="small" @click="reload">查询</a-button>
        <a-button size="small" @click="reset">重置</a-button>
      </a-space>
    </a-card>
    <a-card size="small">
      <a-table :columns="cols" :dataSource="items" rowKey="id" size="small" :loading="loading"
        :pagination="pagination" :scroll="{ x: 1520 }" @change="onTableChange">
        <template #headerCell="{ column }">
          <a-tooltip v-if="column.tooltip" :title="column.tooltip">
            <span>{{ column.title }}</span>
          </a-tooltip>
          <span v-else>{{ column.title }}</span>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'cost'">
            <a-tooltip :title="'原键：cost_total / cost_currency（' + (record.cost_currency || '—') + '）'">
              <span class="mono">{{ fmtCost4(record.cost_total, record.cost_currency) }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'cache_hit_rate_col'">
            <a-tooltip :title="'原键：cache_hit_rate（na=不适用）'">
              <span>{{ record.cache_hit_rate === null || record.cache_hit_rate === undefined ? (record.no_model_session === true ? '不适用（无模型调用）' : '—') : fmtRate(record.cache_hit_rate) }}</span>
            </a-tooltip>
          </template>
          <template v-if="column.key === 'archive'">
            <a class="link" @click="openDetail(record)">{{ record.archive || '—' }}</a>
            <div class="muted">{{ record.id }}</div>
          </template>
          <template v-else-if="column.key === 'type'">
            <a-tooltip :title="'原键：type=' + (record.type || '—')">
              <StatusTag :tone="record.type === 'build' ? 'neutral' : 'success'" :text="typeLabel(record.type)" dot />
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'assignment'">
            {{ record.assignment_id ?? '—' }}
            <div class="muted">{{ record.assignment_title || '' }}</div>
          </template>
          <template v-else-if="column.key === 'status_col'">
            <a-tooltip :title="'原键：status=' + (record.status || '—')">{{ statusLabel(record.status) }}</a-tooltip>
          </template>
          <template v-else-if="column.key === 'measured' || column.key === 'unmeasurable' || column.key === 'failed' || column.key === 'skipped' || column.key === 'written'">
            <span class="mono">{{ record[column.key] ?? '—' }}</span>
          </template>
          <template v-else-if="column.key === 'sessions_purged'">
            <StatusTag :tone="purgeTone(record.sessions_purged)" :text="purgeText(record.sessions_purged)" dot />
          </template>
          <template v-else-if="column.key === 'created_at_col'">
            <a-tooltip :title="utcTooltip(record.created_at)">{{ fmtLocalTime(record.created_at) }}</a-tooltip>
            <div class="muted">耗时 {{ fmtElapsed(record.elapsed_ms) }}</div>
          </template>
        </template>
      </a-table>
      <a-empty v-if="!loading && !items.length" :image="false"
        description="暂无批改记录：可能尚未运行过批改，或归档根不可读（接口会返回空列表而非报错）" />
    </a-card>
    <a-drawer v-model:open="detailOpen" :width="920" title="运行详情（只读）" placement="right">
      <a-spin :spinning="detailLoading">
        <a-alert v-if="detailError" type="error" show-icon :message="detailError" />
        <template v-else-if="detail">
          <a-descriptions size="small" bordered :column="2" title="运行概览">
            <a-descriptions-item label="归档">
              {{ detail.run.archive || '—' }}
              <span class="muted"> · 原键 archive</span>
            </a-descriptions-item>
            <a-descriptions-item label="类型">
              <a-tooltip :title="'原键：type=' + (detail.run.type || '—')">{{ typeLabel(detail.run.type) }}</a-tooltip>
            </a-descriptions-item>
            <a-descriptions-item label="作业">
              {{ detail.run.assignment_id ?? '—' }} {{ detail.run.assignment_title || '' }}
              <span class="muted"> · 原键 assignment_id</span>
            </a-descriptions-item>
            <a-descriptions-item label="尺子ID">
              <span class="mono">{{ detail.run.checker_id || '—' }}</span>
              <span class="muted"> · 原键 checker_id</span>
            </a-descriptions-item>
            <a-descriptions-item label="计数" :span="2">
              <a-space wrap>
                <a-tooltip title="原键：measured（成功量尺份数）"><span>已量尺 {{ detail.run.measured ?? '—' }}</span></a-tooltip>
                <a-tooltip title="原键：unmeasurable（C8 预检/量尺判不可量）"><span>不可量 {{ detail.run.unmeasurable ?? '—' }}</span></a-tooltip>
                <a-tooltip title="原键：failed"><span>无法评分 {{ detail.run.failed ?? '—' }}</span></a-tooltip>
                <a-tooltip title="原键：skipped（未写入分数）"><span>未写分 {{ detail.run.skipped ?? '—' }}</span></a-tooltip>
                <a-tooltip title="原键：written（实际写入分数行数）"><span>已写分 {{ detail.run.written ?? '—' }}</span></a-tooltip>
              </a-space>
            </a-descriptions-item>
            <a-descriptions-item label="装置退出码">
              <a-tooltip :title="'原键：device_exit=' + (detail.run.device_exit ?? '—')">{{ exitLabel(detail.run.device_exit) }}</a-tooltip>
            </a-descriptions-item>
            <a-descriptions-item label="耗时">{{ fmtElapsed(detail.run.elapsed_ms) }}</a-descriptions-item>
            <a-descriptions-item label="时间">
              <a-tooltip :title="utcTooltip(detail.run.created_at)">{{ fmtLocalTime(detail.run.created_at) }}</a-tooltip>
              <span class="muted"> · 原键 created_at</span>
            </a-descriptions-item>
          </a-descriptions>
          <a-card size="small" title="🔒 会话销毁证据" class="mt">
            <a-alert :type="purgeAlertType" show-icon :message="purgeHeadline" :description="purgeHint" class="mb" />
            <a-descriptions size="small" bordered :column="2">
              <a-descriptions-item label="销毁范围">
                <a-tooltip :title="'原键：home_policy=' + (ev.home_policy || '—')">{{ homePolicyLabel(ev.home_policy) }}</a-tooltip>
              </a-descriptions-item>
              <a-descriptions-item label="会话是否销毁">
                <a-tooltip :title="'原键：sessions_purged=' + String(ev.sessions_purged)">
                  <StatusTag :tone="purgeTone(ev.sessions_purged)" :text="purgeText(ev.sessions_purged)" dot />
                </a-tooltip>
              </a-descriptions-item>
              <a-descriptions-item label="会话文件数（前 → 后）">{{ filesText }}</a-descriptions-item>
              <a-descriptions-item label="会话字节数">
                <a-tooltip :title="'原键：session_bytes=' + (ev.session_bytes ?? '—') + ' 字节'">{{ fmtBytes(ev.session_bytes) }}</a-tooltip>
              </a-descriptions-item>
              <a-descriptions-item label="凭据是否删除">
                <StatusTag v-if="ev.credentials_removed === 'yes'" tone="success" text="已删除" dot />
                <StatusTag v-else-if="ev.credentials_removed === 'no'" tone="danger" text="未删除（警示）" dot />
                <span v-else class="muted">—</span>
                <span class="muted"> · 原键 credentials_removed</span>
              </a-descriptions-item>
              <a-descriptions-item label="隔离目录是否保留">
                <a-tooltip :title="'原键：home_exists_after=' + (ev.home_exists_after || '—')">
                  {{ ev.home_exists_after === 'yes' ? '保留（预期）' : (ev.home_exists_after === 'no' ? '已删除' : '—') }}
                </a-tooltip>
              </a-descriptions-item>
              <a-descriptions-item label="销毁策略" :span="2">
                <a-tooltip :title="'原键：purge_policy=' + (ev.purge_policy || '—')">{{ purgePolicyText(ev.purge_policy) }}</a-tooltip>
              </a-descriptions-item>
              <a-descriptions-item label="证据来源">
                <a-tooltip :title="'原键：source=' + (ev.source || detail.run.source || '—')">{{ sourceLabel(ev.source || detail.run.source) }}</a-tooltip>
              </a-descriptions-item>
              <a-descriptions-item label="证据时间">
                <a-tooltip :title="utcTooltip(ev.ts)">{{ fmtLocalTime(ev.ts) }}</a-tooltip>
              </a-descriptions-item>
            </a-descriptions>
            <p class="muted note">口径说明：证据来自本次运行的 run-teardown.json（装置侧不写、由 worker/造尺包装产出）。计数为 0 不等于「没问题」：可能表示本次没有会话文件（如复用/量尺零 LLM），也可能是未采集（na/—）——请结合 source 与 purge_policy 判断来源。</p>
          </a-card>
          <a-card size="small" title="逐份结果" class="mt">
            <a-table :columns="subCols" :dataSource="submissions" rowKey="slug" size="small" :pagination="{ pageSize: 8 }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'slug'">
                  <span class="mono">{{ record.slug }}</span>
                  <div v-if="String(record.slug).startsWith('unknown-')" class="muted">未留产物（不可量/失败/未量尺）</div>
                </template>
                <template v-else-if="column.key === 'state'">
                  <StatusTag :tone="stateTone(record)" :text="stateText(record)" dot />
                </template>
              </template>
            </a-table>
            <a-empty v-if="!submissions.length" :image="false" description="无逐份条目（该运行未产出结果文件；总数以顶部计数为准）" />
          </a-card>
          <a-card size="small" title="📊 用量（tokens / 缓存命中 / 费用）" class="mt">
            <a-alert v-if="usageAlert" :type="usageAlertType" show-icon :message="usageAlert" class="mb" />
            <template v-if="usage">
              <a-descriptions size="small" bordered :column="2">
                <a-descriptions-item label="运行标识">
                  <a-tooltip :title="'原键：run_ref=' + (usageInfo.key || '—')">{{ runRefLabel(usageInfo.key) }}</a-tooltip>
                </a-descriptions-item>
                <a-descriptions-item label="模型">
                  {{ usage.model || '—' }}
                  <span class="muted"> · 原键 model</span>
                </a-descriptions-item>
                <a-descriptions-item label="模型调用次数">
                  <a-tooltip title="原键：model_calls（≈ 会话 steps）">{{ usage.model_calls ?? '—' }}</a-tooltip>
                </a-descriptions-item>
                <a-descriptions-item label="本次无模型会话">
                  <a-tooltip title="原键：no_model_session">
                    {{ usage.no_model_session === true ? '是 —— 本次无模型会话（零 token）' : '否' }}
                  </a-tooltip>
                </a-descriptions-item>
                <a-descriptions-item label="输入（未命中缓存）">
                  <a-tooltip title="原键：uncached_input_tokens">{{ fmtTokens(usage.uncached_input_tokens) }}</a-tooltip>
                </a-descriptions-item>
                <a-descriptions-item label="输入（命中缓存）">
                  <a-tooltip title="原键：cache_read_tokens">{{ fmtTokens(usage.cache_read_tokens) }}</a-tooltip>
                </a-descriptions-item>
                <a-descriptions-item label="输出">
                  <a-tooltip title="原键：output_tokens">{{ fmtTokens(usage.output_tokens) }}</a-tooltip>
                </a-descriptions-item>
                <a-descriptions-item label="缓存写入">
                  <a-tooltip title="原键：cache_write_tokens">{{ fmtTokens(usage.cache_write_tokens) }}</a-tooltip>
                </a-descriptions-item>
                <a-descriptions-item label="缓存命中率">
                  <a-tooltip title="原键：cache_hit_rate = cache_read/(cache_read+uncached_input)">{{ fmtRateNa(usage.cache_hit_rate, usage.no_model_session) }}</a-tooltip>
                </a-descriptions-item>
                <a-descriptions-item label="费用">
                  <a-tooltip :title="'原键：cost_total / cost_currency（币种 ' + (usage.cost_currency || '—') + '）'">{{ fmtCost4(usage.cost_total, usage.cost_currency) }}</a-tooltip>
                </a-descriptions-item>
                <a-descriptions-item label="价目版本">
                  <a-tooltip title="原键：price_version（system_configs.llm_prices.effective_from[:source]）">{{ usage.price_version || '—' }}</a-tooltip>
                </a-descriptions-item>
                <a-descriptions-item label="时段档">
                  <a-tooltip :title="'原键：price_tier=' + (usage.price_tier || '—') + '（peak=高峰 / idle=空闲 / mixed=跨时段 / na=无模型调用）'">{{ tierLabel(usage.price_tier) }}</a-tooltip>
                </a-descriptions-item>
              </a-descriptions>
              <p class="muted note">{{ usageNote }}</p>
            </template>
            <a-empty v-else :image="false" :description="usageEmptyText" />
          </a-card>
          <a-card size="small" title="🧾 元信息（运行时的快照）" class="mt">
            <template v-if="meta">
              <a-descriptions size="small" bordered :column="2">
                <a-descriptions-item label="老师">{{ meta.teacher ? meta.teacher.name : '—' }}</a-descriptions-item>
                <a-descriptions-item label="作业">{{ meta.assignment.title || '—' }}（ID {{ meta.assignment.id ?? '—' }}）</a-descriptions-item>
                <a-descriptions-item label="班级（全部）" :span="2">
                  <template v-if="meta.classes && meta.classes.length">
                    <StatusTag v-for="c in meta.classes" :key="c.id" tone="neutral" :text="c.name" class="mr" />
                  </template>
                  <span v-else class="muted">无关联班级（assignment_classes 为空）</span>
                </a-descriptions-item>
                <a-descriptions-item label="标准工程包" :span="2">
                  <template v-if="meta.standard_package">
                    <div>
                      <span class="mono">{{ meta.standard_package.short_sha256 || '（无 sha）' }}</span>
                      <span class="muted"> · {{ meta.standard_package.file_name || '—' }}</span>
                      <StatusTag class="ml" tone="neutral" :text="meta.standard_package.source" />
                    </div>
                    <a-collapse ghost size="small" class="mt">
                      <a-collapse-panel key="manifest" header="manifest 摘要（点击展开）">
                        <pre class="log">{{ manifestText }}</pre>
                        <p class="muted">口径：标准工程包只读展示（短 sha + 文件名 + manifest 摘要），本页**不提供下载**。</p>
                      </a-collapse-panel>
                    </a-collapse>
                  </template>
                  <span v-else class="muted">—（该运行没有关联题目/快照）</span>
                </a-descriptions-item>
                <a-descriptions-item label="题目描述" :span="2">
                  <template v-if="meta.description"><pre class="log">{{ meta.description.text || '（空）' }}</pre></template>
                  <span v-else class="muted">—</span>
                </a-descriptions-item>
                <a-descriptions-item label="评分标准" :span="2">
                  <template v-if="meta.rubric"><pre class="log">{{ meta.rubric.text || '（空）' }}</pre></template>
                  <span v-else class="muted">—</span>
                </a-descriptions-item>
              </a-descriptions>
              <p class="muted note">口径说明：题目描述/评分标准优先取**发布冻结快照**（rubric_snapshot/material_snapshot），保证日后改名或改标准也能还原当时的输入；{{ meta.snapshot && meta.snapshot.used ? '本次来自快照。' : '本次快照缺失，展示活值（历史作业）。' }}</p>
              <p v-if="meta.warnings && meta.warnings.length" class="muted note">元信息告警：{{ meta.warnings.join('；') }}</p>
            </template>
            <a-empty v-else :image="false" description="元信息不可用（该运行没有关联作业）" />
          </a-card>
          <a-card size="small" title="🔧 工具调用" class="mt">
            <a-alert v-if="!toolsAvailable" type="info" show-icon class="mb"
              :message="'工具调用不可得（reason=' + (toolsInfo.reason || 'unknown') + '）—— 不是接口错误，不显示假数据'" />
            <a-table v-if="toolsAvailable" :columns="toolCols" :dataSource="tools" rowKey="name" size="small"
              :pagination="{ pageSize: 8, hideOnSinglePage: true }" />
            <p v-if="toolsAvailable" class="muted note">口径：来自会话日志（tool/call + tool/result 与 run_code 内层 dispatch），耗时=调用到返回的墙钟差；errors=该工具的失败次数。</p>
          </a-card>
          <a-card size="small" title="🧪 原始证据（JSON，字段名与 DB / 日志一致）" class="mt">
            <a-collapse ghost size="small">
              <a-collapse-panel key="teardown" header="销毁证据 run-teardown.json（点击展开）">
                <pre class="log">{{ jsonText(detail.teardown_json) }}</pre>
              </a-collapse-panel>
              <a-collapse-panel key="usage" header="用量 session-usage（点击展开）">
                <pre class="log">{{ jsonText(detail.usage) }}</pre>
              </a-collapse-panel>
              <a-collapse-panel key="tools" header="工具调用 tools（点击展开）">
                <pre class="log">{{ jsonText(detail.tools) }}</pre>
              </a-collapse-panel>
            </a-collapse>
            <p class="muted note">说明：上方各面板已把常见英文键中文化；此处保留**原始键名与原文**，便于与运行日志、数据库字段逐项对照排查（不做任何改写）。</p>
          </a-card>
          <a-card size="small" title="日志" class="mt">
            <a-space class="mb">
              <a-button size="small" @click="loadLog('stdout')">stdout 尾部</a-button>
              <a-button size="small" @click="loadLog('stderr')">stderr 尾部</a-button>
              <a-button size="small" @click="loadLog('run')">run.log</a-button>
              <a-button size="small" :loading="logDownloading" @click="downloadLog('stdout')">下载全量日志（stdout）</a-button>
            </a-space>
            <a-alert v-if="logMissing" type="info" show-icon class="mb" :message="`该通道日志缺失（present=false，reason=${logMissing}）—— 不是接口错误`" />
            <pre v-if="logText" class="log">{{ logText }}</pre>
            <p v-if="!logText && !logMissing" class="muted">点击上方按钮查看该运行的三通道日志（stdout / stderr / run）。</p>
          </a-card>
        </template>
      </a-spin>
    </a-drawer>
  </PageShell>
</template>
<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import 'ant-design-vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import StatusTag from '../../components/StatusTag.vue';

const loading = ref(false);
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const filters = reactive({ assignmentId: null, type: undefined, status: undefined, sessions_purged: undefined });
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref(null);
const detailError = ref('');
const logText = ref('');
const logMissing = ref('');
const logDownloading = ref(false);   // ★R2-B38：全量日志下载中（走既有 axios 实例 + Blob，不产生裸根 URL）

/** ★R2-B37b 中文化映射（中文为主；英文原键放 tooltip，便于与日志/DB 对照） */
const TYPE_LABELS = { worker: '批改运行', build: '造尺运行' };
const SOURCE_LABELS = { worker: '批改 worker', build: '造尺脚本' };
const HOME_POLICY_LABELS = { 'sessions+credentials': '会话文件 + 凭据（保留 home 骨架）' };
const STATUS_LABELS = { done: '完成', failed: '失败', pending: '排队中', running: '运行中', needs_rerun: '需重跑' };
const TIER_LABELS = { peak: '高峰', idle: '空闲', mixed: '跨时段', na: '不适用（无模型调用）' };
/** ★R2-B38：时段档中文化 —— 零 LLM 时后端给 na ⇒ 与命中率 na 口径统一显示「不适用（无模型调用）」 */
function tierLabel(t) { return TIER_LABELS[t] || (t || '—'); }
function typeLabel(t) { return TYPE_LABELS[t] || (t || '—'); }
function sourceLabel(s) { return SOURCE_LABELS[s] || (s || '—'); }
function homePolicyLabel(v) { return HOME_POLICY_LABELS[v] || (v || '—'); }
function statusLabel(s) { return STATUS_LABELS[s] || (s || '—'); }
/** 销毁策略人话化：purge_home=1 keep_days=3 exit=0 ⇒ 成功即销毁会话；失败保留现场 3 天；装置退出码 0 */
function purgePolicyText(v) {
  const s = String(v || '');
  if (!s) return '—';
  const pick = (k) => { const m = new RegExp(k + '=([^\\s]+)').exec(s); return m ? m[1] : null; };
  const purge = pick('purge_home');
  const keep = pick('keep_days');
  const exit = pick('exit');
  const parts = [];
  if (purge === '1') parts.push('成功即销毁会话');
  else if (purge === '0') parts.push('不销毁会话（purge_home=0）');
  if (keep !== null) parts.push('失败保留现场 ' + keep + ' 天');
  if (exit !== null) parts.push('装置退出码 ' + exit);
  return parts.length ? parts.join('；') : s;
}
/** 运行标识：job:<id> ⇒ 批改任务 #id；build:<作业ID>:<目录> ⇒ 造尺（作业 #ID） */
function runRefLabel(key) {
  const s = String(key || '');
  if (!s) return '—';
  if (s.startsWith('job:')) return '批改任务 #' + s.slice(4);
  if (s.startsWith('build:')) {
    const seg = s.split(':');
    return '造尺（作业 #' + (seg[1] || '?') + (seg[2] ? '，目录 ' + seg[2] : '') + '）';
  }
  return s;
}
/** 本地时间（北京时间，浏览器本地）显示；原 UTC 串放 tooltip */
function fmtLocalTime(v) {
  if (!v) return '—';
  const t = new Date(v);
  if (!Number.isFinite(t.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes()) + ':' + p(t.getSeconds());
}
function utcTooltip(v) {
  if (!v) return '';
  const t = new Date(v);
  return Number.isFinite(t.getTime()) ? 'UTC: ' + t.toISOString() : String(v);
}
/** 字节数：≥1024 显示 KB/MB */
function fmtBytes(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}
/** 装置退出码：0=正常，其余标注（原键 device_exit） */
function exitLabel(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n === 0 ? '0（正常）' : String(n);
}

const typeOptions = [{ value: 'worker', label: '批改运行' }, { value: 'build', label: '造尺运行' }];
const purgeOptions = [{ value: 'yes', label: '已销毁' }, { value: 'no', label: '未销毁（需关注）' }];
const statusOptions = [{ value: 'done', label: 'done' }, { value: 'failed', label: 'failed' }, { value: 'pending', label: 'pending' }, { value: 'running', label: 'running' }];

// ★R2-B37b：表头中文化（英文原键放列 tooltip，便于与日志/DB 字段对照）
const cols = [
  { title: '归档 / 运行', key: 'archive', width: 190, tooltip: '原键：archive / id' },
  { title: '类型', key: 'type', width: 100, tooltip: '原键：type（worker=批改运行 / build=造尺运行）' },
  { title: '作业', key: 'assignment', width: 150, tooltip: '原键：assignment_id / assignment_title' },
  { title: '状态', key: 'status_col', width: 100, tooltip: '原键：status' },
  { title: '已量尺', key: 'measured', width: 80, tooltip: '原键：measured（成功量尺份数）' },
  { title: '不可量', key: 'unmeasurable', width: 80, tooltip: '原键：unmeasurable（C8 预检/量尺判不可量）' },
  { title: '无法评分', key: 'failed', width: 90, tooltip: '原键：failed' },
  { title: '未写分', key: 'skipped', width: 80, tooltip: '原键：skipped（未写入分数的份数）' },
  { title: '已写分', key: 'written', width: 80, tooltip: '原键：written（实际写入分数行数）' },
  { title: '费用', key: 'cost', width: 110, tooltip: '原键：cost_total / cost_currency（按 system_configs.llm_prices 分档）' },
  { title: '命中率', key: 'cache_hit_rate_col', width: 110, tooltip: '原键：cache_hit_rate = cache_read/(cache_read+uncached_input)' },
  { title: '会话销毁', key: 'sessions_purged', width: 130, tooltip: '原键：sessions_purged' },
  { title: '时间', key: 'created_at_col', width: 190, tooltip: '原键：created_at（本地时间；UTC 见悬浮提示）' },
];
const subCols = [
  { title: 'slug', key: 'slug', width: 200 },
  { title: '状态', key: 'state', width: 160 },
  { title: '分数', dataIndex: 'score', width: 80 },
  { title: '命中', dataIndex: 'hits', width: 70 },
  { title: '原因', dataIndex: 'reason', width: 220 },
  { title: '学生', dataIndex: 'student', width: 120 },
];

/** ★R2-B37：三块面板数据（不可得 ⇒ null + 明确语义，不显示假 0） */
const usage = computed(() => (detail.value && detail.value.usage) || null);
const usageInfo = computed(() => (detail.value && detail.value.usage_info) || {});
const meta = computed(() => (detail.value && detail.value.meta) || null);
const tools = computed(() => (detail.value && detail.value.tools) || []);
const toolsInfo = computed(() => (detail.value && detail.value.tools_info) || {});
const toolsAvailable = computed(() => toolsInfo.value.available === true && Array.isArray(detail.value && detail.value.tools));
const toolCols = [
  { title: '工具', dataIndex: 'name', width: 160, tooltip: '原键：tools[].name（会话日志 tool/call + 内层 dispatch）' },
  { title: '次数', dataIndex: 'count', width: 80, tooltip: '原键：tools[].count' },
  { title: '耗时', key: 'ms', width: 110, tooltip: '原键：tools[].ms（调用→返回墙钟差累计）' },
  { title: '失败', dataIndex: 'errors', width: 70, tooltip: '原键：tools[].errors（isError 计数）' },
];
const usageAlert = computed(() => {
  if (!detail.value) return '';
  if (usage.value && usage.value.no_model_session === true) return '本次无模型会话（零 token）';
  if (!usage.value) return '用量不可得（reason=' + (usageInfo.value.reason || 'unknown') + '）—— 不是接口错误，不显示假 0';
  return '';
});
const usageAlertType = computed(() => {
  if (usage.value && usage.value.no_model_session === true) return 'info';
  return usage.value ? 'success' : 'warning';
});
const usageEmptyText = computed(() => '用量不可得（reason=' + (usageInfo.value.reason || 'unknown') + '）：该运行没有落库的用量记录（旧运行，或迁移未落地）');
const usageNote = computed(() => {
  const u = usage.value || {};
  if (u.no_model_session === true) return '口径：本次运行无模型会话（复用命中/量尺等零 LLM 路径）⇒ token 全 0、费用 0；不伪造费用。';
  return '口径：数据在 teardown 销毁会话**之前**抽取（<run-root>/out/session-usage.json）；命中率 = cache_read/(cache_read+uncached_input)；费用按 system_configs.llm_prices 分档计算（' + (u.price_tier || '—') + ' 档）。'
    + (usageInfo.value.source === 'teardown_json' ? '（本行来自 run-teardown.json 摘要：旧运行无逐次分桶，calls 不可得）' : '');
});
const manifestText = computed(() => JSON.stringify((meta.value && meta.value.standard_package && meta.value.standard_package.manifest) || {}, null, 2));
const ev = computed(() => (detail.value && detail.value.teardown_json) || {});
const submissions = computed(() => (detail.value && detail.value.submissions) || []);
const countsText = computed(() => {
  const r = (detail.value && detail.value.run) || {};
  return `measured=${r.measured ?? '—'} unmeasurable=${r.unmeasurable ?? '—'} failed=${r.failed ?? '—'} skipped=${r.skipped ?? '—'} written=${r.written ?? '—'}`;
});
const filesText = computed(() => {
  const e = ev.value;
  return `${e.session_files_before ?? '—'} → ${e.session_files_after ?? '—'}`;
});
const purgeAlertType = computed(() => {
  if (ev.value.sessions_purged === true) return 'success';
  if (ev.value.sessions_purged === false) return 'warning';
  return 'info';
});
const purgeHeadline = computed(() => {
  if (ev.value.sessions_purged === true) return '会话已销毁（sessions_purged=true）';
  if (ev.value.sessions_purged === false) return '会话未销毁（sessions_purged=false）—— 关注：失败保留现场，或未执行 teardown';
  return '无销毁证据（旧运行，或装置侧未产出证据）';
});
const purgeHint = computed(() => {
  const e = ev.value;
  return `home_exists_after=${e.home_exists_after ?? '—'} ｜ credentials_removed=${e.credentials_removed ?? '—'} ｜ session_files ${e.session_files_before ?? '—'} → ${e.session_files_after ?? '—'} ｜ bytes=${e.session_bytes ?? '—'} ｜ source=${e.source || '—'}`;
});

function purgeTone(v) { return v === true ? 'success' : (v === false ? 'danger' : 'neutral'); }
function purgeText(v) { return v === true ? '已销毁' : (v === false ? '未销毁' : '无证据'); }
function stateTone(r) {
  if (r.failed === true) return 'danger';
  if (r.measurable === false) return 'warning';
  return 'success';
}
function stateText(r) {
  if (r.failed === true) return '无法评分（failed）';
  if (r.measurable === false) return '不可量';
  return '已量尺';
}
/** 命中率：null ⇒ '—'（无输入时不得显示 0%/100% 假值） */
function fmtRate(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return (n * 100).toFixed(2) + '%';
}
/** 费用：¥ + 4 位小数（原键 cost_total/cost_currency）；null ⇒ '—'（不显示假 0） */
function fmtCost4(v, currency) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const cur = (currency || 'CNY').toUpperCase();
  const sym = cur === 'CNY' ? '¥' : cur + ' ';
  return sym + n.toFixed(4);
}
/** 命中率（中文化 na 语义）：无模型调用 ⇒ 「不适用（无模型调用）」 */
function fmtRateNa(v, noModelSession) {
  if (v === null || v === undefined || v === '') return noModelSession === true ? '不适用（无模型调用）' : '—';
  return fmtRate(v);
}
/** 原始 JSON 展开文本（只读展示，不改写字段名） */
function jsonText(v) {
  if (v === null || v === undefined) return '（无数据）';
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
/** token 数：null ⇒ '—'；否则千分位 */
function fmtTokens(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}
function fmtElapsed(ms) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.round(Number(ms) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;
}

const pagination = computed(() => ({
  current: page.value, pageSize: pageSize.value, total: total.value, showSizeChanger: true,
  showTotal: (t) => `共 ${t} 条`,
}));

async function load() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    if (filters.assignmentId) params.assignmentId = filters.assignmentId;
    if (filters.type) params.type = filters.type;
    if (filters.status) params.status = filters.status;
    if (filters.sessions_purged) params.sessions_purged = filters.sessions_purged;
    const res = await request.get('/admin/grading-runs', { params });
    const data = (res && res.data) || res;
    items.value = (data && data.items) || [];
    total.value = (data && data.total) || 0;
  } catch (err) {
    items.value = []; total.value = 0;
  } finally {
    loading.value = false;
  }
}
function reload() { page.value = 1; load(); }
function reset() {
  filters.assignmentId = null; filters.type = undefined; filters.status = undefined; filters.sessions_purged = undefined;
  reload();
}
function onTableChange(pg) { page.value = pg.current || 1; pageSize.value = pg.pageSize || 20; load(); }

async function openDetail(record) {
  detailOpen.value = true; detailLoading.value = true; detailError.value = ''; detail.value = null; logText.value = ''; logMissing.value = '';
  try {
    const res = await request.get(`/admin/grading-runs/${encodeURIComponent(record.id)}`);
    const data = (res && res.data) || res;
    if (!data || !data.run) detailError.value = '该运行没有可展示的详情（归档缺失或已被清理）';
    else detail.value = data;
  } catch (err) {
    detailError.value = '读取详情失败：' + (err && err.message ? err.message : String(err));
  } finally {
    detailLoading.value = false;
  }
}

async function loadLog(kind) {
  logText.value = ''; logMissing.value = '';
  const id = detail.value && detail.value.run ? detail.value.run.id : null;
  if (!id) return;
  try {
    const res = await request.get(`/admin/grading-runs/${encodeURIComponent(id)}/log`, { params: { kind }, responseType: 'text', transformResponse: [(d) => d] });
    const text = typeof res === 'string' ? res : ((res && res.data) || '');
    if (String(text).indexOf('# 日志缺失') === 0) logMissing.value = (String(text).match(/reason=([^\s]+)/) || [])[1] || 'missing';
    else logText.value = String(text).slice(-8000);
  } catch (err) {
    logMissing.value = 'request_failed:' + (err && err.message ? err.message : String(err));
  }
}

/** ★R2-B38（t6）：下载**全量**日志（后端 download=1 + 不带窗口参数 ⇒ 整份文件；脱敏在服务端完成）。
 *  走既有 axios 实例（带鉴权头），Blob + 临时 objectURL 触发下载 ⇒ 不引入任何裸根资源路径。 */
async function downloadLog(kind) {
  const id = detail.value && detail.value.run ? detail.value.run.id : null;
  if (!id) return;
  logDownloading.value = true;
  try {
    const res = await request.get(`/admin/grading-runs/${encodeURIComponent(id)}/log`, {
      params: { kind, download: 1 }, responseType: 'blob',
    });
    const blob = (res && res.data) || (res && res instanceof Blob ? res : null);
    if (!blob) { logMissing.value = 'download_failed:empty'; return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = String(id) + '.' + kind + '.log';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    logMissing.value = 'download_failed:' + (err && err.message ? err.message : String(err));
  } finally {
    logDownloading.value = false;
  }
}

onMounted(load);
</script>
<style scoped>
.filter-card { margin-bottom: 12px; }
.mt { margin-top: 12px; }
.mb { margin-bottom: 8px; }
.muted { color: var(--color-text-secondary, #888); font-size: 12px; }
.mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }
.log { max-height: 320px; overflow: auto; background: var(--color-bg-subtle, #fafafa); padding: 8px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; }
.note { margin-top: 8px; margin-bottom: 0; }
.link { cursor: pointer; }
.mr { margin-right: 6px; }
.ml { margin-left: 6px; }
</style>
