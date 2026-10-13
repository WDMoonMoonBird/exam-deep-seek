<template>
  <!-- ★R2-B47（U-1 同族）：加载失败 ⇒ 可读原因 + 重试入口；放在 v-if="loaded" 之外 ⇒ 未加载成功时也能看到，绝不白屏 -->
  <a-alert
    v-if="loadError"
    type="error" show-icon :message="'加载失败：' + loadError"
    style="margin:12px 16px;"
  >
    <template #action><a-button size="small" @click="fetchData">重试</a-button></template>
  </a-alert>
  <div class="pr-page wb-shell" v-if="loaded" :class="{ 'wb-drawer-open': panelOpen }">
    <!-- 顶栏：返回条 + 对象名 + 状态徽标（Workbench 壳） -->
    <div class="pr-top wb-top">
      <!-- ★R2-B47（U-1）：返回落点确定性 —— 上一跳仍在复审流内才 back()，否则显式回「评分审核」列表 -->
      <a-button type="link" size="small" @click="goBack">← 返回</a-button>
      <!-- B3-1 ⑤：标题层级与 Layout 的 h1 衔接（h1 → h2 → 页内 h3）：由 h3 提升为 h2，避免 axe heading-order；
         该类的字号/字重/margin 均已在 CSS 显式声明，标签变化不产生任何视觉差异。 -->
      <h2 class="pr-title">{{ question.title }}</h2>
      <StatusTag tone="brand" text="实训题" />
      <StatusTag tone="warning" text="BETA" />
      <span class="pr-student">{{ student.realName }} / {{ displayNo }}</span>
      <StatusTag :tone="statusTone" :text="statusText" dot />
    </div>

    <!-- 主体：VSCode 风格 IDE（左资源管理器 + 右多 tab 编辑器） -->
    <div class="pr-main wb-body">
      <div class="sidebar wb-left">
        <div class="sidebar-title">资源管理器</div>

        <!-- 双数据源切换：学生提交 / 标准答案包（开放性题目无标准包时不渲染后者，默认停留学生提交） -->
        <a-tabs v-model:activeKey="activeTree" size="small" class="pr-tree-tabs">
          <a-tab-pane key="student" tab="学生提交" />
          <a-tab-pane v-if="hasStandardFiles" key="standard" tab="标准答案包" />
        </a-tabs>

        <Transition name="pr-fade" mode="out-in">
        <div class="file-tree" :key="activeTree">
          <a-tree
            v-if="fileTreeData.length"
            :tree-data="fileTreeData"
            :field-names="{ children: 'children', title: 'name', key: 'path' }"
            v-model:expandedKeys="defaultExpandedKeys"
            :selected-keys="activePath ? [activePath] : []"
            :show-icon="true"
            @select="onTreeSelect"
            @dblclick="onTreeDblclick"
          >
            <template #icon="{ type, path }">
              <FolderOutlined v-if="type === 'directory'" style="color:var(--status-warning-fg);font-size:var(--fs-body);" />
              <span v-else class="tree-icon fiv-icon" :class="getClassWithColor(path || '')"></span>
            </template>
            <template #title="{ name, type }">
              <span :class="type === 'directory' ? 'tree-dir' : 'tree-file'">{{ name }}</span>
            </template>
          </a-tree>
          <a-empty
            v-else
            :description="activeTree === 'standard' ? '教师未上传标准包' : '无文件'"
            :image="false"
          />
        </div>
        </Transition>
      </div>

      <div class="editor-area wb-mid">
        <div class="tab-bar" v-if="openTabs.length">
          <div
            v-for="tab in openTabs"
            :key="tab.path"
            :class="['tab', { active: activePath === tab.path }]"
            @click="switchTab(tab.path)"
          >
            <span class="tab-name">{{ tab.name }}</span>
            <span class="tab-close" @click.stop="closeTab(tab.path)">×</span>
          </div>
          <div class="tab-bar-fill"></div>
        </div>

        <div class="editor-body">
          <div class="editor-container" ref="editorContainerRef" :class="{ 'pr-fade-in': fading }"></div>
          <div v-if="!openTabs.length" class="pr-code-empty">
            <FileTextOutlined style="font-size:48px;color:var(--border-strong)" />
            <p>从左侧选择文件查看代码</p>
          </div>
        </div>
      </div>
      <!-- 右侧评分面板（Workbench 壳：≥1200px 常驻右栏；<1200px 抽屉化） -->
      <aside class="wb-right pr-panel" :class="{ 'is-collapsed': collapsed, open: panelOpen }" aria-label="评分面板">
      <div
        class="panel-header"
        role="button"
        tabindex="0"
        :aria-expanded="collapsed ? 'false' : 'true'"
        aria-controls="pr-score-panel"
        @mousedown.prevent
        @click="collapsed = !collapsed"
        @keydown.enter.prevent="collapsed = !collapsed"
        @keydown.space.prevent="collapsed = !collapsed"
      >
        <span class="panel-arrow" :class="{ open: !collapsed }">▸</span>
        <span class="panel-title">评分面板</span>
        <!-- T4-F2 类别收口：antd green 预置色亮 3.37:1 不达 AA → 走令牌语义类；
             red 实测亮 5.07 / 暗 4.54、blue 亮 5.50 / 暗 4.91 均达标，保持预置色不动。 -->
        <a-tag v-if="aiScore != null" class="tag-success" size="small">AI {{ aiScore }} 分</a-tag>
        <a-tag v-if="bestScore != null && bestScore !== aiScore" class="tag-success" size="small">最高 {{ bestScore }} 分</a-tag>
        <a-tag v-if="gradingState === 'failed'" color="red" size="small">评分异常</a-tag>
        <a-tag v-if="status === 'reviewed'" color="blue" size="small">已审核</a-tag>
        <a-tag v-if="status === 'published'" class="tag-success" size="small">已发布</a-tag>
        <span class="panel-toggle">{{ collapsed ? '展开' : '收起' }}</span>
      </div>

      <Transition name="panel-slide">
      <div class="panel-body" v-show="!collapsed" id="pr-score-panel">
        <!-- 左：AI 区（只读） -->
        <div class="ai-section">
          <div class="ai-head">
            <span class="ai-score-label">AI 评分</span>
            <span class="ai-score-num">{{ aiScore ?? '—' }}<span v-if="maxScore && aiScore != null"> / {{ maxScore }}</span></span>
            <!-- R3-D1：历次最高机器分（口径=取最高时的「计入分」；与最近一次不一致时并列展示） -->
            <a-tag v-if="bestScore != null && bestScore !== aiScore" class="tag-success" size="small">计入分（最高）{{ bestScore }}</a-tag>
            <a-tag v-if="gradingState === 'failed'" color="red">评分异常</a-tag>
            <a-tag v-else-if="status === 'submitted' && !aiResult" class="tag-warning">评分中</a-tag>
            <a-popconfirm
              v-if="gradingState === 'failed'"
              title="将重新调用 AI 评分，完成后自动刷新"
              ok-text="重试"
              cancel-text="取消"
              @confirm="onRegrade"
            >
              <a-button size="small" danger :loading="regrading">重试评分</a-button>
            </a-popconfirm>
            <a-popconfirm
              v-else
              title="将重新调用 AI 评分并覆盖 AI 分（最终分保留），完成后自动刷新"
              ok-text="重新评分"
              cancel-text="取消"
              @confirm="onRegrade"
            >
              <a-button size="small" :loading="regrading">重新评分</a-button>
            </a-popconfirm>
            <a-button size="small" style="margin-left:auto;" @click="showPrompt">查看提示词</a-button>
          </div>

          <div v-if="aiResult" class="ai-block">
            <!-- ★R2-B46：AI 总评（教师真正打开的页 = 本页；此前只加在通用复审页 ReviewDetail.vue ⇒ 用户看不到） -->
            <div v-if="hasSummary" class="ai-sum-card">
              <span class="ai-sum-tag">AI 总评</span>
              <p class="ai-sum-text">{{ fbView.summary.text }}</p>
              <p v-if="fbView.summary.truncated" class="ai-sum-note">（该总评因模型输出长度限制被截断，可重新生成）</p>
            </div>
            <div v-if="hasSummary" class="ai-sum-basis">{{ fbView.basisText }}</div>
            <!-- 有总评 ⇒ 分项默认折叠（点开才看）；无总评 ⇒ 不传 defaultActiveKey（DOM/行为与改动前逐字一致，不白屏） -->
            <a-collapse
              v-if="aiResult.breakdown?.length" ghost size="small" class="ai-collapse"
              :defaultActiveKey="hasSummary ? [] : undefined"
            >
              <a-collapse-panel :header="'评分标准（' + aiResult.breakdown.length + ' 项）'" key="breakdown">
                <div v-for="(b, i) in aiResult.breakdown" :key="i" class="bd-row">
                  <span class="bd-name">{{ b.item }}</span>
                  <a-tag v-if="b.kind === 'checker'" color="blue" size="small" style="font-size:10px;">检查</a-tag>
                  <!-- 合并带回了分支的 antd 预置橙（亮色 3.34:1 不达 AA）→ 改用我方语义类 .tag-warning（亮 5.20 / 暗 9.45）；blue 实测 5.50/4.91 达标故保留原样 -->
                  <a-tag v-else-if="b.kind === 'ai'" class="tag-warning" size="small" style="font-size:10px;">主观</a-tag>
                  <span class="bd-score">{{ b.score }} / {{ b.maxScore }}</span>
                  <span class="bd-comment">{{ b.comment }}</span>
                </div>
              </a-collapse-panel>
            </a-collapse>

            <div v-if="aiResult.highlights?.length" class="hl-list">
              <div v-for="(h, i) in aiResult.highlights" :key="'h' + i" class="hl-item good">✓ {{ h }}</div>
            </div>
            <div v-if="aiResult.issues?.length" class="hl-list">
              <div v-for="(p, i) in aiResult.issues" :key="'p' + i" class="hl-item issue">△ {{ p }}</div>
            </div>

            <div v-if="aiResult.overallComment" class="ai-comment">
              <div class="ai-comment-text">{{ aiResult.overallComment }}</div>
              <a-button size="small" type="link" @click="quoteAiComment">引用到教师评语</a-button>
            </div>
          </div>

          <div v-else class="ai-empty">
            <a-empty
              :description="gradingState === 'failed' ? 'AI 评分异常，可点击上方「重试评分」' : '暂无 AI 评语（评分中或尚未完成，可人工评分）'"
              :image="false"
            />
          </div>
        </div>

        <!-- 右：教师区 -->
        <div class="teacher-section">
          <!-- R3-D1（t4）：审核页提示 —— 已发布不锁死（改分即刻生效）/ 取最高时分数与明细不同源 / 有新提交建议复核 -->
          <div v-if="published" class="pr-notice is-warn" role="status">该提交已发布：改分/评语保存后学生端立即生效</div>
          <div v-if="scoreNotice" class="pr-notice is-info" role="status">{{ scoreNotice.text }}</div>
          <div v-if="newSubmitNotice" class="pr-notice is-warn" role="status">{{ newSubmitNotice }}</div>
          <div class="t-row">
            <span class="t-label">最终分数</span>
            <a-input-number v-model:value="finalScore" :min="0" :max="maxScore" :step="1" style="width:110px" />
            <span class="t-max">满分 {{ maxScore }}</span>
          </div>
          <div class="t-row t-feedback">
            <span class="t-label">教师评语</span>
            <a-textarea
              v-model:value="teacherFeedback"
              :rows="3"
              placeholder="审核后对学生可见；AI 评语不会自动下发，可点左侧「引用到教师评语」"
            />
          </div>
          <div class="t-actions">
            <span class="t-hint">{{ hintText }}</span>
            <a-button type="primary" :loading="saving" @click="onApprove">{{ status === 'reviewed' || published ? '更新审核' : '审核通过' }}</a-button>
          </div>
        </div>
      </div>
      </Transition>
      </aside>
    </div>

    <button v-if="narrow" type="button" class="wb-drawer-toggle" @click="panelOpen = !panelOpen">
      {{ panelOpen ? '收起评分面板' : '评分面板' }}
    </button>
  </div>

  <!-- AI 提示词（该次评分的实际提示词，含学生工程源码） -->
  <a-modal v-model:open="promptModalOpen" title="AI 提示词（与实评一致，含学生工程源码）" :footer="null" :width="820">
    <a-spin :spinning="promptLoading">
      <template v-if="promptData">
        <div class="prompt-block">
          <div class="prompt-role-label">System（角色设定）</div>
          <pre class="prompt-pre">{{ promptData.system }}</pre>
          <div class="prompt-role-label">User（评分任务，含标准工程与学生提交源码）</div>
          <pre class="prompt-pre">{{ promptData.user }}</pre>
        </div>
      </template>
      <a-empty v-else-if="!promptLoading" description="暂无数据" :image="false" />
    </a-spin>
  </a-modal>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { FileTextOutlined, FolderOutlined } from '@ant-design/icons-vue';
import { getClassWithColor } from 'file-icons-js';
import 'file-icons-js/css/style.css';
import { parseCheckerFeedback } from '../../composables/review/parseCheckerFeedback.js';
import StatusTag from '../../components/StatusTag.vue';
import { useProjectReviewPage } from '../../composables/projectReviewNew/useProjectReviewPage.js';
import { useProjectReviewGrading } from '../../composables/projectReviewNew/useProjectReviewGrading.js';
import { useReviewLayout } from '../../composables/projectReviewNew/useReviewLayout.js';

/**
 * ★R2-B64 / t4：本页 script 446 行 → composables/projectReviewNew/*（data/轮询在 page，评分动作在 grading，
 * 布局在 layout，Monaco 在 workspace，纯函数在 pure）。函数体逐字搬移，行为不变；
 * 模板绑定的名字与拆分前逐一相同 ⇒ <template> 与 <style> 零改动。
 */
const {
  submissionId, submission, aiResult, question, student, displayNo,
  status, statusTone, statusText, published, loaded, loadError,
  aiScore, bestScore, scoreNotice, newSubmitNotice, hintText,
  maxScore, gradingState, finalScore, teacherFeedback, hasStandardFiles, fetchData,
  regrading, startPolling,
  activeTree, editorContainerRef, fileTreeData, openTabs, activePath, defaultExpandedKeys, fading,
  onTreeSelect, onTreeDblclick, switchTab, closeTab,
} = useProjectReviewPage();

const { saving, promptModalOpen, promptLoading, promptData, onApprove, onRegrade, showPrompt, quoteAiComment } =
  useProjectReviewGrading({ submissionId, submission, aiResult, finalScore, teacherFeedback, regrading, gradingState, startPolling, maxScore });

const { narrow, panelOpen, collapsed } = useReviewLayout();

const router = useRouter();
/**
 * ★R2-B47（U-1）：返回落点**确定性** + 兜底。（源 :258-268 逐字未动）
 * 留在 SFC 的原因：server/test/integration/w64-teacher-review-blank.test.js 的 ★W64-3 会从本 SFC **抽取该函数体**
 * 在 sandbox（注入 router）里执行 ⇒ 迁出即破坏该源码契约断言（行为断言本身不变）。
 * 旧实现裸 `$router.back()`：无站内历史（直接打开/新标签页/刷新后）时什么都不做 ⇒ 留在原地像“白屏”。
 * 现在：上一跳仍在复审流内 ⇒ back()（保留来路，含 query 里的 assignmentId）；否则显式回「评分审核」列表。
 */
function goBack() {
  const back = router.options && router.options.history && router.options.history.state
    ? router.options.history.state.back : null;
  if (typeof back === 'string' && back.startsWith('/teacher/review')) router.back();
  else router.push('/teacher/review');
}

/** ★R2-B46：总评视图（留在本页：verify-frontend ⑤ 断言本路由组件必须消费 parseCheckerFeedback；解析语义未改） */
const fbView = computed(() => (aiResult.value && typeof aiResult.value === 'object' ? parseCheckerFeedback(JSON.stringify(aiResult.value)) : null));
const hasSummary = computed(() => !!(fbView.value && fbView.value.kind === 'checker' && fbView.value.summary));
</script>
<style scoped>
.pr-page { display:flex; flex-direction:column; height:calc(100vh - 52px); margin:-28px -48px -40px; background:var(--bg-surface); }
.pr-top { display:flex; align-items:center; gap:12px; padding:10px 20px; background:var(--bg-surface); border-bottom:1px solid var(--border-subtle); flex-shrink:0; }
.pr-title { font-size:var(--fs-title-2); font-weight:700; margin:0; }
.pr-student { font-size:var(--fs-body-sm); color:var(--text-tertiary); flex:1; }

/* IDE 主体（形态取自 ProjectQuestionEdit.vue 的 .ide-body） */
.pr-main { flex:1; display:flex; min-height:0; overflow:hidden; border-top:1px solid var(--border-strong); }

.sidebar { width:260px; flex-shrink:0; background:var(--bg-sunken); border-right:1px solid var(--border-strong); display:flex; flex-direction:column; overflow:hidden; }
.sidebar-title { padding:10px 12px; font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); letter-spacing:.5px; flex-shrink:0; }

/* 数据源切换：只用 tab 头，内容区由下方统一的文件树承载 */
.pr-tree-tabs { flex-shrink:0; }
.pr-tree-tabs :deep(.ant-tabs-nav) { margin:0; padding:0 8px; }
.pr-tree-tabs :deep(.ant-tabs-content-holder) { display:none; }

.file-tree { flex:1; overflow:auto; padding:4px 0; }
.file-tree :deep(.ant-tree) { background:transparent; font-size:var(--fs-body-sm); }
.file-tree :deep(.ant-tree-treenode) { padding:1px 0; white-space:nowrap; }
.file-tree :deep(.ant-tree-node-content-wrapper) { padding:0 6px 0 2px; overflow:hidden; text-overflow:ellipsis; }
.file-tree :deep(.ant-tree-node-content-wrapper:hover) { background:var(--bg-hover); }
.file-tree :deep(.ant-tree-node-content-wrapper.ant-tree-node-selected) { background:var(--bg-active); }
.tree-icon { font-size:var(--fs-body); width:16px; text-align:center; display:inline-block; flex-shrink:0; }
.tree-dir { font-weight:500; }
.tree-file { font-weight:400; }

.editor-area { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }
.tab-bar { display:flex; background:var(--bg-sunken); flex-shrink:0; min-height:35px; height:35px; align-items:flex-end; overflow-x:auto; overflow-y:hidden; }
.tab { display:flex; align-items:center; padding:7px 12px; font-size:var(--fs-caption); cursor:pointer; border-right:1px solid var(--border-strong); background:var(--bg-sunken); white-space:nowrap; min-width:80px; max-width:160px; flex-shrink:0; }
.tab.active { background:var(--bg-surface); border-bottom:2px solid var(--bg-surface); margin-bottom:-2px; }
.tab:hover:not(.active) { background:var(--border-strong); }
.tab-name { flex:1; overflow:hidden; text-overflow:ellipsis; font-size:var(--fs-caption); }
.tab-close { margin-left:6px; font-size:var(--fs-body); color:var(--text-tertiary); line-height:1; }
.tab-close:hover { color:var(--text-primary); }
.tab-bar-fill { flex:1; background:var(--bg-sunken); border-bottom:2px solid var(--bg-sunken); height:35px; }

/* editor-container 常驻挂载，空态以浮层覆盖，保证 Monaco 容器 ref 始终可用 */
.editor-body { flex:1; position:relative; display:flex; min-height:0; overflow:hidden; }
.editor-container { flex:1; overflow:hidden; background:var(--bg-surface); }
.pr-code-empty { position:absolute; top:0; right:0; bottom:0; left:0; background:var(--bg-surface); display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-disabled); gap:12px; }
.pr-code-empty p { margin:0; }

/* ===== 底部评分面板（方案A） ===== */
.pr-panel { flex-shrink:0; background:var(--bg-surface-2); border-top:1px solid var(--border-strong); display:flex; flex-direction:column; }
.panel-header { display:flex; align-items:center; gap:8px; padding:7px 16px; cursor:pointer; user-select:none; font-size:var(--fs-body-sm); color:var(--text-secondary); border-bottom:1px solid var(--border-subtle); }
.panel-header:hover { background:var(--bg-sunken); }
.panel-arrow { font-size:10px; color:var(--text-tertiary); transition:transform var(--duration-base) var(--ease-out); }
.panel-arrow.open { transform:rotate(90deg); }
.panel-title { font-weight:600; color:var(--text-primary); }
.panel-toggle { margin-left:auto; font-size:var(--fs-caption); color:var(--text-tertiary); }
.panel-body { display:flex; height:250px; overflow:hidden; }

/* 面板折叠/展开原生过渡（max-height 匹配 250px 面板高） */
.panel-slide-enter-active, .panel-slide-leave-active { transition: max-height var(--duration-slow) var(--ease-out), opacity var(--duration-slow) var(--ease-out); }
.panel-slide-enter-from, .panel-slide-leave-to { max-height:0; opacity:0; }
.panel-slide-enter-to, .panel-slide-leave-from { max-height:250px; opacity:1; }
.ai-section { flex:1; overflow:auto; padding:12px 16px; border-right:1px solid var(--border-subtle); }
.teacher-section { width:460px; flex-shrink:0; padding:12px 16px; display:flex; flex-direction:column; gap:10px; overflow:auto; }

.ai-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
/* AI 提示词预览 */
.prompt-block { margin-bottom: 12px; }
.prompt-role-label { font-size:var(--fs-caption); font-weight: 600; color: var(--text-secondary); margin: 8px 0 4px; }
.prompt-pre {
  margin: 0; padding: 10px 12px;
  background: var(--bg-sunken); border: 1px solid var(--border-default); border-radius:var(--radius-sm);
  font-size:var(--fs-caption); line-height: 1.6; white-space: pre-wrap; word-break: break-all;
  max-height: 400px; overflow: auto;
}
.ai-score-label { font-size:var(--fs-caption); color:var(--text-tertiary); }
.ai-score-num { font-size:var(--fs-title-1); font-weight:700; color:var(--text-brand); }
/* ★R2-B46：AI 总评（顶部醒目）+ 一行依据 */
.ai-sum-card { border:1px solid var(--border-default); border-left:3px solid var(--color-primary, #1677ff); border-radius:var(--radius-sm); padding:8px 10px; background:var(--bg-sunken); margin-bottom:6px; }
.ai-sum-tag { display:inline-block; font-size:var(--fs-caption); font-weight:600; color:var(--color-primary, #1677ff); margin-bottom:4px; }
.ai-sum-text { margin:0; font-size:var(--fs-body, 13px); line-height:1.7; color:var(--text-primary); white-space:pre-wrap; }
.ai-sum-note { margin:4px 0 0; font-size:var(--fs-caption); color:var(--text-secondary); }
.ai-sum-basis { font-size:var(--fs-caption); color:var(--text-secondary); margin:4px 0 2px; }
.ai-collapse { margin-bottom:6px; }
.ai-collapse :deep(.ant-collapse-item > .ant-collapse-header) { padding:4px 0; font-size:var(--fs-body-sm); color:var(--text-secondary); }
.bd-row { display:flex; gap:10px; font-size:var(--fs-caption); padding:3px 0; border-bottom:1px dashed var(--border-subtle); }
.bd-name { flex:1; color:var(--text-primary); }
.bd-score { color:var(--text-brand); font-weight:600; white-space:nowrap; }
.bd-comment { flex:2; color:var(--text-secondary); }
.hl-list { margin:4px 0; }
.hl-item { font-size:12.5px; padding:2px 0; color:var(--text-primary); }
.hl-item.good { color:var(--status-success-fg); }
.hl-item.issue { color:var(--status-warning-fg); }
.ai-comment { margin-top:8px; padding:8px 10px; background:var(--bg-surface-2); border-radius:var(--radius-sm); border-left:3px solid var(--brand-600); }
.ai-comment-text { font-size:12.5px; line-height:1.7; color:var(--text-primary); white-space:pre-wrap; }
.ai-empty { margin-top:12px; }

/* R3-D1（t4）：审核页提示条（已发布 / 取最高分数错配 / 有新提交）—— 走状态令牌，与全局语义色一致 */
.pr-notice { padding:6px 10px; border-radius:var(--radius-sm); border:1px solid; font-size:var(--fs-caption); line-height:1.6; }
.pr-notice.is-warn { background:var(--status-warning-bg); border-color:var(--status-warning-bd); color:var(--status-warning-fg); }
.pr-notice.is-info { background:var(--status-info-bg); border-color:var(--status-info-bd); color:var(--status-info-fg); }

.t-row { display:flex; align-items:center; gap:8px; }
.t-label { font-size:var(--fs-body-sm); color:var(--text-secondary); width:56px; flex-shrink:0; }
.t-max { font-size:var(--fs-caption); color:var(--text-tertiary); }
.t-feedback { align-items:flex-start; }
.t-actions { display:flex; align-items:center; gap:10px; margin-top:auto; padding-top:8px; }
.t-hint { flex:1; font-size:var(--fs-caption); color:var(--text-tertiary); }

/* ===== 数据源/内容切换动效（0.15s 淡入上移） ===== */
.pr-fade-enter-active { transition: opacity var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out); }
.pr-fade-leave-active { transition: opacity var(--duration-instant) var(--ease-out); }
.pr-fade-enter-from { opacity: 0; transform: translateY(6px); }
.pr-fade-leave-to { opacity: 0; }
.pr-fade-in { animation: prFadeIn var(--duration-fast) var(--ease-out); }
@keyframes prFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
/* ===== Workbench 壳（Wave 3 / 05-page-specs T3）：≥1200px 三栏，<1200px 右栏抽屉 ===== */
.wb-shell { position: relative; }
.wb-body { align-items: stretch; }
.wb-left { flex: 0 0 260px; }
.wb-mid { flex: 1 1 auto; min-width: 0; }
.wb-right {
  flex: 0 0 384px; width: 384px; min-width: 0;
  transition: flex-basis var(--duration-base) var(--ease-out), width var(--duration-base) var(--ease-out);
  background: var(--bg-surface);
  border-top: none; border-left: 1px solid var(--border-default);
  overflow: hidden;
}
/* 折叠：右栏收成 44px 竖条把空间让给查看器（等价于原来「折叠把高度让给查看器」） */
.wb-right.is-collapsed { flex: 0 0 44px; width: 44px; }
.wb-right.is-collapsed .panel-header { flex-direction: column; align-items: center; padding: 10px 6px; }
.wb-right.is-collapsed .panel-header .ant-tag,
.wb-right.is-collapsed .panel-header .panel-title,
.wb-right.is-collapsed .panel-header .panel-toggle { display: none; }
/* 折叠/展开：Vue Transition（.panel-slide-*）+ 列宽过渡，时长与缓动走令牌 */
.panel-slide-enter-active, .panel-slide-leave-active { transition: opacity var(--duration-base) var(--ease-out); }
.panel-slide-enter-from, .panel-slide-leave-to { opacity: 0; }
.panel-header:focus { outline: none; box-shadow: var(--ring-focus); }
/* 384px 栏宽内竖排（纯布局，不改任何交互与请求） */
.wb-right .panel-body { flex: 1; min-height: 0; height: auto; flex-direction: column; overflow-y: auto; }
.wb-right .ai-section { flex: 0 0 auto; width: 100%; border-right: none; border-bottom: 1px solid var(--border-subtle); }
.wb-right .teacher-section { flex: 1 0 auto; width: 100%; }
.wb-drawer-toggle { display: none; }
@media (max-width: 1199px) {
  .wb-right {
    position: fixed; top: var(--layout-topbar-h); right: 0; bottom: 0;
    flex: none; width: 384px; max-width: 92vw; z-index: var(--z-drawer);
    transform: translateX(100%);
    transition: transform var(--duration-base) var(--ease-out);
    box-shadow: var(--shadow-lg);
  }
  .wb-right.open { transform: translateX(0); }
  .wb-right.is-collapsed { flex: none; width: 384px; }
  .wb-right.is-collapsed .panel-header { flex-direction: row; align-items: center; padding: 7px 16px; }
  .wb-right.is-collapsed .panel-header .ant-tag,
  .wb-right.is-collapsed .panel-header .panel-title,
  .wb-right.is-collapsed .panel-header .panel-toggle { display: inline-flex; }
  .wb-drawer-toggle {
    display: inline-flex; align-items: center; gap: var(--space-1);
    position: fixed; right: var(--space-4); bottom: var(--space-4); z-index: var(--z-sticky);
    height: var(--control-h-lg); padding: 0 var(--space-4);
    background: var(--btn-primary-bg); color: var(--btn-primary-fg);
    border: none; border-radius: var(--radius-pill); cursor: pointer;
    font-size: var(--fs-body); box-shadow: var(--shadow-md);
  }
}
</style>
