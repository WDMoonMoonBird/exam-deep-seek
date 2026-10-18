<template>
  <PageShell
    title="批改记录"
    description="每次批改/造尺运行的只读留档：计数口径、会话销毁证据与逐份结果。本页只读，不触发写操作。"
    :max-width="'var(--layout-content-max)'"
  >
    <template #actions>
      <StatusTag :tone="loading ? 'neutral' : 'success'" :text="`共 ${total} 条`" />
      <!-- ★R2-B68（WAVE3）：按班看失分项分布 —— 需先在筛选里填「作业ID」（口径=既有批改结果投影 breakdown） -->
      <a-button size="small" :disabled="!filters.assignmentId" @click="lossOpen = true">失分项分布</a-button>
      <a-button size="small" :loading="loading" @click="load">刷新</a-button>
    </template>
    <a-card size="small" class="filter-card">
      <a-space wrap>
        <a-input-number v-model:value="filters.assignmentId" placeholder="作业ID" style="width: 120px" :min="1" />
        <a-select v-model:value="filters.type" placeholder="类型" style="width: 150px" allowClear :options="typeOptions" />
        <a-select v-model:value="filters.runKind" placeholder="运行类型" style="width: 160px" allowClear :options="runKindOptions" />
        <a-select v-model:value="filters.sessions_purged" placeholder="会话销毁" style="width: 170px" allowClear :options="purgeOptions" />
        <a-select v-model:value="filters.status" placeholder="状态" style="width: 140px" allowClear :options="statusOptions" />
        <a-button type="primary" size="small" @click="reload">查询</a-button>
        <a-button size="small" @click="reset">重置</a-button>
      </a-space>
    </a-card>
    <a-card size="small">
      <a-table :columns="cols" :dataSource="items" rowKey="id" size="small" :loading="loading"
        :pagination="pagination" :scroll="{ x: 1780 }" @change="onTableChange">
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
            <a class="link" @click="openDetail(record)">{{ record.archive || record.id }}</a>
            <div class="muted">{{ record.id }}<span v-if="record.archive_present === false"> · 无归档</span></div>
          </template>
          <template v-else-if="column.key === 'type'">
            <a-tooltip :title="'原键：type=' + (record.type || '—')">
              <StatusTag :tone="record.type === 'build' ? 'neutral' : 'success'" :text="typeLabel(record.type)" dot />
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'run_kind_col'">
            <a-tooltip :title="'原键：run_kind=' + (record.run_kind || '—') + '（open=开放题自动评价 / build=本次造尺 / reuse=复用量尺 / worker=普通批改 / ruler=存量尺子）'">
              <StatusTag :tone="runKindTone(record.run_kind)" :text="runKindLabel(record.run_kind)" dot />
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'assignment'">
            {{ record.assignment_id ?? '—' }}
            <div class="muted">{{ record.assignment_title || '' }}</div>
          </template>
          <template v-else-if="column.key === 'teacher'">
            {{ record.teacher_name || '—' }}
            <div v-if="record.teacher_id" class="muted">ID {{ record.teacher_id }}</div>
          </template>
          <template v-else-if="column.key === 'classes'">
            <template v-if="record.classes && record.classes.length">
              {{ record.classes.map((c) => c.name).join('、') }}
            </template>
            <span v-else class="muted">—</span>
            <div v-if="record.class_count" class="muted">共 {{ record.class_count }} 个班</div>
          </template>
          <template v-else-if="column.key === 'checker'">
            <a-tooltip :title="'原键：checker_id=' + (record.checker_id_raw || record.checker_id || '—')">
              <span class="mono">{{ record.checker_label || record.checker_id || '—' }}</span>
            </a-tooltip>
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
          <a-alert v-if="detail.run && detail.run.notice" type="info" show-icon class="mb" :message="detail.run.notice" />
          <a-descriptions size="small" bordered :column="2" title="运行概览">
            <a-descriptions-item label="归档">
              {{ detail.run.archive || '—' }}
              <span v-if="detail.run.archive_present === false" class="muted"> · 无归档</span>
              <span class="muted"> · 原键 archive</span>
            </a-descriptions-item>
            <a-descriptions-item label="类型">
              <a-tooltip :title="'原键：type=' + (detail.run.type || '—')">{{ typeLabel(detail.run.type) }}</a-tooltip>
            </a-descriptions-item>
            <a-descriptions-item label="运行类型">
              <a-tooltip :title="'原键：run_kind=' + (detail.run.run_kind || '—')">{{ runKindLabel(detail.run.run_kind) }}</a-tooltip>
            </a-descriptions-item>
            <a-descriptions-item label="老师 / 班级">
              {{ detail.run.teacher_name || (meta && meta.teacher && meta.teacher.name) || '—' }}
              <span class="muted"> · </span>
              <template v-if="detail.run.classes && detail.run.classes.length">{{ detail.run.classes.map((c) => c.name).join('、') }}</template>
              <template v-else-if="meta && meta.classes && meta.classes.length">{{ meta.classes.map((c) => c.name).join('、') }}</template>
              <span v-else class="muted">无关联班级</span>
            </a-descriptions-item>
            <a-descriptions-item label="作业">
              {{ detail.run.assignment_id ?? '—' }} {{ detail.run.assignment_title || '' }}
              <span class="muted"> · 原键 assignment_id</span>
            </a-descriptions-item>
            <a-descriptions-item label="尺子ID">
              <span class="mono">{{ checkerLabel(detail.run) }}</span>
              <span class="muted"> · 原键 checker_id / checker_label</span>
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
            <p v-if="detail.submissions_source === 'db_by_checker'" class="muted note">口径：该运行没有归档证据（旧运行/归档已清理）⇒ 逐份结果来自数据库（仅学生名 / 分数 / 尺子归属，<b>不含答题全文</b>，也不改分）。</p>
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
                <a-descriptions-item label="本次判据会话">
                  <a-tooltip title="原键：no_model_session（只反映**判据**会话；评语消耗见下方分账）">
                    {{ usage.no_model_session === true ? '零模型调用（尺子复用/未起模型会话）' : '有模型调用' }}
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

              <!-- ★R2-B49：判据/评语**分账**（口径：尺子零 LLM；评语按需生成、单独计量、可关） -->
              <div class="split-block">
                <div class="split-title">消耗分账 · 判据 / 评语（总评）</div>
                <a-descriptions size="small" bordered :column="2" class="mt-s">
                  <a-descriptions-item label="判据会话（打分）">
                    {{ fmtCost4(usage.cost_split ? usage.cost_split.judge : null, usage.cost_currency) }}
                    <span class="muted"> · tokens 见上方四项</span>
                  </a-descriptions-item>
                  <a-descriptions-item label="评语会话（总评）">
                    <template v-if="usage.summary_session && usage.summary_session.generated">
                      {{ fmtCost4(usage.summary_session.cost_total, usage.cost_currency) }}
                      <span class="muted"> · {{ summaryStateLabel(usage.summary_session) }} · 原键 summary_session</span>
                    </template>
                    <span v-else class="muted">未生成评语（开关 off / 旧运行）</span>
                  </a-descriptions-item>
                  <a-descriptions-item label="合计">
                    <a-tooltip title="原键：cost_split.total = 判据 + 评语（任一项不可得则如实留空，不显示假 0）">
                      {{ fmtCost4(usage.cost_split ? usage.cost_split.total : null, usage.cost_currency) }}
                    </a-tooltip>
                  </a-descriptions-item>
                  <a-descriptions-item label="评语 tokens">
                    <template v-if="usage.summary_session && usage.summary_session.generated && usage.summary_session.tokens">
                      {{ fmtTokens(usage.summary_session.tokens.prompt) }} 输入 / {{ fmtTokens(usage.summary_session.tokens.completion) }} 输出
                      <a-tooltip v-if="usage.summary_session.tokens.reasoning" title="推理型模型的 reasoning_tokens（不计费但占预算）">
                        <span class="muted"> · 推理 {{ fmtTokens(usage.summary_session.tokens.reasoning) }}</span>
                      </a-tooltip>
                    </template>
                    <span v-else class="muted">—</span>
                  </a-descriptions-item>
                </a-descriptions>
                <div class="muted mt-s">
                  口径：<b>尺子零 LLM；评语按需生成、单独计量、可关</b>（<code>DSH_SUMMARY_MODE=off|cached|always</code>，默认 cached；预算超限只停评语、不影响分数）。
                  <span v-if="usage.summary_session && usage.summary_session.mode">本次运行开关：<code>{{ usage.summary_session.mode }}</code>。</span>
                </div>
              </div>
              <p class="muted note">{{ usageNote }}</p>
            </template>
            <a-empty v-else :image="false" :description="usageEmptyText" />
          </a-card>
          <a-card size="small" title="🧾 元信息（运行时的快照）" class="mt">
            <template v-if="meta">
              <a-descriptions size="small" bordered :column="2">
                <a-descriptions-item label="老师">{{ (meta.teacher && meta.teacher.name) || detail.run.teacher_name || '—' }}</a-descriptions-item>
                <a-descriptions-item label="作业">{{ meta.assignment.title || detail.run.assignment_title || '—' }}（ID {{ meta.assignment.id ?? '—' }}）</a-descriptions-item>
                <a-descriptions-item label="班级（全部）" :span="2">
                  <template v-if="(meta.classes && meta.classes.length) || (detail.run.classes && detail.run.classes.length)">
                    <StatusTag v-for="c in (meta.classes && meta.classes.length ? meta.classes : detail.run.classes)" :key="c.id" tone="neutral" :text="c.name" class="mr" />
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
                  <span v-else class="muted">{{ detail.run && detail.run.run_kind === 'open' ? '—（开放题无标准包/无尺子）' : '—（该运行没有关联题目/快照）' }}</span>
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
            <a-alert v-if="detail.run.archive_present === false" type="info" show-icon class="mb"
              :message="'该记录没有归档目录（旧运行 / 归档已清理 / 存量尺子记录）⇒ 无 stdout/stderr/run.log 可读；这不是接口错误。'" />
            <template v-else>
              <a-space class="mb">
                <a-button size="small" @click="loadLog('stdout')">stdout 尾部</a-button>
                <a-button size="small" @click="loadLog('stderr')">stderr 尾部</a-button>
                <a-button size="small" @click="loadLog('run')">run.log</a-button>
                <a-button size="small" :loading="logDownloading" @click="downloadLog('stdout')">下载全量日志（stdout）</a-button>
              </a-space>
              <a-alert v-if="logMissing" type="info" show-icon class="mb" :message="`该通道日志缺失（present=false，reason=${logMissing}）—— 不是接口错误`" />
              <pre v-if="logText" class="log">{{ logText }}</pre>
              <p v-if="!logText && !logMissing" class="muted">点击上方按钮查看该运行的三通道日志（stdout / stderr / run）。</p>
            </template>
          </a-card>
        </template>
      </a-spin>
    </a-drawer>

    <LossDistributionDrawer v-model:open="lossOpen" :assignment-id="filters.assignmentId || null" role="admin" />
  </PageShell>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue';
import 'ant-design-vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import StatusTag from '../../components/StatusTag.vue';
import LossDistributionDrawer from '../../components/LossDistributionDrawer.vue';   // ★R2-B68：按班失分项分布抽屉
// ★B3 拆分（纯搬运）：表格列/筛选选项 → ./gradingRuns/columns.js；中文化标签/格式化 → composables/admin/gradingRuns/useGradingRunsLabels.js；
//   列表取数 → useGradingRunsList.js；详情抽屉/三块面板/日志 → useGradingRunsDetail.js。模板与行为不变。
import { cols, subCols, toolCols } from './gradingRuns/columns.js';
import {
  tierLabel, typeLabel, runKindLabel, runKindTone, checkerLabel, sourceLabel, homePolicyLabel, statusLabel,
  runRefLabel, fmtLocalTime, utcTooltip, fmtBytes, exitLabel, fmtRate, fmtRateNa, jsonText, fmtTokens, fmtElapsed,
  purgeTone, purgeText, stateTone, stateText,
} from '../../composables/admin/gradingRuns/useGradingRunsLabels.js';
import { useGradingRunsList } from '../../composables/admin/gradingRuns/useGradingRunsList.js';
import { useGradingRunsDetail } from '../../composables/admin/gradingRuns/useGradingRunsDetail.js';

/** 读模型端口（列表/详情/日志同源；本页不引入任何裸根资源路径） */
const API = '/admin/grading-runs';
const lossOpen = ref(false);   // ★R2-B68：失分项分布抽屉（需 assignmentId；空/错态由抽屉兜底）

const typeOptions = [{ value: 'worker', label: '批改运行' }, { value: 'build', label: '造尺运行' }, { value: 'ruler', label: '存量尺子记录' }];
const runKindOptions = [
  { value: 'open', label: '开放评价（open）' },
  { value: 'build', label: '造尺（build）' },
  { value: 'reuse', label: '复用（reuse）' },
  { value: 'worker', label: '普通批改' },
  { value: 'ruler', label: '存量尺子（ruler）' },
];
const purgeOptions = [{ value: 'yes', label: '已销毁' }, { value: 'no', label: '未销毁（需关注）' }];
const statusOptions = [{ value: 'done', label: 'done' }, { value: 'failed', label: 'failed' }, { value: 'pending', label: 'pending' }, { value: 'running', label: 'running' }, { value: 'needs_rerun', label: 'needs_rerun' }, { value: 'ready', label: 'ready' }];

// ★B3：列表（状态/筛选/分页/取数）与详情（抽屉/三块面板/日志）逻辑已拆到 composables（依赖注入 request；URL 仍由 API 常量同源，行为不变）
const {
  loading, items, total, filters, load, reload, reset, onTableChange, pagination,
} = useGradingRunsList({ request, basePath: API });
const {
  detailOpen, detailLoading, detail, detailError, logText, logMissing, logDownloading,
  openDetail, loadLog, downloadLog,
  usage, usageInfo, meta, tools, toolsInfo, toolsAvailable,
  usageAlertType, usageEmptyText, manifestText,
  ev, submissions, filesText, purgeAlertType, purgeHeadline, purgeHint,
} = useGradingRunsDetail({ request, basePath: API });

/** 费用：¥ + 4 位小数（原键 cost_total/cost_currency）；null ⇒ '—'（不显示假 0） */
function fmtCost4(v, currency) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const cur = (currency || 'CNY').toUpperCase();
  const sym = cur === 'CNY' ? '¥' : cur + ' ';
  return sym + n.toFixed(4);
}

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

/** 评语生成方式的人话标签（三态可辨：命中缓存 / 本次生成 / 生成方式未记录） */
function summaryStateLabel(ss) {
  if (!ss || !ss.generated) return '未生成评语';
  if (ss.state === 'cached_hit' || ss.cache_hit === true) return '缓存命中（未新增模型调用）';
  if (ss.cache_hit === false) return '本次会话生成';
  return '生成方式未记录（旧数据）';
};

/** ★R2-B49：判据会话与评语会话分开陈述（口径：尺子零 LLM；评语按需生成、单独计量、可关） */
const usageAlert = computed(() => {
  if (!detail.value) return '';
  const u = usage.value;
  const ss = u && u.summary_session;
  if (u && u.no_model_session === true) {
    return ss && ss.generated
      ? '本次判据会话零模型调用（尺子复用）；评语已单独生成（' + summaryStateLabel(ss) + '，费用见"评语会话"分账）'
      : '本次判据会话零模型调用（尺子复用）；未生成评语（开关 off / 旧运行）';
  }
  if (!u) return '用量不可得（reason=' + (usageInfo.value.reason || 'unknown') + '）—— 不是接口错误，不显示假 0';
  return '';
});

const usageNote = computed(() => {
  const u = usage.value || {};
  // ★OP-2（D1-6）：开放题自动评价 —— usage 来自 DeepSeek API 每次响应（按调用时刻聚合），
  //   与普通题（teardown 前从 DSH 会话抽取）口径不同，如实注明；cache_write 不可得=0（非真实缓存写入）。
  if (u.calls_basis === 'api_call_time') {
    return '口径：开放题自动评价按每次模型调用（DeepSeek API usage）聚合；命中率 = cache_read/(cache_read+uncached_input)；费用按 system_configs.llm_prices 分档计算（' + (u.price_tier || '—') + ' 档）；cache_write 不可得=0（非真实缓存写入）；model_calls=模型响应次数（含重试）。';
  }
  if (u.no_model_session === true) return '口径：本次运行无模型会话（复用命中/量尺等零 LLM 路径）⇒ token 全 0、费用 0；不伪造费用。';
  return '口径：数据在 teardown 销毁会话之前抽取（<run-root>/out/session-usage.json）；命中率 = cache_read/(cache_read+uncached_input)；费用按 system_configs.llm_prices 分档计算（' + (u.price_tier || '—') + ' 档）。'
    + (usageInfo.value.source === 'teardown_json' ? '（本行来自 run-teardown.json 摘要：旧运行无逐次分桶，calls 不可得）' : '');
});

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
/* ★R2-B49：判据 / 评语（总评）消耗分账 */
.split-block { margin-top: 10px; border-top: 1px dashed var(--border-subtle); padding-top: 8px; }
.split-title { font-size: var(--fs-caption); font-weight: 600; color: var(--text-secondary); }
.mt-s { margin-top: 6px; }
</style>
