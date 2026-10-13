<template>
  <PageShell
    title="作业管理"
    description="布置作业、跟踪提交与评分进度；AI 评分完成后会自动推送到「评分审核」。"
  >
    <template #actions>
      <a-button @click="fetch">刷新</a-button>
      <a-button type="primary" @click="openAdd">布置作业</a-button>
    </template>

    <!-- KPI：只用后端真实返回的数据（docs/ui-redesign/06-api-gap.md §5 已剔除示意数字） -->
    <template #kpi>
      <section class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">作业总数</div>
          <div class="kpi-value tnum">{{ pagination.total }}<small>份</small></div>
          <div class="kpi-sub">{{ hasFilter ? '当前筛选结果' : '全部作业' }}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">待审核提交</div>
          <div class="kpi-value tnum tone-warn">{{ summary.pendingReview }}<small>份</small></div>
          <div class="kpi-sub">与「评分审核」页数字同源</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">AI 评分中</div>
          <div class="kpi-value tnum">{{ summary.aiPending }}<small>份</small></div>
          <div class="kpi-sub">{{ summary.abnormal ? summary.abnormal + ' 份评分异常' : '无异常' }}</div>
        </div>
      </section>
    </template>

    <!-- 服务端分页 + 服务端筛选：/teacher/assignments 支持 page / pageSize / keyword / classId / status -->
    <ListPage
      :columns="columns"
      :data-source="list"
      :loading="loading"
      row-key="id"
      :total="pagination.total"
      :current="pagination.current"
      :page-size="pagination.pageSize"
      :empty-title="hasFilter ? '没有符合条件的作业' : '还没有布置过作业'"
      :empty-desc="hasFilter ? '换个关键词或清空筛选后再试。' : '从题库选择题目并指定班级，学生即可在作业列表中看到它。'"
      :empty-action-text="hasFilter ? '清空筛选' : '布置第一份作业'"
      @page-change="onPageChange"
      @empty-action="onEmptyAction"
    >
      <template #toolbar>
        <a-input-search
          v-model:value="filters.keyword"
          placeholder="搜索作业名称"
          allow-clear
          class="w-260"
          @search="applyFilters"
        />
        <!-- T5-A2：无可见 label；placeholder 不算可访问名称，aria-label 又落不到 combobox 上 → 隐藏 label + for/id -->
        <label for="tch-assign-class-filter" class="visually-hidden">按班级筛选</label>
        <a-select
          id="tch-assign-class-filter"
          v-model:value="filters.classId"
          placeholder="全部班级"
          allow-clear
          class="w-200"
          :options="classOptions"
          @change="applyFilters"
        />
        <label for="tch-assign-status-filter" class="visually-hidden">按状态筛选</label>
        <a-select
          id="tch-assign-status-filter"
          v-model:value="filters.status"
          placeholder="全部状态"
          allow-clear
          class="w-160"
          :options="statusOptions"
          @change="applyFilters"
        />
        <a-button v-if="hasFilter" type="link" @click="resetFilters">重置</a-button>
      </template>

      <template #toolbar-right>
        <span class="muted">共 {{ pagination.total }} 份</span>
      </template>

      <template #bodyCell="{ column, record }">
        <!-- 主键列：两行式（主 = 作业标题；次 = 共 N 题）。练习/锁定徽标留在主行原位——
             徽标是 inline-flex，不改变标题行的行盒高度，故行高与其它两行单元格一致 -->
        <template v-if="column.key === 'title'">
          <span class="lp-stack">
            <!-- ★R3-D9（t17）：不再按作业模式打「练习」标（mode 不驱动任何行为）—— 改由三开关回显 -->
            <b :title="record.title">{{ record.title }}<StatusTag v-if="record.maxAttempts" tone="neutral" :text="'限 ' + record.maxAttempts + ' 次'" /><StatusTag v-else-if="record.allowResubmit" tone="accent" text="可重交" /><lock-outlined v-if="record.locked" class="lock-icon" title="已锁定" /></b>
            <span>共 {{ record._count?.assignmentQuestions || 0 }} 题</span>
          </span>
        </template>

        <template v-else-if="column.key === 'classes'">
          <StatusTag v-for="ac in visibleClasses(record)" :key="ac.classId" tone="neutral" :text="ac.class?.name" />
          <span v-if="hiddenClassCount(record) > 0" class="chip-more">+{{ hiddenClassCount(record) }}</span>
          <span v-if="!record.assignmentClasses?.length" class="muted">—</span>
        </template>

        <!-- 提交进度：迷你进度条 + 精确值（全部提交 → track 转绿 is-ok）；口径仍由 progressOf 决定，数字未改 -->
        <template v-else-if="column.key === 'progress'">
          <span class="lp-progress">
            <span class="lp-track" :class="{ 'is-ok': allSubmitted(record) }"><i :style="{ width: progressOf(record).percent + '%' }"></i></span>
            <span class="lp-num">{{ progressOf(record).done }}<u>/{{ progressOf(record).total }}</u></span>
          </span>
        </template>

        <template v-else-if="column.key === 'status'">
          <StatusTag :tone="rowStatus(record).tone" :text="rowStatus(record).text" dot />
          <router-link
            v-if="record.pendingReviewCount > 0"
            class="tag-link"
            :to="{ path: '/teacher/review' }"
          ><StatusTag tone="warning" :text="'待审核 ' + record.pendingReviewCount" /></router-link>
        </template>

        <!-- 截止时间：日期 + 时间固定两行（与「创建时间」列同款 is-plain）；时间维度的语义由「状态」列承担 -->
        <template v-else-if="column.key === 'deadline'">
          <span class="lp-stack is-plain">
            <b>{{ splitDateTime(record.endTime).date }}</b>
            <span>{{ splitDateTime(record.endTime).time }}</span>
          </span>
        </template>

        <template v-else-if="column.key === 'action'">
          <div class="lp-actions">
            <a-button type="link" size="small" @click="toggleLock(record)">
              {{ record.locked ? '解锁' : '锁定' }}
            </a-button>
          </div>
        </template>
      </template>
    </ListPage>

    <!-- 布置作业（一页式两栏 —— 左分区表单 / 右实时摘要）
         数据全部取自现有接口（班级人数 _count.studentClasses、题目 type/maxScore、
         上次作业 assignmentClasses[].classId + startTime/endTime）· 题目单选。
         R3-D1（US-B1）：⑤ 提交与评分 = 三个正交开关（允许重交 + 次数上限 / 计分口径 / 答案可见性），
         按题型（题目 type：project = 实训题）预填默认值且可修改；建作业固定写 mode='exam'（mode 不再驱动行为）。 -->
    <a-modal
      :open="visible"
      title="布置作业"
      :width="modalWidth"
      :footer="null"
      :destroyOnClose="true"
      wrap-class-name="assign-modal"
      @cancel="onCancel"
    >
      <div v-if="draftRestored" class="draft-bar">
        <span>已恢复上次未提交的草稿</span>
        <button type="button" class="linkbtn" @click="clearDraft">清除草稿</button>
      </div>

      <div class="assign-body">
        <div class="assign-main">
          <!-- ① 基本信息 -->
          <section class="ablk">
            <div class="ablk-h"><b>① 基本信息</b><span class="ablk-n">学生端显示这个标题</span></div>
            <div class="ablk-b">
              <div class="afld">
                <label for="assign-title">作业标题</label>
                <a-input
                  id="assign-title"
                  v-model:value="timeForm.title"
                  placeholder="例如：第三章 循环与数组"
                  :status="titleError ? 'error' : undefined"
                  @blur="titleTouched = true"
                />
                <div v-if="titleError" class="afld-err" role="alert">⚠ 请填写作业标题</div>
              </div>
              <div class="afld">
                <label for="assign-desc">作业说明（可选）</label>
                <a-textarea id="assign-desc" v-model:value="timeForm.description" :rows="2" placeholder="要提醒学生注意什么？可留空" />
              </div>
            </div>
          </section>

          <!-- ② 题目（单选；整行可点） -->
          <section class="ablk">
            <div class="ablk-h"><b>② 题目</b><span class="ablk-n">单选 · 点整行即可选中</span></div>
            <div v-if="selectedQ" class="picked">
              <StatusTag :tone="selectedQ.type === 'project' ? 'accent' : 'brand'" :text="selectedQ.type === 'project' ? '实训题' : '编程题'" />
              <b>{{ selectedQ.title }}</b>
              <span class="picked-meta">{{ difficultyText(selectedQ.difficulty) }} · {{ selectedQ.maxScore }} 分</span>
              <a-button type="link" size="small" @click="changeQuestion">换一题</a-button>
            </div>
            <template v-else>
              <div class="ablk-b ablk-b--tight">
                <a-input-search v-model:value="qKeyword" placeholder="搜索题目标题" allow-clear @search="searchQuestions" />
              </div>
              <!-- B3-1 ⑥：rowSelection.columnTitle 给 antd 自动生成的选择列一个「只读屏」列标题 →
                   消除 axe empty-table-header。customRow 让整行可点（原实现必须精确点中圆点）。 -->
              <a-table
                :columns="qCols"
                :dataSource="questions"
                rowKey="id"
                size="small"
                :scroll="{ x: 'max-content' }"
                :pagination="false"
                :rowSelection="{ selectedRowKeys: selectedQIds, onChange: onQSelect, type: 'radio', columnTitle: qSelectColumnTitle }"
                :customRow="questionRow"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.dataIndex === 'type'">
                    <StatusTag :tone="record.type === 'project' ? 'accent' : 'brand'" :text="record.type === 'project' ? '实训题' : '编程题'" />
                  </template>
                  <template v-else-if="column.dataIndex === 'difficulty'">{{ difficultyText(record.difficulty) }}</template>
                  <template v-else-if="column.dataIndex === 'maxScore'">
                    <span class="lp-num">{{ record.maxScore }}<u>分</u></span>
                  </template>
                </template>
              </a-table>
            </template>
            <div v-if="pickError" class="afld-err afld-err--block" role="alert">⚠ 请选择一道题目</div>
          </section>

          <!-- ③ 班级（点选 + 人数，数据来自班级列表的 _count.studentClasses） -->
          <section class="ablk">
            <div class="ablk-h">
              <b>③ 班级</b><span class="ablk-n">可多选</span>
              <button v-if="lastClasses.length" type="button" class="linkbtn linkbtn--right" @click="applyLastClasses">套用上次班级</button>
            </div>
            <div class="ablk-b">
              <a-input-search v-if="avalClasses.length > 8" v-model:value="classSearch" size="small" placeholder="搜索班级" class="mb12" />
              <div class="classlist">
                <button
                  v-for="c in filteredClasses"
                  :key="c.id"
                  type="button"
                  class="cbtn"
                  :class="{ 'is-on': selectedCIds.includes(c.id) }"
                  :aria-pressed="selectedCIds.includes(c.id) ? 'true' : 'false'"
                  @click="toggleClass(c.id)"
                >
                  <CheckOutlined v-if="selectedCIds.includes(c.id)" />
                  <span class="cbtn-name">{{ c.name }}</span>
                  <span v-if="c.isTeamClass" class="cbtn-team">团队</span>
                  <span class="cbtn-cnt">{{ classCount(c) }} 人</span>
                </button>
              </div>
              <div class="ahint">已选 {{ selectedCIds.length }} 个班 · 合计 {{ totalStudents }} 人</div>
            </div>
            <div v-if="classError" class="afld-err afld-err--block" role="alert">⚠ 请至少选择一个班级</div>
          </section>

          <!-- ④ 起止时间（默认已填 + 快捷预设） -->
          <section class="ablk">
            <div class="ablk-h">
              <b>④ 起止时间</b><span class="ablk-n">已默认填好，可修改</span>
              <button v-if="lastTime" type="button" class="linkbtn linkbtn--right" @click="applyLastTime">套用上次时间</button>
            </div>
            <div class="ablk-b">
              <div class="afld" role="group" aria-labelledby="assign-range-label">
                <label id="assign-range-label" for="assign-range">起止时间</label>
                <a-range-picker
                  id="assign-range"
                  v-model:value="timeForm.timeRange"
                  show-time
                  :locale="dateLocale"
                  class="w-full"
                  @change="timeTouched = true"
                />
                <div class="ahint">
                  快捷：
                  <button type="button" class="qbtn" @click="applyPreset(0)">今天 18:00 ~ 一周后 23:59</button>
                  <button type="button" class="qbtn" @click="applyPreset(1)">明天 08:00 ~ 三天后 23:59</button>
                </div>
                <div v-if="timeError" class="afld-err" role="alert">⚠ 请选择起止时间</div>
              </div>
            </div>
          </section>
          <!-- ⑤ 提交与评分：三个正交开关（US-B1）—— 按题型预填默认值，可修改 -->
          <section class="ablk">
            <div class="ablk-h"><b>⑤ 提交与评分</b><span class="ablk-n">已按题型预填，可修改</span></div>
            <div class="ablk-b">
              <div class="afld">
                <label>允许重交</label>
                <div class="switch-row"><span>关闭则每人只能提交一次</span><a-switch v-model:checked="switches.allowResubmit" /></div>
              </div>
              <div class="afld">
                <label for="assign-max-attempts">提交次数上限</label>
                <a-input-number id="assign-max-attempts" v-model:value="switches.maxAttempts" :min="1" :max="99" :disabled="!switches.allowResubmit" placeholder="不限次" class="w-full" />
                <div class="ahint">留空 = 不限次；达到上限后学生再次提交会被拒绝并提示「已达提交次数上限」。</div>
                <div v-if="maxAttemptsError" class="afld-err" role="alert">⚠ {{ maxAttemptsError }}</div>
              </div>
              <div class="afld">
                <label for="assign-score-policy">计分口径</label>
                <a-select id="assign-score-policy" v-model:value="switches.scorePolicy" :options="scorePolicyOptions" class="w-full" />
                <div class="ahint">{{ scorePolicyText }}</div>
              </div>
              <div class="afld">
                <label for="assign-answer-visibility">答案可见性</label>
                <a-select id="assign-answer-visibility" v-model:value="switches.answerVisibility" :options="answerVisibilityOptions" class="w-full" />
                <div class="ahint">{{ answerVisibilityText }}</div>
              </div>
              <div v-if="isProjectSelected" class="cost-tip" role="note">{{ costTip }}</div>
            </div>
          </section>
        </div>

        <aside class="assign-side">
          <div class="asum">
            <h4>将布置</h4>
            <dl class="asum-dl">
              <div class="kv"><dt>题目</dt><dd>{{ selectedQIds.length }} 题</dd></div>
              <div class="kv"><dt>班级</dt><dd>{{ selectedCIds.length }} 个 · {{ totalStudents }} 人</dd></div>
              <div class="kv"><dt>截止</dt><dd>{{ deadlineText }}</dd></div>
              <div class="kv"><dt>计分</dt><dd>{{ switchSummary.score }}</dd></div>
              <div class="kv"><dt>答案解析</dt><dd>{{ switchSummary.visibility }}</dd></div>
            </dl>
          </div>
          <div class="aready" :class="missing.length ? 'is-warn' : 'is-ok'" role="status">
            {{ missing.length ? '⚠ 还差：' + missing.join('、') : '✓ 信息齐了，可以布置' }}
          </div>
          <a-button type="primary" block :disabled="missing.length > 0" :loading="submitting" @click="submit">立即布置</a-button>
          <a-button block @click="onCancel">取消</a-button>
          <button type="button" class="linkbtn linkbtn--full" @click="saveDraftAndClose">存为草稿并关闭</button>
        </aside>
      </div>
    </a-modal>
  </PageShell>
</template>

<script setup>
import { CheckOutlined, LockOutlined } from '@ant-design/icons-vue';
import dateLocale from 'ant-design-vue/es/date-picker/locale/zh_CN';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import { splitDateTime, difficultyText } from '../../domain/format.js';
import { classCount, statusOptions, columns, rowStatus, progressOf, allSubmitted, visibleClasses, hiddenClassCount } from '../../composables/assignments/assignmentsPure.js';
import { useAssignmentsPage } from '../../composables/assignments/useAssignmentsPage.js';

/**
 * ★R2-B64 / t4：本页 script 427 行 → composables/assignments/*（列表 / 布置作业表单 / 题目选择 / 纯函数）。
 * ★R3-D1 / t3：⑤ 提交与评分的三开关（允许重交+次数 / 计分口径 / 答案可见性 + 实训题成本提示）
 *   落在本文件模板与 composables/assignments/{useAssignmentForm,assignmentSwitches}.js；
 *   默认值与字段名同后端（assignmentSwitchDefaults / POST /teacher/assignments 入参）。
 */
const {
  loading, list, pagination, filters, summary, hasFilter, classOptions,
  fetch, applyFilters, resetFilters, onPageChange, onEmptyAction, toggleLock,
  visible, modalWidth, timeForm, titleTouched, timeTouched, titleError, timeError, pickError, classError,
  missing, deadlineText, totalStudents, lastClasses, lastTime, submitting, draftRestored, selectedQ,
  avalClasses, selectedCIds, classSearch, filteredClasses, toggleClass, applyPreset, applyLastClasses, applyLastTime,
  // R3-D1（US-B1）：三开关状态与派生文案/选项（纯逻辑见 composables/assignments/assignmentSwitches.js）
  switches, maxAttemptsError, isProjectSelected, switchSummary, scorePolicyText, answerVisibilityText,
  scorePolicyOptions, answerVisibilityOptions, costTip,
  questions, qKeyword, qCols, qSelectColumnTitle, selectedQIds, searchQuestions, onQSelect, questionRow, changeQuestion,
  openAdd, onCancel, submit, saveDraftAndClose, clearDraft,
} = useAssignmentsPage();
</script>
<style scoped>
/* ===== KPI 行（外壳 PageShell 只负责位置，卡片样式在本页） ===== */
.kpi-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4); }
.kpi { padding: 16px 18px; background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: var(--card-radius); }
.kpi-label { font-size: var(--fs-body-sm); color: var(--text-secondary); }
.kpi-value { margin-top: 6px; font-size: var(--fs-display-2); line-height: 1.2; font-weight: 600; letter-spacing: -0.02em; color: var(--text-strong); }
.kpi-value.tone-warn { color: var(--status-warning-fg); }
.kpi-value small { margin-left: 4px; font-size: var(--fs-body-sm); font-weight: 400; color: var(--text-tertiary); }
.kpi-sub { margin-top: 4px; font-size: var(--fs-caption); color: var(--text-tertiary); }

.w-260 { width: 260px; }
.w-200 { width: 200px; }
.w-160 { width: 160px; }
.w-full { width: 100%; }
.mb12 { margin-bottom: var(--space-3); }
.muted { color: var(--text-tertiary); font-size: var(--fs-caption); }
.tnum { font-variant-numeric: tabular-nums; }
.lock-icon { color: var(--status-danger-fg); font-size: var(--fs-caption); }

/* 超出 2 个班级后的「+N」计数片（不是状态，走描边样式） */
.chip-more { display: inline-flex; align-items: center; height: var(--tag-h); padding: 0 var(--tag-pad-x); margin-right: 4px; border-radius: var(--tag-radius); border: 1px solid var(--border-strong); color: var(--text-secondary); font-size: var(--tag-fs); white-space: nowrap; }
.tag-link { text-decoration: none; }
.tag-link:hover { filter: brightness(0.96); }

@media (max-width: 1100px) {
  .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* ===== 向导弹窗内部（scoped 可覆盖，因为内容渲染在组件自身 DOM 内） ===== */
/* ===== 布置作业 v2：一页式两栏（左分区表单 / 右实时摘要） ===== */
.assign-body { display: grid; grid-template-columns: minmax(0, 1fr) 268px; gap: var(--space-4); align-items: start; }
.assign-main { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.assign-side { display: flex; flex-direction: column; gap: var(--space-2); position: sticky; top: 0; }

.ablk { border: 1px solid var(--border-default); border-radius: var(--radius-lg); overflow: hidden; background: var(--card-bg); }
.ablk-h { display: flex; align-items: center; gap: var(--space-2); padding: 10px var(--space-3); background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); }
.ablk-h b { font-size: var(--fs-body-sm); color: var(--text-primary); }
.ablk-n { font-size: var(--fs-caption); color: var(--text-tertiary); }
.ablk-b { padding: var(--space-3); }
.ablk-b--tight { padding: var(--space-3) var(--space-3) var(--space-2); }

.afld { margin-bottom: var(--space-3); }
.afld:last-child { margin-bottom: 0; }
.afld label { display: block; margin-bottom: 5px; font-size: var(--fs-caption); font-weight: 500; color: var(--text-secondary); }
.afld-err { margin-top: 5px; font-size: var(--fs-caption); color: var(--status-danger-fg); }
.afld-err--block { padding: 0 var(--space-3) var(--space-3); }
.ahint { margin-top: 5px; font-size: var(--fs-caption); color: var(--text-tertiary); }
.qbtn { border: 0; background: transparent; padding: 0 2px; color: var(--text-brand); font-size: var(--fs-caption); cursor: pointer; }
.qbtn:hover { text-decoration: underline; }
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); font-size: var(--fs-body-sm); color: var(--text-secondary); }
/* R3-D1（US-B1 AC4）：实训题成本提示（与右栏 .aready.is-warn 同一套状态令牌） */
.cost-tip { padding: 8px 10px; border-radius: var(--radius-md); border: 1px solid var(--status-warning-bd); background: var(--status-warning-bg); color: var(--status-warning-fg); font-size: var(--fs-caption); line-height: 1.5; }

/* 已选题卡（单选：选中后收起表格，避免选项滚出视野） */
.picked { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3); }
.picked b { flex: 1; min-width: 0; font-size: var(--fs-body-sm); color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picked-meta { flex: none; font-size: var(--fs-caption); color: var(--text-tertiary); }

/* 班级点选按钮：带人数（_count.studentClasses） */
.classlist { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.cbtn { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 10px; border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--card-bg); color: var(--text-secondary); font-size: var(--fs-body-sm); cursor: pointer; transition: var(--transition-control); }
.cbtn:hover { border-color: var(--brand-600); color: var(--text-brand); }
.cbtn.is-on { border-color: var(--brand-600); background: var(--bg-selected); color: var(--text-brand); }
.cbtn-name { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cbtn-team { font-size: var(--fs-caption); color: var(--text-tertiary); }
.cbtn-cnt { font-size: var(--fs-caption); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.cbtn.is-on .cbtn-cnt { color: var(--text-brand); }

.linkbtn { border: 0; background: transparent; padding: 2px 4px; border-radius: var(--radius-sm); color: var(--text-brand); font-size: var(--fs-caption); cursor: pointer; }
.linkbtn:hover { background: var(--bg-hover); }
.linkbtn--right { margin-left: auto; }
.linkbtn--full { width: 100%; padding: var(--space-2) 0; }

/* 右栏：实时摘要 + 就绪提示 + 主/次操作 */
.asum { padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--bg-surface-2); }
.asum h4 { margin: 0 0 var(--space-2); font-size: var(--fs-body-sm); color: var(--text-primary); }
.asum-dl { margin: 0; }
.kv { display: flex; justify-content: space-between; gap: var(--space-2); padding: 5px 0; font-size: var(--fs-body-sm); border-bottom: 1px dashed var(--border-subtle); }
.kv:last-child { border-bottom: 0; }
.kv dt { color: var(--text-tertiary); }
.kv dd { margin: 0; color: var(--text-primary); font-weight: 500; font-variant-numeric: tabular-nums; }
.aready { padding: 9px 10px; border-radius: var(--radius-md); border: 1px solid; font-size: var(--fs-caption); line-height: 1.5; }
.aready.is-ok { background: var(--status-success-bg); border-color: var(--status-success-bd); color: var(--status-success-fg); }
.aready.is-warn { background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg); }
.draft-bar { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); padding: 8px 10px; border-radius: var(--radius-md); background: var(--status-info-bg); border: 1px solid var(--status-info-bd); color: var(--status-info-fg); font-size: var(--fs-caption); }

/* 手机端：单列 + 摘要栏移到内容之后（弹窗外壳的全屏化见文件末尾非 scoped 段） */
@media (max-width: 768px) {
  .assign-body { grid-template-columns: minmax(0, 1fr); }
  .assign-side { position: static; }
  .cbtn { min-height: 44px; }
  .cbtn-name { max-width: none; }
}
/* B2-10：本页原有一份 scoped .visually-hidden 副本已删除 —— 全局工具类（src/style.css）是唯一属主，
   值逐字相同；scoped 副本反而会遮蔽全局类（[data-v-*] 优先级更高）。 */
</style>

<!-- 弹窗外壳：antd Modal 会被 teleport 到 body，scoped 样式够不到；
     选择器统一带 .assign-modal 前缀，避免规则外溢到其它页面的弹窗。 -->
<style>
@media (max-width: 768px) {
  .assign-modal .ant-modal { top: 0; margin: 0; padding-bottom: 0; }
  .assign-modal .ant-modal-content { min-height: 100vh; border-radius: 0; }
  .assign-modal .ant-modal-header { border-radius: 0; }
  .assign-modal .ant-modal-body { max-height: calc(100vh - 64px); overflow: auto; padding: var(--space-3); }
}
</style>
