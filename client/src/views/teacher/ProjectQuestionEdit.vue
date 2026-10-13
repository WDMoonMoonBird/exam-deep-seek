<template>
  <!-- compact 只在教师模式生效：学生作答模式完全维持原状（可见标题 = 题目名、无返回链接、无说明）。
       说明文字按用户要求取消 —— 教师模式那句原本是页头说明，学生模式本来就是空串，故整条 description 不再传 -->
  <FormPage
    :compact="isTeacher"
    :title="isTeacher ? (isEdit ? '编辑实训题' : '新建实训题') : (form.title || '实训题')"
    :back="isTeacher ? { text: '返回题库管理', to: '/teacher/questions' } : null"
  >
    <!-- 基本信息（原页头左组：标题 / 难度 / 满分）+ 教师操作区（2026-10-11 用户要求：操作按钮与左侧题目输入框同一行） -->
    <div class="meta-row">
      <a-space>
        <!-- 教师模式：可编辑 / 学生模式：只读 -->
        <a-input v-if="isTeacher" v-model:value="form.title" :placeholder="isEdit?'编辑实训题':'新建实训题'" style="width:260px;font-size:var(--fs-title-2);font-weight:700;" />
        <span v-else style="font-size:var(--fs-title-2);font-weight:700;">{{ form.title || '实训题' }}</span>
        <a-tag class="tag-warning" size="small" style="margin:0;">BETA</a-tag>

        <a-select v-if="isTeacher" v-model:value="form.difficulty" style="width:100px;">
          <a-select-option value="easy">简单</a-select-option>
          <a-select-option value="medium">中等</a-select-option>
          <a-select-option value="hard">困难</a-select-option>
        </a-select>
        <a-tag v-else :color="form.difficulty==='easy'?'green':form.difficulty==='hard'?'red':'orange'" :class="difficultyTagClass">
          {{ form.difficulty === 'easy' ? '简单' : form.difficulty === 'hard' ? '困难' : '中等' }}
        </a-tag>

        <span style="font-size:var(--fs-body);color:var(--text-tertiary);white-space:nowrap;">满分</span>
        <a-input-number v-if="isTeacher" v-model:value="form.maxScore" :min="1" :step="5" style="width:80px;" />
        <span v-else style="font-weight:700;color:var(--text-brand);">{{ form.maxScore }} 分</span>
      </a-space>

      <!-- 教师操作区：与上方题目输入框同一行、右对齐（margin-left:auto）。窄屏由 .meta-row 的
           flex-wrap 自动换行，不挤压输入框。学生模式不渲染这一组（其「提交答案」仍走页头 #actions）。 -->
      <div v-if="isTeacher" class="meta-actions">
        <a-button @click="openDescModal">题目描述</a-button>
        <a-button @click="openRubricModal">评分标准</a-button>
      <!-- 自动评分器入口（来自 feature/rule-driven-scoring）：首次合并（f7a03fc）解冲突时该块被整块漏掉 ✗，
           2026-10-10 由验收判据④（走查 button 自动评分器 count=0）发现并补回 ✓
           迁移：分支原有的硬编码成功色（十六进制写法）已改为 var(--status-success-fg)，保持本文件去注释后 hex=0；
           保留 color="red"（实测亮 5.07 / 暗 4.54 达标，按既有规则只改不达标的预置色） -->
      <!-- 自动评分器入口按钮：2026-10-11 按用户要求【暂时取消】（恢复：把 FEATURE_CHECKER_ENTRY 改回 true） -->
      <span v-if="isTeacher && isEdit && FEATURE_CHECKER_ENTRY" class="checker-btn-wrap">
        <a-button @click="openCheckerModal" :disabled="checkerStatus === 'generating' || checkerStatus === 'calibrating'">
          <template v-if="checkerStatus === 'ready'"><CheckCircleFilled style="color:var(--status-success-fg);margin-right:6px;" />自动评分器</template>
          <template v-else-if="checkerStatus === 'generating' || checkerStatus === 'calibrating'"><LoadingOutlined spin style="margin-right:6px;" />自动评分器生成中…</template>
          <template v-else>自动评分器</template>
        </a-button>
        <a-tag v-if="checkerStatus === 'failed'" color="red" size="small" style="margin:0;">评分器生成失败</a-tag>
      </span>
        <a-button v-if="isEdit" @click="showPromptPreview">查看 AI 提示词</a-button>
        <a-button type="primary" @click="handleSave">保存</a-button>
      </div>
    </div>

    <!-- 学生模式的操作区仍留在页头右上（教师模式的操作区已并入上面的 .meta-row） -->
    <template v-if="!isTeacher" #actions>
      <!-- R2-CAP（学生端可见性修复）：此前「题目描述 / 评分标准」两个入口被放在 isTeacher 分支的
           .meta-actions 里 ⇒ 学生模式整块不渲染，学生看不到题面与评分标准；而两个模态框早已支持
           学生只读（readonly-desc / readonly-rubric），且数据由 student 接口的 question.material /
           question.scoringRubric 提供（见 useLoadQuestion 学生分支）⇒ 此处为学生补齐入口。 -->
      <a-button @click="openDescModal">题目描述</a-button>
      <a-button @click="openRubricModal">评分标准</a-button>
      <a-button type="primary" :disabled="!hasUploaded || submitting || (isStudent && studentSubmission && studentSubmission.status !== 'draft')" :loading="submitting" @click="handleSubmit">
        {{ submitting ? '提交中...' : '提交答案' }}
      </a-button>
    </template>

    <!-- 题目描述模态框 -->
    <a-modal v-model:open="showDescModal" :title="isTeacher ? '题目描述' : '题目描述（只读）'" :width="820" wrap-class-name="desc-modal">
      <RichEditor v-if="isTeacher" v-model="descDraft" placeholder="请输入题目描述，说明项目要实现的功能和目标" />
      <div v-else class="readonly-desc" v-html="safeDescriptionHtml"></div>
      <template #footer>
        <a-button v-if="!isTeacher" @click="showDescModal = false">关闭</a-button>
        <template v-else>
          <a-button @click="showDescModal = false">取消</a-button>
          <a-button type="primary" @click="confirmDesc">保存描述</a-button>
        </template>
      </template>
    </a-modal>

    <!-- 评分标准模态框 -->
    <a-modal v-model:open="showRubricModal" :title="isTeacher ? '评分标准' : '评分标准（只读）'" :width="640">
      <a-textarea v-if="isTeacher" v-model:value="rubricDraft" :rows="12" placeholder="建议逐条写明必须完成的功能并注明分值，AI 会逐条核对。" />
      <div v-else class="readonly-rubric">{{ form.scoringRubric || '未填写，使用默认标准：功能完整性50% + 代码规范25% + 健壮性25%' }}</div>
      <div v-if="isTeacher" style="margin-top:8px;font-size:var(--fs-caption);color:var(--text-tertiary);">不填写则使用默认标准：功能完整性50% + 代码规范25% + 健壮性25%</div>
      <template #footer>
        <a-button v-if="!isTeacher" @click="showRubricModal = false">关闭</a-button>
        <template v-else>
          <a-button @click="showRubricModal = false">取消</a-button>
          <a-button type="primary" @click="confirmRubric">保存评分标准</a-button>
        </template>
      </template>
    </a-modal>

    <!-- AI 提示词预览（编辑页模板：有标准包时展示标准包真实内容；开放性题目无标准答案段，学生代码占位） -->
    <a-modal v-model:open="promptModalOpen" title="AI 提示词（与实评一致，学生代码以占位符显示）" :footer="null" :width="820">
      <a-spin :spinning="promptLoading">
        <template v-if="promptPreview">
          <div class="prompt-block">
            <div class="prompt-role-label">System（角色设定）</div>
            <pre class="prompt-pre">{{ promptPreview.system }}</pre>
            <div class="prompt-role-label">User（评分任务，{{ promptUserPartLabel }}）</div>
            <pre class="prompt-pre">{{ promptPreview.user }}</pre>
          </div>
        </template>
        <a-empty v-else-if="!promptLoading" description="暂无数据" :image="false" />
      </a-spin>
    </a-modal>
    <!-- 自动评分器模态框（§十一 界面改造：三步向导，原型阶段 mock=true）
         交互规则：右上角 X 始终可关闭（生成/校准/确认阶段右下角均无按钮）；
         ESC 仅在非生成阶段可用，遮罩点击始终不可关；完成阶段右下角为「完成」；
         内容超高时滚动条在弹窗体内滚动 -->
    <a-modal
      v-model:open="checkerOpen"
      title="自动评分器"
      width="880px"
      :closable="true"
      :mask-closable="false"
      :keyboard="checkerCanClose"
      :body-style="{ maxHeight: '68vh', overflowY: 'auto' }"
      :footer="checkerStatus === 'ready' ? undefined : null"
    >
      <CheckerWizard
        :question-id="route.params.id"
        :max-score="form.maxScore || 100"
        :mock="false"
        :project-tree="externalTree"
        @status-change="onCheckerStatusChange"
        @confirm="() => (checkerOpen = false)"
      />
      <!-- 仅完成阶段显示「完成」；其余阶段 footer 整体隐藏（无按钮、无空白条），关闭只靠右上角 X -->
      <template v-if="checkerStatus === 'ready'" #footer>
        <a-button type="primary" @click="checkerOpen = false">完成</a-button>
      </template>
    </a-modal>

    <!-- 学生端：成绩卡片（实训题专用，R4 成绩唯一开关；未出分时仅显示提交状态） -->
    <div v-if="isStudent && studentSubmission" class="student-score-card" :class="{ pending: !canStudentSeeScoreNow }">
      <div class="ssc-head">
        <span class="ssc-status" :class="studentStatusType">{{ studentStatusText }}</span>
        <span v-if="studentSubmission.submittedAt" class="ssc-time">提交于 {{ formatSubmitTime(studentSubmission.submittedAt) }}</span>
      </div>
      <div class="ssc-body">
        <template v-if="canStudentSeeScoreNow">
          <div class="ssc-score">
            <span class="ssc-score-num">{{ studentSubmission.score ?? '—' }}</span>
            <span class="ssc-score-max">/ {{ form.maxScore }} 分</span>
          </div>
          <div class="ssc-feedback">
            <div class="ssc-feedback-label">教师评语</div>
            <div v-if="studentSubmission.feedback" class="ssc-feedback-text">{{ studentSubmission.feedback }}</div>
            <div v-else class="ssc-feedback-empty">教师未填写评语</div>
          </div>
        </template>
        <div v-else class="ssc-pending-hint">
          <LoadingOutlined v-if="studentSubmission.status === 'submitted'" spin />
          <span>评分完成后将在此显示成绩</span>
        </div>
      </div>
    </div>

    <!-- 阶段切换（还原封装前布局）：未上传 = 整页居中圆形按钮；已上传 = 文件树 + Monaco -->
    <Transition name="kind-pick-switch" mode="out-in">
      <!-- 阶段一：整页居中上传入口（圆形按钮 + 提示） -->
      <div v-if="!hasUploaded" key="picker" class="ide-stage" :class="{ 'ide-stage--compact': isTeacher }">
        <div class="picker-slot">
          <ProjectZipUploader
            :hint="isTeacher ? '点击上传标准工程包' : '点击上传项目文件'"
            v-model:package="form.packageFile"
            @ready="onZipReady"
            @error="(m) => message.error(m)"
          />
        </div>
        <!-- 开放性实训题说明（仅教师视角；学生端不显示） -->
        <p v-if="isTeacher" class="open-project-hint">
          本项可选：不上传标准工程包即为开放性题目 —— AI 将只依据上方评分标准对学生工程做评价式评分，不与参考答案对比。建议在评分标准中逐条写明必须完成的功能及分值。
        </p>
      </div>

      <!-- 阶段二：VSCode 风格 IDE（左文件树 + 右 Monaco） -->
      <div v-else key="editor" class="ide-stage" :class="{ 'ide-stage--compact': isTeacher }">
        <div class="ide-body">
          <div class="sidebar">
            <ProjectZipUploader
              :tree-data="externalTree"
              @select="onZipSelect"
            />
          </div>
          <div class="editor-area">
            <div class="tab-bar" v-if="openTabs.length">
              <div v-for="tab in openTabs" :key="tab.path" :class="['tab', { active: activePath === tab.path }]" @click="switchTab(tab.path)">
                <span class="tab-name">{{ tab.name }}</span>
                <span class="tab-close" @click.stop="closeTab(tab.path)">×</span>
              </div>
              <div class="tab-bar-fill"></div>
            </div>
            <div class="editor-body">
              <div class="editor-container" ref="editorContainerRef" :class="{ 'pr-fade-in': fading }"></div>
              <div v-if="!openTabs.length" class="editor-empty">
                <FileTextOutlined style="font-size:48px;color:var(--border-strong)" />
                <p>从左侧选择文件查看代码</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </FormPage>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { message } from 'ant-design-vue';
import { LoadingOutlined, FileTextOutlined, CheckCircleFilled } from '@ant-design/icons-vue';
import RichEditor from '../../components/RichEditor.vue';
import ProjectZipUploader from '../../components/ProjectZipUploader.vue';
import FormPage from '../../components/FormPage.vue';
import CheckerWizard from '../../components/checker/CheckerWizard.vue';
import { useProjectQuestionPage } from '../../composables/project/useProjectQuestionPage.js';

const props = defineProps({ mode: { type: String, default: 'teacher' } });

// 模板可见的 44 个名字 + 2 个生命周期回调体（接线根逐名解构；defineProps 必须留在 .vue）
const {
  // 模式 / 接线根
  isTeacher, isStudent, isEdit, submitting, editorContainerRef, route,
  // W2 编辑器工作区
  activePath, externalTree, openTabs, fading, switchTab, closeTab,
  // W6 form / 模态草稿
  form, difficultyTagClass, safeDescriptionHtml, showDescModal, showRubricModal,
  descDraft, rubricDraft, openDescModal, openRubricModal, confirmDesc, confirmRubric,
  // W4 checker + 提示词预览（FEATURE_CHECKER_ENTRY 用于模板 :38 的开关判定）
  FEATURE_CHECKER_ENTRY, checkerOpen, checkerStatus, checkerCanClose,
  onCheckerStatusChange, openCheckerModal, promptModalOpen, promptLoading,
  promptPreview, promptUserPartLabel, showPromptPreview,
  // W5 上传回调
  hasUploaded, onZipReady, onZipSelect,
  // W3 学生提交 / 成绩卡片
  studentSubmission, canStudentSeeScoreNow, studentStatusText, studentStatusType,
  formatSubmitTime, handleSubmit,
  // W7 保存
  handleSave,
  // 生命周期回调体（在 W9 内定义，本文件只注册一次）
  onPageMounted, disposePage,
} = useProjectQuestionPage(props);

onMounted(onPageMounted);
onBeforeUnmount(disposePage);
</script>

<style scoped>
.meta-row { display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-3); flex-wrap:wrap; }
/* 教师操作区：靠 margin-left:auto 推到行尾，与左侧题目输入框同一行（align-items 由父级统一居中） */
.meta-actions { margin-left:auto; display:flex; align-items:center; gap:var(--space-2); flex-shrink:0; }

.kind-pick-switch-enter-active,.kind-pick-switch-leave-active { transition: var(--transition-surface); }
.kind-pick-switch-enter-from,.kind-pick-switch-leave-to { opacity:0; transform:scale(.9); }

.kind-picker { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; }
.kind-add-btn { width:56px; height:56px; border-radius:50%; border:2px dashed var(--border-strong); background:var(--bg-surface-2); font-size:24px; color:var(--text-tertiary); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all var(--duration-base); }
.kind-add-btn:hover { border-color:var(--brand-600); color:var(--text-brand); background:var(--bg-selected); }
.kind-add-btn:disabled { cursor:not-allowed; opacity:.8; animation:upload-pulse var(--duration-loop-pulse) ease-in-out infinite; }
@keyframes upload-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
.kind-hint { font-size:var(--fs-body-sm); color:var(--text-tertiary); transition:color var(--duration-base); }

/* 学生端成绩卡片（实训题专用） */
.student-score-card { margin-bottom:12px; flex-shrink:0; border:1px solid var(--border-default); border-radius:var(--radius-md); background:var(--bg-surface); overflow:hidden; }
.student-score-card.pending { border-color:var(--border-subtle); }
.ssc-head { display:flex; align-items:center; gap:10px; padding:8px 14px; background:var(--bg-surface-2); border-bottom:1px solid var(--border-subtle); }
.ssc-status { font-weight:600; font-size:var(--fs-body-sm); }
.ssc-status.success { color:var(--status-success-fg); }
.ssc-status.info { color:var(--text-brand); }
.ssc-status.default { color:var(--text-tertiary); }
.ssc-time { margin-left:auto; font-size:var(--fs-caption); color:var(--text-tertiary); }
.ssc-body { display:flex; align-items:flex-start; padding:14px 16px; gap:20px; }
.ssc-score { display:flex; align-items:baseline; gap:4px; padding-right:20px; border-right:1px solid var(--border-subtle); min-width:110px; }
.ssc-score-num { font-size:var(--fs-display-1); font-weight:700; color:var(--text-brand); line-height:1; }
.ssc-score-max { font-size:var(--fs-body-sm); color:var(--text-tertiary); }
.ssc-feedback { flex:1; min-width:0; }
.ssc-feedback-label { font-size:var(--fs-caption); color:var(--text-tertiary); margin-bottom:4px; }
.ssc-feedback-text { font-size:var(--fs-body-sm); line-height:1.7; color:var(--text-primary); white-space:pre-wrap; }
.ssc-feedback-empty { font-size:var(--fs-body-sm); color:var(--text-disabled); }
.ssc-pending-hint { display:flex; align-items:center; gap:8px; font-size:var(--fs-body-sm); color:var(--text-tertiary); padding:6px 0; }

/* 工作区高度：视口 − 顶栏(56) − 内容内距(上 24 / 下 40) − 页头 − 基本信息行 − 间隙。
   300 是按**改版前的页头**（返回条 32 + 12 + 标题 30 + 说明 22 + 20 ≈ 116px）标定的；
   教师模式页头已 compact 化（实测少占 76px → 单行 32 + 12 边距），故常量由 300 收到 214：
   把省下的高度连同原来的 10px 呼吸一并还给代码区（实测：改前 600px 高、离底 126px；
   224 → 676px、离底 50px；再收到 214 → 686px、离底 40px = 恰好贴住内容区的下内距，不再留呼吸带）。
   注意方向：常量越小、代码区越高（height = 100vh − N）。
   学生作答模式页头未改（无返回条、标题可见），沿用 300。 */
.ide-stage { height:calc(100vh - 300px); min-height:480px; display:flex; flex-direction:column; overflow:hidden; }
.ide-stage--compact { height:calc(100vh - 182px); }
.picker-slot { flex:1; display:flex; flex-direction:column; min-height:0; }
/* 开放性实训题说明（仅教师视角）：居中灰字，不挤压上传入口 */
.open-project-hint { flex-shrink:0; margin:0 auto 20px; padding:0 24px; max-width:760px; font-size:var(--fs-body-sm); line-height:1.8; color:var(--text-tertiary); text-align:center; }
.ide-body { flex:1; display:flex; overflow:hidden; min-height:0; border:1px solid var(--border-strong); border-radius:var(--radius-xs); }

.sidebar { width:260px; flex-shrink:0; background:var(--bg-sunken); border-right:1px solid var(--border-strong); display:flex; flex-direction:column; overflow:hidden; }
.sidebar-title { padding:10px 12px; font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); letter-spacing:.5px; flex-shrink:0; }
.file-tree { flex:1; overflow-y:auto; padding:4px 0; }
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
.editor-body { flex:1; position:relative; display:flex; min-height:0; overflow:hidden; }
  .editor-container { flex:1; overflow:hidden; background:var(--bg-surface); }
.editor-empty { position:absolute; top:0; right:0; bottom:0; left:0; background:var(--bg-surface); display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-disabled); gap:12px; }
.editor-empty p { margin:0; }

.readonly-desc { padding: 12px; min-height: 200px; font-size:var(--fs-body); line-height: 1.8; }
.readonly-rubric { padding: 12px; min-height: 100px; font-size:var(--fs-body); line-height: 2; white-space: pre-wrap; }

/* AI 提示词预览 */
.prompt-block { margin-bottom: 12px; }
.prompt-role-label { font-size:var(--fs-caption); font-weight: 600; color: var(--text-secondary); margin: 8px 0 4px; }
.prompt-pre {
  margin: 0; padding: 10px 12px;
  background: var(--bg-sunken); border: 1px solid var(--border-default); border-radius:var(--radius-sm);
  font-size:var(--fs-caption); line-height: 1.6; white-space: pre-wrap; word-break: break-all;
  max-height: 400px; overflow: auto;
}

/* 自动评分器（checker） */
.checker-btn-wrap { display: inline-flex; align-items: center; gap: 6px; }
.checker-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.8; margin: 0; }
.checker-actions { text-align: center; margin-top: 16px; }
.checker-generating { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 18px 0; font-size: 14px; color: var(--text-secondary); }
.checker-log-list { max-height: 260px; overflow-y: auto; border: 1px solid var(--border-default); border-radius: 6px; padding: 8px 12px; background: var(--bg-sunken); margin-top: 14px; }
.checker-log-item { font-size: 13px; line-height: 1.9; color: var(--text-primary); }
.checker-ready { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; background: var(--status-success-bg); border: 1px solid var(--status-success-bd); border-radius: 6px; color: var(--status-success-fg); font-size: 13px; margin-bottom: 12px; }
.checker-ready .anticon { margin-top: 3px; }
.checker-script-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.checker-script-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }

.grade-result { padding: 8px 0; }
.grade-total { font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 16px; }
.grade-total span { color: var(--text-brand); }
.grade-breakdown { margin-bottom: 12px; }
.grade-item { padding: 10px 12px; background: var(--bg-surface-2); border-radius:var(--radius-sm); margin-bottom: 8px; }
.grade-item-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.grade-item-name { font-weight: 600; font-size:var(--fs-body); }
.grade-item-score { color: var(--text-brand); font-weight: 700; font-size:var(--fs-body); }
.grade-item-comment { font-size:var(--fs-body-sm); color: var(--text-secondary); }
.grade-highlights { font-size:var(--fs-body-sm); color: var(--status-success-fg); margin-bottom: 8px; }
.grade-issues { font-size:var(--fs-body-sm); color: var(--status-danger-fg); margin-bottom: 8px; }
.grade-overall { font-size:var(--fs-body-sm); color: var(--text-primary); padding: 10px; background: var(--status-success-bg); border-radius:var(--radius-sm); margin-top: 8px; }
</style>

<style>
.desc-modal .ProseMirror { min-height:420px; }

/* ===== 代码预览切换动效（0.15s 淡入上移） ===== */
.pr-fade-in { animation: prFadeIn var(--duration-fast) var(--ease-out); }
@keyframes prFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
</style>
