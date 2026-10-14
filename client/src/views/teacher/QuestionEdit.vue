<template>
  <!-- compact：标题与说明不再可见（标题仍渲染为视觉隐藏，供 Layout 的页内标题镜像与无障碍语义用），
       返回按钮并入页头行；说明文字按用户要求取消，故不再传 description -->
  <FormPage
    compact
    :title="isEdit ? '编辑题目' : '新建题目'"
    :back="{ text: '返回题库管理', to: '/teacher/questions' }"
  >
    <!-- ★W6（t8/F1）：加载失败（题目不存在 / 非所有者）⇒ **常驻空态** + 返回出口。
         修前：只弹 3 秒 toast，页面停在"空白可编辑表单"（总分 0、还能点选题型）——
         即 useLoadQuestion 的 loadError 到不了渲染层（死代码）。空态写法复用本文件既有 a-empty 风格。 -->
    <a-empty v-if="loadError" class="qe-load-error" :image="false">
      <template #description>
        <p class="qe-load-error-title">题目不存在或无权编辑</p>
        <p class="qe-load-error-desc">该题目可能已被删除，或不属于当前账号；请返回题库管理重新选择。</p>
      </template>
      <a-button type="primary" @click="backToQuestions">返回题库管理</a-button>
    </a-empty>

    <template v-else>
    <div class="lc-page-inner">
      <!-- 顶部基本信息 -->
      <div class="lc-top">
        <a-form layout="inline" :model="form">
          <a-form-item><a-input v-model:value="form.title" placeholder="大题标题" style="width:260px;font-size:var(--fs-title-2);font-weight:700;" /></a-form-item>
          <!-- T5-A2：本下拉在 a-form-item 内没有可见 label，antd 自动 id #rc_select_N 的可访问名称为空
               （axe label 规则 critical，实测 AX name = ""，见 tests/ui-redesign-verify/b2-contrast/raw/{before,after}.json 的 Qname 用例）。
               实测 antd 会把 aria-label 渲染到外层 .ant-select div（落不到 role=combobox 的 input），
               故按 t7 处理其余 10 页的同一做法：视觉隐藏 label + for/id 关联（不是 aria-label 糊）。 -->
          <a-form-item>
            <label for="q-difficulty" class="visually-hidden">题目难度</label>
            <a-select id="q-difficulty" v-model:value="form.difficulty" style="width:100px;">
              <a-select-option value="easy">简单</a-select-option>
              <a-select-option value="medium">中等</a-select-option>
              <a-select-option value="hard">困难</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="总分">
            <span style="font-size:var(--fs-title-3);font-weight:700;color:var(--text-brand);">{{computedMaxScore}} 分</span>
          </a-form-item>
          <a-form-item>
            <a-button @click="showUploadExam = true" size="small">上传试卷</a-button>
            <a-button @click="showSettings = true" size="small" style="margin-left:6px;">设置</a-button>
          </a-form-item>
        </a-form>
      </div>

      <!-- 底部 -->
      <div class="lc-main" :style="{ '--slide-dir': slideDir }">
        <div class="lc-left">

          <!-- 初始：选择题型 / 已选择题型 -->
          <Transition name="kind-pick-switch" mode="out-in">
            <div v-if="!questionKind" key="picker" class="kind-picker">
              <a-dropdown :trigger="['click']">
                <button class="kind-add-btn">+</button>
                <template #overlay>
                  <a-menu @click="onPickKind">
                    <a-menu-item key="subjective">主观题</a-menu-item>
                    <a-menu-item key="objective">客观题</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
              <p class="kind-hint">点击选择题目类型</p>
            </div>
            <div v-else key="editor" class="lc-left-editor">
            <!-- 材料 -->
            <div class="material-toggle" @click="showMaterial = !showMaterial">
              <span>题目材料</span>
              <a-tag v-if="hasMaterial" color="blue" size="small">已填写</a-tag>
              <a-tag v-else size="small" style="color:var(--text-tertiary);border-color:var(--border-strong);">未填写</a-tag>
              <span class="material-arrow" :class="{ open: showMaterial }">▼</span>
            </div>
            <Transition name="collapse">
              <div v-if="showMaterial" class="material-body"><div class="material-body-inner">
                <a-form layout="vertical"><a-form-item><RichEditor v-model="form.material" placeholder="题目材料（选填）" /></a-form-item></a-form>
              </div></div>
            </Transition>

            <!-- 小题标签 -->
            <div class="lc-left-tabs">
              <button class="tab-scroll-btn" @click="scrollTabs(-1)" :style="{visibility:canScrollLeft?'visible':'hidden'}">‹</button>
              <div ref="tabsScrollRef" class="lc-left-tabs-scroll" @scroll="onTabsScroll">
              <TransitionGroup name="sq-list">
                <span v-for="(sq, i) in subQuestions" :key="sq._key" :class="['sq-tab',{active:activeIndex===i}]" @click="switchTo(i)">
                  {{sqDisplayLabel(sq,i)}}
                  <a-popconfirm v-if="subQuestions.length>1" title="确认删除该小题？" description="该小题的题干与答案将一并移除，不可撤销。" ok-text="删除小题" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="removeSub(i)">
                    <span class="sq-del" @click.stop>×</span>
                  </a-popconfirm>
                </span>
              </TransitionGroup>
              <a-dropdown :trigger="['click']">
                <button class="sq-tab sq-add" title="添加小题">+</button>
                <template #overlay>
                  <a-menu @click="addSub">
                    <template v-if="objectiveSettings.classificationMode==='flat'">
                      <a-menu-item key="choice">单选题</a-menu-item>
                      <a-menu-item key="multi_choice">多选题</a-menu-item>
                      <a-menu-item key="judge">判断题</a-menu-item>
                      <a-menu-item key="fill">填空题</a-menu-item>
                    </template>
                    <a-menu-item key="subjective">主观题</a-menu-item>
                    <template v-if="objectiveSettings.classificationMode!=='flat'">
                      <a-menu-item key="objective">客观题</a-menu-item>
                    </template>
                  </a-menu>
                </template>
              </a-dropdown>
              </div>
              <button class="tab-scroll-btn" @click="scrollTabs(1)" :style="{visibility:canScrollRight?'visible':'hidden'}">›</button>
            </div>

            <div class="lc-left-body">
              <Transition name="panel-switch" mode="out-in">
              <div :key="activeIndex" class="panel-wrap">

                <!-- ===== 主观题：原始编辑页 ===== -->
                <template v-if="sqKind==='subjective'">
                  <a-form layout="vertical" :model="form">
                    <a-row :gutter="16">
                      <a-col :span="16">
                        <a-form-item><a-input v-model:value="form.sqTitle" placeholder="小题标题（选填）" style="font-size:var(--fs-body-sm);" /></a-form-item>
                      </a-col>
                      <a-col :span="8">
                        <a-form-item><a-input-number v-model:value="form.sqScore" :min="0" :step="0.5" placeholder="分值" style="width:100%;font-size:var(--fs-body-sm);" /></a-form-item>
                      </a-col>
                    </a-row>
                    <a-form-item class="content-item">
                      <RichEditor v-model="form.content" placeholder="请输入题目描述（支持富文本）" />
                    </a-form-item>
                    <a-form-item>
                      <a-textarea v-model:value="form.scoringCriteria" :rows="3" placeholder="评分标准（若不填写，将使用默认标准：代码正确性60% + 代码效率20% + 代码可读性20%）" />
                    </a-form-item>
                  </a-form>
                </template>

                <!-- ===== 客观题：items 编辑器 ===== -->
                <template v-else>
                  <div class="obj-add-bar">
                    <!-- flat 有 items: 自动按当前题型添加；flat 无 items / group: 下拉选题型 -->
                    <a-button v-if="objectiveSettings.classificationMode==='flat'&&currentFlatItemType" size="small" type="dashed" @click="onAddItem({key:currentFlatItemType})">+ 添加小问</a-button>
                    <a-dropdown v-else :trigger="['click']">
                      <a-button size="small" type="dashed">+ 添加小问</a-button>
                      <template #overlay><a-menu @click="onAddItem"><a-menu-item key="choice">单选题</a-menu-item><a-menu-item key="multi_choice">多选题</a-menu-item><a-menu-item key="judge">判断题</a-menu-item><a-menu-item key="fill">填空题</a-menu-item></a-menu></template>
                    </a-dropdown>
                    <span v-if="form.objectiveItems.length" style="font-size:var(--fs-caption);color:var(--text-tertiary);">共 {{form.objectiveItems.length}} 小问</span>
                    <span style="font-size:var(--fs-body);font-weight:600;color:var(--text-brand);margin-left:auto;">小题 {{computedObjSqScore}} 分</span>
                  </div>
                  <div class="obj-items-scroll">
                    <TransitionGroup name="item-list" tag="div" class="obj-items-list">
                      <div v-for="(item,idx) in form.objectiveItems" :key="item.key" :class="['obj-item-card',{'obj-item-focus':previewFocusKey===item.key}]" @click="onEditCardClick(item.key,$event)">
                        <div class="obj-item-head">
                          <a-tag :color="itemTypeColor(item.type)" :class="itemTypeTagClass(item.type)" size="small">{{itemTypeLabel(item.type)}}</a-tag>
                          <span style="font-size:var(--fs-caption);color:var(--text-tertiary);">第{{idx+1}}小问</span>
                          <a-input-number v-model:value="item.score" :min="0" :step="0.01" :precision="2" placeholder="均分" size="small" style="width:70px;margin-left:auto;" @change="onItemScoreChange(item)" />分
                          <a-popconfirm title="确认删除该小问？" description="该小问的题干与选项将一并移除，不可撤销。" ok-text="删除小问" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="removeItem(idx)"><a-button size="small" type="text" danger aria-label="删除小问" @click.stop>×</a-button></a-popconfirm>
                        </div>
                        <a-textarea v-model:value="item.stem" :rows="2" placeholder="题干" size="small" :style="{fontFamily:isCodeStem(item.stem)?'monospace':'inherit'}" />
                        <div v-if="item.type==='choice'||item.type==='multi_choice'" class="obj-options">
                          <TransitionGroup name="opt-list" tag="div">
                            <div v-for="(opt,oi) in item.options" :key="opt.key" class="obj-option-row">
                              <a-radio v-if="item.type==='choice'" :checked="item.answer===opt.key" @change="item.answer=opt.key" />
                              <a-checkbox v-else :checked="(item.answer||'').split(',').includes(opt.key)" @change="toggleMultiAnswer(item,opt.key)" />
                              <span style="font-weight:600;font-size:var(--fs-body-sm);width:18px;">{{opt.key}}.</span>
                              <a-input v-model:value="opt.text" :placeholder="'选项 '+opt.key" size="small" style="flex:1" />
                              <a-button size="small" type="text" danger aria-label="删除选项" @click="removeOption(item,oi)" :disabled="item.options.length<=2">×</a-button>
                            </div>
                          </TransitionGroup>
                          <a-button size="small" type="link" @click="addItemOption(item)" :disabled="item.options.length>=8">+ 添加选项</a-button>
                        </div>
                        <div v-if="item.type==='judge'" style="margin-top:6px"><a-radio-group v-model:value="item.answer" size="small"><a-radio value="true">✓ 正确</a-radio><a-radio value="false">✗ 错误</a-radio></a-radio-group></div>
                        <div v-if="item.type==='fill'" style="margin-top:6px">
                          <div v-for="(bp, bi) in (item._blankParts||[])" :key="bi" style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                            <span style="font-size:11px;color:var(--text-tertiary);min-width:50px;">第{{bi+1}}空答案</span>
                            <a-input v-model:value="bp.answer" @change="onFillBlankChange(item)" :placeholder="'第'+(bi+1)+'空'" size="small" style="flex:1;" />
                          </div>
                          <div v-if="!(item._blankParts||[]).length" style="font-size:11px;color:var(--text-disabled);">请填写题干，系统自动识别空数</div>
                        </div>
                      </div>
                    </TransitionGroup>
                    <a-empty v-if="!form.objectiveItems.length" description="点击上方添加小问" :image="false" style="margin-top:32px" />
                  </div>
                </template>
              </div>
              </Transition>
            </div>
            </div>
          </Transition>
        </div>

        <!-- 右 -->
        <div class="lc-right">
          <Transition name="kind-pick-switch" mode="out-in">
            <div v-if="!questionKind" key="empty" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:var(--fs-body);">选择题目类型后开始编辑</div>
            <div v-else key="editor" class="lc-right-inner">
            <Transition name="panel-switch" mode="out-in">
              <div :key="activeIndex + '_' + sqKind" style="flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;">
                <!-- 主观题：参考答案 CodeEditor -->
                <template v-if="sqKind==='subjective'">
                  <div class="lc-editor-header">
                    <span class="lc-editor-label"><CodeOutlined /> 参考答案</span>
                    <a-tag color="blue" style="margin-left:6px;">第 {{activeIndex+1}} 小题</a-tag>
                    <a-tag v-if="aiTag" class="tag-warning" style="margin-left:4px;font-size:11px;">{{aiTag}}</a-tag>
                    <div class="lc-editor-actions">
                      <a-select v-model:value="form.language" size="small" style="width:120px;"><a-select-option v-for="l in langs" :key="l" :value="l">{{l}}</a-select-option></a-select>
                      <a-button size="small" type="text" @click="formatCode" title="格式化代码">
                        <template #icon><span style="font-size:var(--fs-body);">&#x26A1;</span></template>
                      </a-button>
                    </div>
                  </div>
                  <div class="lc-editor-wrap">
                    <CodeEditor ref="codeEditorRef" v-model="form.referenceAnswer" :language="form.language" :height="0" />
                  </div>
                </template>
                <!-- 客观题：实时预览 -->
                <template v-else>
                  <div class="lc-editor-header">
                    <span class="lc-editor-label">实时预览</span>
                    <a-tag color="blue" style="margin-left:6px;">第 {{activeIndex+1}} 小题</a-tag>
                  </div>
                  <div class="lc-editor-wrap preview-scroll">
                    <div v-if="form.objectiveItems.length" class="preview-obj-list">
                      <div v-for="(item,idx) in form.objectiveItems" :key="item.key" :id="'preview-'+item.key" :class="['preview-obj-item',{'preview-obj-highlight':previewFocusKey===item.key}]">
                        <div class="preview-obj-num">{{idx+1}}. <a-tag :color="itemTypeColor(item.type)" :class="itemTypeTagClass(item.type)" size="small" style="font-size:10px;">{{itemTypeLabel(item.type)}}</a-tag></div>
                        <div class="preview-stem" :class="{'preview-stem-code':isCodeStem(item.stem)}">{{item.stem||'(待填写)'}}</div>
                        <div v-if="item.type==='choice'" class="preview-choice"><a-radio-group :value="item.answer" disabled style="display:flex;flex-direction:column;gap:4px;"><a-radio v-for="opt in item.options" :key="opt.key" :value="opt.key" disabled>{{opt.key}}. {{opt.text||'(待填写)'}}</a-radio></a-radio-group><span class="preview-answer-tag">答案: {{item.answer}}</span></div>
                        <div v-if="item.type==='multi_choice'" class="preview-choice"><a-checkbox-group :value="(item.answer||'').split(',').filter(Boolean)" disabled style="display:flex;flex-direction:column;gap:4px;"><a-checkbox v-for="opt in item.options" :key="opt.key" :value="opt.key" disabled>{{opt.key}}. {{opt.text||'(待填写)'}}</a-checkbox></a-checkbox-group><span class="preview-answer-tag">答案: {{item.answer}}</span></div>
                        <div v-if="item.type==='judge'" class="preview-judge"><a-radio-group :value="item.answer" disabled><a-radio value="true">✓ 正确</a-radio><a-radio value="false">✗ 错误</a-radio></a-radio-group><span class="preview-answer-tag">答案: {{item.answer==='true'?'正确':'错误'}}</span></div>
                        <div v-if="item.type==='fill'" class="preview-fill">
                      <div v-for="(bp,bi) in (item._blankParts||[])" :key="bi"><a-input :placeholder="bp.answer||'答案未设'" disabled size="small" style="margin-bottom:4px;" /></div>
                      <span v-if="!(item._blankParts||[]).length" style="color:var(--text-disabled);font-size:11px;">未检测到填空</span>
                    </div>
                        <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">分值: {{item.score||0}} 分</div>
                      </div>
                    </div>
                    <a-empty v-else description="暂无小问" :image="false" />
                  </div>
                </template>
              </div>
            </Transition>
            </div>
          </Transition>

          <!-- AI 提示词预览 -->
          <a-modal v-model:open="promptModalOpen" title="AI 提示词（与实评一致，学生代码以占位符显示）" :footer="null" :width="820">
            <a-spin :spinning="promptLoading">
              <template v-if="promptPreviewData">
                <a-collapse v-model:activeKey="promptActiveKeys">
                  <a-collapse-panel v-for="(s, i) in promptPreviewData.subs" :key="s.id" :header="'小题 ' + (i + 1) + '：' + (s.title || '')">
                    <div class="prompt-block">
                      <div class="prompt-role-label">System（角色设定）</div>
                      <pre class="prompt-pre">{{ s.system }}</pre>
                      <div class="prompt-role-label">User（评分任务）</div>
                      <pre class="prompt-pre">{{ s.user }}</pre>
                    </div>
                  </a-collapse-panel>
                </a-collapse>
              </template>
              <a-empty v-else-if="!promptLoading" description="暂无数据" :image="false" />
            </a-spin>
          </a-modal>
        </div>
      </div>
    </div>

    <!-- 设置模态框 -->
    <a-modal v-model:open="showSettings" title="题目设置" :footer="null" :width="480" @cancel="resetSettings">
      <a-form layout="vertical">
        <a-form-item label="客观题分类模式">
          <a-radio-group v-model:value="tempSettings.classificationMode">
            <a-radio value="flat">按具体题型分（每题一道小题）</a-radio>
            <a-radio value="group">全部合并（客观题混排为一小题）</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="多选题给分方式">
          <a-radio-group v-model:value="tempSettings.multiChoiceScoring">
            <a-radio value="all_or_nothing">全对才给分</a-radio>
            <a-radio value="partial">按正确选项比例给分</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-button type="primary" block @click="applySettings">应用设置</a-button>
      </a-form>
    </a-modal>

    <!-- 上传试卷模态框 -->
    <a-modal v-model:open="showUploadExam" title="上传试卷" :footer="null" :width="640" :maskClosable="!uploadAnalyzing" :closable="!uploadAnalyzing" @cancel="resetUpload">
      <a-alert type="info" show-icon style="margin-bottom:16px;">
        <template #message>AI 试卷提取说明</template>
        <template #description>
          <ul style="margin:4px 0;padding-left:16px;font-size:var(--fs-body-sm);">
            <li>支持 Word (.docx) 和 Excel (.xlsx) 格式</li>
            <li>系统将文件内容发送给 AI 进行题目提取</li>
            <li>AI 仅做提取，不修改任何题目内容</li>
            <li>生成后请教师核对修改确认</li>
          </ul>
        </template>
      </a-alert>
      <div :class="{ 'upload-disabled': uploadAnalyzing }">
        <a-upload-dragger v-model:fileList="uploadFileList" :beforeUpload="handleUploadExam" accept=".docx,.xlsx" :maxCount="1" :showUploadList="false" :disabled="uploadAnalyzing">
          <p class="ant-upload-drag-icon"><inbox-outlined style="color:var(--text-brand);font-size:48px;" /></p>
          <p class="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p class="ant-upload-hint">仅支持 .docx / .xlsx 格式</p>
        </a-upload-dragger>
      </div>
      <Transition name="upload-status">
        <div v-if="uploadAnalyzing" key="analyzing" style="text-align:center;padding:24px;">
          <a-spin />
          <p style="margin-top:12px;color:var(--text-tertiary);">正在解析试卷...</p>
          <p v-if="uploadProgress>0" style="margin-top:4px;font-size:var(--fs-caption);color:var(--text-tertiary);">已接收 {{ uploadProgress }} 字符</p>
        </div>
        <div v-else-if="uploadResult" key="result" style="margin-top:12px;text-align:center;padding:12px;background:var(--status-success-bg);border-radius:var(--radius-md);color:var(--status-success-fg);">✓ 解析完成，共提取 {{uploadResult}} 道题目，请核对</div>
        <div v-else-if="uploadError" key="error" style="margin-top:12px;text-align:center;padding:12px;background:var(--status-danger-bg);border-radius:var(--radius-md);color:var(--status-danger-fg);">{{uploadError}}</div>
      </Transition>
    </a-modal>

    </template>

    <!-- 底部动作条：保存状态（role=status）+ 操作，FormPage 契约。
         ★W6（t8）：loadError 时动作条一并收起 —— 空态页不能出现"可保存空白表单"的入口。 -->
    <template #actionbar>
      <span class="save-status" role="status" aria-live="polite">{{ statusText }}</span>
      <div v-if="questionKind && !loadError" class="actionbar-actions">
        <a-button size="large" @click="handleCancel">取消</a-button>
        <a-button v-if="isEdit && questionKind === 'subjective'" @click="showPromptPreview">查看 AI 提示词</a-button>
        <a-button type="primary" size="large" :loading="saving" @click="handleSave">保存</a-button>
      </div>
    </template>
  </FormPage>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { CodeOutlined, InboxOutlined } from '@ant-design/icons-vue';
import CodeEditor from '../../components/CodeEditor.vue';
import RichEditor from '../../components/RichEditor.vue';
import FormPage from '../../components/FormPage.vue';
import { useQuestionEditPage } from '../../composables/question/useQuestionEditPage.js';

// 接线根返回面 = 模板可见的 59 个 $setup 名 + 2 个 string ref + 两个 hook 回调体
const {
  form, hasMaterial, langs, isCodeStem, itemTypeLabel, itemTypeColor, itemTypeTagClass,
  questionKind, sqKind, subQuestions, tabsScrollRef, canScrollLeft, canScrollRight, onTabsScroll, scrollTabs, activeIndex, slideDir, showMaterial,
  computedMaxScore, sqDisplayLabel, onPickKind, addSub, removeSub, switchTo,
  computedObjSqScore, currentFlatItemType, previewFocusKey, onAddItem, removeItem, addItemOption, removeOption, toggleMultiAnswer, onFillBlankChange, onItemScoreChange, onEditCardClick,
  showSettings, objectiveSettings, tempSettings, resetSettings, applySettings,
  showUploadExam, uploadFileList, uploadAnalyzing, uploadResult, uploadError, uploadProgress, resetUpload, handleUploadExam,
  aiTag, promptModalOpen, promptLoading, promptPreviewData, promptActiveKeys, showPromptPreview,
  statusText, handleCancel, handleSave, saving, isEdit, codeEditorRef, formatCode, router, loadError,
  onPageMounted, onPageUnmounted,
} = useQuestionEditPage();

/** ★W6（t8/F1）：常驻空态里的出口 —— 返回题库管理（空态页唯一可做的动作） */
function backToQuestions() { router.push('/teacher/questions'); }

onMounted(onPageMounted);
onUnmounted(onPageUnmounted);
</script>

<style scoped>
/* 工作区：视口 − 顶栏(56) − 内容内距(2×20) − 页头/返回条/动作条。
   页头 compact 化后这一块少占 76px（实测：旧页头 120.1px → 单行页头 44px），故常量同步 300 → 224：
   省下的高度让给工作区，而不是变成页面下方的新留白。 */
.lc-page-inner{height:calc(100vh - 224px);min-height:480px;display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-3);}
/* ★W6（t8）：加载失败常驻空态（占满工作区、居中；与 lc-page-inner 同高，避免页面塌陷成一条） */
.qe-load-error{margin:auto;min-height:calc(100vh - 224px);justify-content:center;padding:var(--space-6) var(--space-3);}
.qe-load-error-title{margin:0 0 6px;font-size:var(--fs-title-3);font-weight:var(--fw-semibold);color:var(--text-primary);}
.qe-load-error-desc{margin:0;color:var(--text-tertiary);font-size:var(--fs-body-sm);}
.lc-top{flex-shrink:0;background:var(--bg-surface);border-radius:var(--radius-lg);padding:12px 20px;box-shadow:var(--shadow-sm);}
.lc-top :deep(.ant-form-inline){display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.lc-top :deep(.ant-form-item){margin-bottom:0;}
.lc-main{flex:1;display:flex;overflow:hidden;gap:12px;min-height:0;}
.lc-left{width:50%;min-width:380px;background:var(--bg-surface);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;display:flex;flex-direction:column;min-height:0;}
.lc-right{flex:1;display:flex;flex-direction:column;background:var(--bg-surface);min-width:400px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;min-height:0;}

/* 初始选类型 */
.kind-picker{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;}
.kind-add-btn{width:56px;height:56px;border-radius:50%;border:2px dashed var(--border-strong);background:var(--bg-surface-2);font-size:24px;color:var(--text-tertiary);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:var(--transition-control);}
.kind-add-btn:hover{border-color:var(--brand-600);color:var(--text-brand);background:var(--bg-selected);}
.kind-hint{font-size:var(--fs-body-sm);color:var(--text-tertiary);}
.lc-left-editor{flex:1;display:flex;flex-direction:column;min-height:0;}

/* 题型选择 ↔ 编辑器切换动画 */
.kind-pick-switch-enter-active,.kind-pick-switch-leave-active{transition:var(--transition-surface);}
.kind-pick-switch-enter-from{opacity:0;transform:scale(.9);}
.kind-pick-switch-leave-to{opacity:0;transform:scale(.9);}

.material-toggle{display:flex;align-items:center;gap:8px;padding:8px 16px;font-size:var(--fs-body-sm);font-weight:500;color:var(--text-secondary);cursor:pointer;user-select:none;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface-2);}
.material-toggle:hover{background:var(--border-subtle);}
.material-arrow{margin-left:auto;font-size:10px;transition:transform var(--duration-base) var(--ease-out);}
.material-arrow.open{transform:rotate(180deg);}
.material-body{overflow:hidden;border-bottom:1px solid var(--border-subtle);}
.material-body-inner{padding:16px 20px;}
.collapse-enter-active,.collapse-leave-active{transition: max-height var(--duration-slow) var(--ease-out), opacity var(--duration-base) var(--ease-out);}
.collapse-enter-from,.collapse-leave-to{opacity:0;max-height:0;}
.collapse-enter-to,.collapse-leave-from{opacity:1;max-height:600px;}

.lc-left-tabs{display:flex;align-items:center;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface-2);flex-shrink:0;}
.tab-scroll-btn{flex-shrink:0;width:24px;height:100%;border:none;background:transparent;cursor:pointer;font-size:var(--fs-title-2);color:var(--text-tertiary);display:flex;align-items:center;justify-content:center;transition:color var(--duration-fast);padding:0;}
.tab-scroll-btn:hover{color:var(--text-brand);}
.lc-left-tabs-scroll{flex:1;display:flex;align-items:center;gap:4px;padding:8px 4px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;}
.lc-left-tabs-scroll::-webkit-scrollbar{display:none;}
.sq-tab{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 12px;border:1px solid transparent;border-radius:var(--radius-sm);background:transparent;cursor:pointer;font-size:var(--fs-body-sm);color:var(--text-secondary);white-space:nowrap;transition:all var(--duration-fast);}
.sq-tab:hover{background:var(--border-default);}
.sq-tab.active{background:var(--bg-surface);border-color:var(--border-strong);color:var(--text-brand);font-weight:500;}
.sq-del{font-size:var(--fs-body);color:var(--text-disabled);line-height:1;margin-left:2px;}
.sq-del:hover{color:var(--status-danger-fg);}
.sq-add{width:28px;height:28px;padding:0;border:none;font-size:var(--fs-title-3);color:var(--text-tertiary);display:inline-flex;align-items:center;justify-content:center;}
.sq-add:hover{color:var(--text-brand);background:var(--bg-selected);}

.lc-left-body{padding:12px 16px;flex:1;overflow-y:auto;min-height:0;display:flex;flex-direction:column;}
.panel-wrap{min-height:0;display:flex;flex-direction:column;flex:1;}
.sq-top-row{display:flex;align-items:center;gap:8px;margin-bottom:4px;}

.obj-add-bar{flex-shrink:0;padding:8px 0;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-subtle);margin-bottom:4px;position:sticky;top:0;z-index:2;background:var(--bg-surface);box-shadow:var(--shadow-md);}

.upload-disabled{position:relative;opacity:.5;pointer-events:none;user-select:none;}

/* 上传模态框状态切换动效 */
.upload-status-enter-active,.upload-status-leave-active{transition:opacity var(--duration-slow) var(--ease-out),max-height var(--duration-slow) var(--ease-out),transform var(--duration-slow) var(--ease-out);}
.upload-status-enter-from{opacity:0;max-height:0;transform:translateY(-8px);}
.upload-status-leave-to{opacity:0;max-height:0;transform:translateY(-4px);}
.upload-status-leave-active{overflow:hidden;}
.upload-status-enter-to,.upload-status-leave-from{opacity:1;max-height:200px;}

.obj-items-scroll{flex:1;overflow-y:auto;min-height:0;}
.obj-items-list{display:flex;flex-direction:column;gap:10px;padding-top:4px;position:relative;}
.obj-item-card{border:1px solid var(--border-default);border-radius:var(--radius-md);padding:10px 12px;cursor:pointer;transition:border-color var(--duration-base) var(--ease-out),box-shadow var(--duration-base) var(--ease-out);}
.obj-item-card:hover{border-color:var(--brand-600);}
.obj-item-focus{border-color:var(--brand-600);box-shadow:var(--ring-focus);}
.obj-item-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.obj-options{margin-top:8px;}
.obj-option-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}

.lc-editor-header{display:flex;align-items:center;padding:0 16px;height:36px;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface-2);flex-shrink:0;}
.lc-editor-label{font-size:var(--fs-body-sm);font-weight:600;color:var(--text-tertiary);}
.lc-editor-actions{display:flex;align-items:center;gap:6px;margin-left:auto;}
.save-status{font-size:var(--fs-caption);color:var(--text-tertiary);}
.actionbar-actions{display:flex;align-items:center;gap:var(--space-3);margin-left:auto;}
.lc-editor-wrap{flex:1;overflow:hidden;min-height:0;}
.lc-right-inner{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
.lc-right-inner .lc-editor-wrap{overflow:hidden;}
.lc-right-inner .preview-scroll{overflow-y:auto;padding:var(--space-4);}

.preview-obj-list{display:flex;flex-direction:column;gap:16px;}
.preview-obj-item{padding:12px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);transition:background var(--duration-slow) var(--ease-out);}
.preview-obj-highlight{background:var(--status-warning-bg);border-color:var(--status-warning-bd);}
.preview-obj-num{font-weight:600;font-size:var(--fs-body);margin-bottom:6px;display:flex;align-items:center;gap:6px;}
.preview-stem{font-size:var(--fs-body);line-height:1.7;margin-bottom:8px;}
.preview-stem-code{font-family:monospace;font-size:var(--fs-body-sm);background:var(--bg-sunken);padding:8px 12px;border-radius:var(--radius-sm);white-space:pre-wrap;}
.preview-choice,.preview-judge,.preview-fill{margin-top:8px;}
.preview-answer-tag{display:inline-block;margin-top:6px;font-size:11px;color:var(--status-success-fg);background:var(--status-success-bg);padding:1px 6px;border-radius:var(--radius-xs);}

/* 动效 */
.sq-list-enter-active,.sq-list-leave-active{transition:opacity var(--duration-base) var(--ease-out),transform var(--duration-base) var(--ease-out);}
.sq-list-move{transition:transform var(--duration-base) var(--ease-out);}
.sq-list-enter-from{opacity:0;transform:scale(.8);}
.sq-list-leave-to{opacity:0;transform:scale(.8);}
.sq-list-leave-active{position:absolute;}
.panel-switch-enter-active,.panel-switch-leave-active{transition:opacity var(--duration-fast) var(--ease-out),transform var(--duration-fast) var(--ease-out);}
.panel-switch-enter-from{opacity:0;transform:translateX(calc(8px * var(--slide-dir)));}
.panel-switch-leave-to{opacity:0;transform:translateX(calc(-8px * var(--slide-dir)));}
.tag-switch-enter-active,.tag-switch-leave-active{transition:opacity var(--duration-fast) var(--ease-out),transform var(--duration-fast) var(--ease-out);}
.tag-switch-enter-from{opacity:0;transform:translateX(calc(-12px * var(--slide-dir)));}
.tag-switch-leave-to{opacity:0;transform:translateX(calc(12px * var(--slide-dir)));}

.item-list-enter-active,.item-list-leave-active{transition:opacity var(--duration-slow) var(--ease-out),transform var(--duration-slow) var(--ease-out);}
.item-list-enter-from{opacity:0;transform:translateY(-12px);}
.item-list-leave-to{opacity:0;transform:translateX(20px);}
.item-list-leave-active{position:absolute;}
.item-list-move{transition:transform var(--duration-slow) var(--ease-out);}
.opt-list-enter-active,.opt-list-leave-active{transition:opacity var(--duration-base) var(--ease-out),transform var(--duration-base) var(--ease-out);}
.opt-list-enter-from{opacity:0;transform:translateX(-10px);}
.opt-list-leave-to{opacity:0;transform:translateX(10px);}
.opt-list-move{transition:transform var(--duration-base) var(--ease-out);}

/* 主观题富文本编辑器 — 原始两倍高度 */
.content-item :deep(.tiptap) {
  min-height: calc(100vh - 720px);
}

/* AI 提示词预览 */
.prompt-block { margin-bottom: 12px; }
.prompt-role-label {
  font-size:var(--fs-caption); font-weight: 600; color: var(--text-secondary);
  margin: 8px 0 4px;
}
.prompt-pre {
  margin: 0; padding: 10px 12px;
  background: var(--bg-sunken); border: 1px solid var(--border-default); border-radius:var(--radius-sm);
  font-size:var(--fs-caption); line-height: 1.6; white-space: pre-wrap; word-break: break-all;
  max-height: 320px; overflow: auto;
}
</style>
