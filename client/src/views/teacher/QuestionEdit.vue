<template>
  <FormPage
    :title="isEdit ? '编辑题目' : '新建题目'"
    description="支持主观题与客观题；保存前会核对各小题分值。"
    :back="{ text: '返回题库管理', to: '/teacher/questions' }"
  >
    <div class="lc-page-inner">
      <!-- 顶部基本信息 -->
      <div class="lc-top">
        <a-form layout="inline" :model="form">
          <a-form-item><a-input v-model:value="form.title" placeholder="大题标题" style="width:260px;font-size:var(--fs-title-2);font-weight:700;" /></a-form-item>
          <a-form-item><a-select v-model:value="form.difficulty" style="width:100px;">
            <a-select-option value="easy">简单</a-select-option>
            <a-select-option value="medium">中等</a-select-option>
            <a-select-option value="hard">困难</a-select-option>
          </a-select></a-form-item>
          <a-form-item label="总分">
            <span style="font-size:var(--fs-title-3);font-weight:700;color:var(--brand-600);">{{computedMaxScore}} 分</span>
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
                    <span style="font-size:var(--fs-body);font-weight:600;color:var(--brand-600);margin-left:auto;">小题 {{computedObjSqScore}} 分</span>
                  </div>
                  <div class="obj-items-scroll">
                    <TransitionGroup name="item-list" tag="div" class="obj-items-list">
                      <div v-for="(item,idx) in form.objectiveItems" :key="item.key" :class="['obj-item-card',{'obj-item-focus':previewFocusKey===item.key}]" @click="onEditCardClick(item.key,$event)">
                        <div class="obj-item-head">
                          <a-tag :color="itemTypeColor(item.type)" size="small">{{itemTypeLabel(item.type)}}</a-tag>
                          <span style="font-size:var(--fs-caption);color:var(--text-tertiary);">第{{idx+1}}小问</span>
                          <a-input-number v-model:value="item.score" :min="0" :step="0.01" :precision="2" placeholder="均分" size="small" style="width:70px;margin-left:auto;" @change="onItemScoreChange(item)" />分
                          <a-popconfirm title="确认删除该小问？" description="该小问的题干与选项将一并移除，不可撤销。" ok-text="删除小问" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="removeItem(idx)"><a-button size="small" type="text" danger @click.stop>×</a-button></a-popconfirm>
                        </div>
                        <a-textarea v-model:value="item.stem" :rows="2" placeholder="题干" size="small" :style="{fontFamily:isCodeStem(item.stem)?'monospace':'inherit'}" />
                        <div v-if="item.type==='choice'||item.type==='multi_choice'" class="obj-options">
                          <TransitionGroup name="opt-list" tag="div">
                            <div v-for="(opt,oi) in item.options" :key="opt.key" class="obj-option-row">
                              <a-radio v-if="item.type==='choice'" :checked="item.answer===opt.key" @change="item.answer=opt.key" />
                              <a-checkbox v-else :checked="(item.answer||'').split(',').includes(opt.key)" @change="toggleMultiAnswer(item,opt.key)" />
                              <span style="font-weight:600;font-size:var(--fs-body-sm);width:18px;">{{opt.key}}.</span>
                              <a-input v-model:value="opt.text" :placeholder="'选项 '+opt.key" size="small" style="flex:1" />
                              <a-button size="small" type="text" danger @click="removeOption(item,oi)" :disabled="item.options.length<=2">×</a-button>
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
                    <a-tag v-if="aiTag" color="orange" style="margin-left:4px;font-size:11px;">{{aiTag}}</a-tag>
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
                        <div class="preview-obj-num">{{idx+1}}. <a-tag :color="itemTypeColor(item.type)" size="small" style="font-size:10px;">{{itemTypeLabel(item.type)}}</a-tag></div>
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
          <p class="ant-upload-drag-icon"><inbox-outlined style="color:var(--brand-600);font-size:48px;" /></p>
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

    <!-- 底部动作条：保存状态（role=status）+ 操作，FormPage 契约 -->
    <template #actionbar>
      <span class="save-status" role="status" aria-live="polite">{{ statusText }}</span>
      <div v-if="questionKind" class="actionbar-actions">
        <a-button size="large" @click="handleCancel">取消</a-button>
        <a-button v-if="isEdit && questionKind === 'subjective'" @click="showPromptPreview">查看 AI 提示词</a-button>
        <a-button type="primary" size="large" :loading="saving" @click="handleSave">保存</a-button>
      </div>
    </template>
  </FormPage>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, h } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { CodeOutlined, InboxOutlined } from '@ant-design/icons-vue';
import DOMPurify from 'dompurify';
const _sanHtml = (s) => DOMPurify.sanitize(s, {
  ALLOWED_TAGS: ['table','thead','tbody','tr','th','td','p','span','b','br','pre','div'],
  ALLOWED_ATTR: ['style','class'],
});
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import request from '../../api/request.js';
import CodeEditor from '../../components/CodeEditor.vue';
import RichEditor from '../../components/RichEditor.vue';
import FormPage from '../../components/FormPage.vue';
import { useConfirm } from '../../composables/useConfirm.js';
import { useDraftAutosave } from '../../composables/useDraftAutosave.js';

const router = useRouter(); const route = useRoute();
const { confirm } = useConfirm();
const editId = route.params.id || null; const isEdit = !!editId;
const saving = ref(false);
const codeEditorRef = ref(null);

const form = reactive({
  title:'',difficulty:'easy',material:'',
  sqTitle:'',sqScore:null,content:'',referenceAnswer:'',
  language:'cpp',objectiveItems:[],scoringCriteria:'',
});

// 题目类型：null=未选, 'subjective'=主观题, 'objective'=客观题
const questionKind = ref(null);
// 当前小题类型
const sqKind = ref('subjective');

const subQuestions = ref([]);
const tabsScrollRef = ref(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

function onTabsScroll(){const el=tabsScrollRef.value;if(el){canScrollLeft.value=el.scrollLeft>4;canScrollRight.value=el.scrollLeft+el.clientWidth<el.scrollWidth-4;}}
function scrollTabs(dir){const el=tabsScrollRef.value;if(el){el.scrollBy({left:el.clientWidth*0.6*dir,behavior:'smooth'});}}
watch(subQuestions,()=>nextTick(()=>onTabsScroll()),{deep:true});
const activeIndex = ref(0); const slideDir = ref(1); const showMaterial = ref(false);
let sqKeyCounter = 0;

// 默认分值（固定值，不可配置）
const DEFAULT_TYPE_SCORES = { choice: 1, multi_choice: 2, judge: 1, fill: 1, code: 10 };

// 总分 = Σ 小题分值
const computedMaxScore = computed(()=>subQuestions.value.reduce((s,sq)=>s+(sq.score||0),0));
// 实时同步当前小题分值到 subQuestions，保证 computedMaxScore 刷新
watch(()=>form.sqScore,(v)=>{const sq=subQuestions.value[activeIndex.value];if(sq&&sqKind.value==='subjective'&&v!=null){sq.score=v;}});
// 客观题小题分值 = Σ 小问分值
const computedObjSqScore = computed(()=>form.objectiveItems.reduce((s,i)=>s+(i.score||0),0));
// flat 模式下当前小题的 item 类型：从 items 中取第一个的类型
const currentFlatItemType = computed(()=>{if(objectiveSettings.classificationMode!=='flat')return null;const first=form.objectiveItems[0];return first?.type||null;});
// 小题 tab 显示标签（用于 tab 栏）
function sqTypeName(sq){
  if(sq.sqKind==='subjective')return'';
  if(objectiveSettings.classificationMode==='flat'){
    const items=sq.objectiveItems||[];
    return items.length?(itemTypeLabel(items[0].type)||''):'';
  }
  return''; // group 模式也不显示
}
function sqDisplayLabel(sq,i){
  const n=`第${i+1}小题`;
  const tn=sqTypeName(sq);
  return tn?`${n} ${tn}`:n;
}

// AI 提示词预览（编辑页：模板预览，与实评共用构建函数）
const promptModalOpen = ref(false);
const promptLoading = ref(false);
const promptPreviewData = ref(null);
const promptActiveKeys = ref([]);

async function showPromptPreview() {
  if (!editId) return;
  promptModalOpen.value = true;
  promptLoading.value = true;
  promptPreviewData.value = null;
  try {
    const r = await request.get('/teacher/questions/' + editId + '/prompt-preview');
    promptPreviewData.value = r.data;
    promptActiveKeys.value = (r.data.subs || []).map(s => s.id);
  } catch (e) {
    message.error('获取提示词失败：' + (e.response?.data?.message || e.message));
  } finally {
    promptLoading.value = false;
  }
}

// 设置
const showSettings = ref(false);
const SETTINGS_KEY = 'exam_question_settings';
function loadSettings(){try{const r=localStorage.getItem(SETTINGS_KEY);return r?{classificationMode:'group',multiChoiceScoring:'all_or_nothing',...JSON.parse(r)}:{classificationMode:'group',multiChoiceScoring:'all_or_nothing'};}catch{return{classificationMode:'group',multiChoiceScoring:'all_or_nothing'};}}
function saveSettings(s){localStorage.setItem(SETTINGS_KEY,JSON.stringify({classificationMode:s.classificationMode,multiChoiceScoring:s.multiChoiceScoring}));}
const defaultSettings = loadSettings();
const objectiveSettings = reactive({ classificationMode: defaultSettings.classificationMode, multiChoiceScoring: defaultSettings.multiChoiceScoring });
const tempSettings = reactive({ classificationMode: defaultSettings.classificationMode, multiChoiceScoring: defaultSettings.multiChoiceScoring });

// 上传
const showUploadExam = ref(false);
const uploadFileList = ref([]);
const uploadAnalyzing = ref(false);
const uploadResult = ref(0);
const uploadError = ref('');
const uploadProgress = ref(0);

// 预览
const previewFocusKey = ref(-1);
let draftChanged = false;

// AI 生成参考答案
const genRunning = ref(false);
const aiTag = ref('');  // 当前小题的 AI 标记

const hasMaterial = computed(()=>{const h=form.material||'';return h.replace(/<[^>]*>/g,'').trim().length>0;});

// 工厂
function newSq(d={}){const kind=d.sqKind||'subjective';const base={_key:++sqKeyCounter,sqKind:kind,score:kind==='subjective'?DEFAULT_TYPE_SCORES.code:null,content:'',referenceAnswer:'',language:'cpp',objectiveItems:[],scoringCriteria:''};return{...base,...d};}
function newItem(type,key){const b={key,type,stem:'',options:[],answer:'',score:DEFAULT_TYPE_SCORES[type]??1};if(type==='choice'){b.options=[{key:'A',text:''},{key:'B',text:''},{key:'C',text:''},{key:'D',text:''}];b.answer='A';}else if(type==='multi_choice'){b.options=[{key:'A',text:''},{key:'B',text:''},{key:'C',text:''},{key:'D',text:''}];b.answer='';}else if(type==='judge')b.answer='true';else if(type==='fill'){b._blankParts=[];b.score=0;}return b;}
function countBlanks(stem){return Math.max(1,(stem||'').match(/_{2,}/g)?.length||0);}
function updateFillBlanks(item){if(item.type!=='fill')return;const n=countBlanks(item.stem);item._blankParts=Array.from({length:n},(_,i)=>({answer:((item.answer||'').split(',')[i]||'').trim()}));if(!item.score||item.score<=0||item._autoBlanks!==n){item.score=n*(DEFAULT_TYPE_SCORES.fill||1);item._autoBlanks=n;}}

// 初始选类型
function onPickKind({key}){
  questionKind.value=key;
  subQuestions.value=[newSq({sqKind:key})];
  loadSq(0,0);
}

// 格式化
function formatCode(){codeEditorRef.value?.format();}

// 小题切换
function saveDraft(){const sq=subQuestions.value[activeIndex.value];if(sq){sq.sqKind=sqKind.value;sq.title=form.sqTitle;sq.score=form.sqScore;sq.content=form.content;sq.referenceAnswer=form.referenceAnswer;sq.language=form.language;sq.objectiveItems=form.objectiveItems;sq.scoringCriteria=form.scoringCriteria;sq.isAiGenerated=!!aiTag.value;markDraftChanged();}}
function loadSq(index,dir){
  if(dir!==0)saveDraft();if(dir==null)dir=index>activeIndex.value?1:-1;if(dir!==0)slideDir.value=dir;activeIndex.value=index;
  const sq=subQuestions.value[index];if(sq){sqKind.value=sq.sqKind||'subjective';form.sqTitle=sq.title||'';form.sqScore=sq.score??null;form.content=sq.content||'';form.referenceAnswer=sq.referenceAnswer||'';form.language=sq.language||'cpp';form.objectiveItems=sq.objectiveItems?.length?[...sq.objectiveItems]:[];form.scoringCriteria=sq.scoringCriteria||'';aiTag.value=sq.isAiGenerated?'AI 生成，请审核':'';previewFocusKey.value=-1;}
}
function switchTo(index){if(index===activeIndex.value)return;loadSq(index);}
function addSub({key}){saveDraft();
  let sq;
  if(objectiveSettings.classificationMode==='flat'&&key!=='subjective'){
    // flat 模式：创建客观题小题，预置一个空小问以标记类型
    sq=newSq({sqKind:'objective',objectiveItems:[newItem(key,0)]});
    sq.score=DEFAULT_TYPE_SCORES[key]??1;
  }else{
    sq=newSq({sqKind:key==='subjective'?'subjective':'objective'});
  }
  subQuestions.value.push(sq);loadSq(subQuestions.value.length-1);
}
function removeSub(index){if(subQuestions.value.length<=1)return;const was=activeIndex.value;subQuestions.value.splice(index,1);loadSq(index<was?was-1:Math.min(was,subQuestions.value.length-1));}

// 客观题 items
function syncObjSqScore(){const sq=subQuestions.value[activeIndex.value];if(sq&&sqKind.value==='objective'){const total=form.objectiveItems.reduce((s,i)=>s+(i.score||0),0);sq.score=form.sqScore=Math.round(total*100)/100;}}
function onAddItem({key}){const nk=form.objectiveItems.length?Math.max(...form.objectiveItems.map(i=>i.key))+1:0;const item=newItem(key,nk);form.objectiveItems.push(item);if(key==='fill')updateFillBlanks(item);syncObjSqScore();nextTick(()=>{scrollPreviewTo(nk);document.querySelector('.obj-item-card:last-child')?.scrollIntoView({behavior:'smooth',block:'center'});});}
function removeItem(idx){form.objectiveItems.splice(idx,1);form.objectiveItems.forEach((item,i)=>{item.key=i;});syncObjSqScore();}
function isCodeStem(s){return s&&(s.includes('```')||s.includes('{')||s.includes('function')||s.includes('class ')||s.includes('def ')||s.includes('import '));}
function addItemOption(item){item.options.push({key:String.fromCharCode(65+item.options.length),text:''});}
function removeOption(item,idx){item.options.splice(idx,1);item.options.forEach((o,i)=>{o.key=String.fromCharCode(65+i);});if(item.type==='choice'&&!item.options.find(o=>o.key===item.answer))item.answer=item.options[0]?.key||'';}
function toggleMultiAnswer(item,key){const a=(item.answer||'').split(',').map(s=>s.trim()).filter(Boolean);const i=a.indexOf(key);i>=0?a.splice(i,1):a.push(key);item.answer=a.join(',');}
function onFillBlankChange(item){item.answer=item._blankParts.map(b=>b.answer).join(',');syncObjSqScore();}
function onItemScoreChange(){syncObjSqScore();}
watch(()=>form.objectiveItems.map(i=>i.score),()=>{if(sqKind.value==='objective')syncObjSqScore();},{deep:true});

// 预览联动
function onEditCardClick(key,e){e.currentTarget?.scrollIntoView?.({behavior:'smooth',block:'center'});scrollPreviewTo(key);}
function scrollPreviewTo(key){previewFocusKey.value=key;nextTick(()=>{const el=document.getElementById('preview-'+key);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});});}
function itemTypeLabel(t){const m={choice:'单选',multi_choice:'多选',judge:'判断',fill:'填空'};return m[t]||t;}
function itemTypeColor(t){const m={choice:'blue',multi_choice:'purple',judge:'orange',fill:'green'};return m[t]||'default';}

// 设置
function resetSettings(){tempSettings.classificationMode=objectiveSettings.classificationMode;tempSettings.multiChoiceScoring=objectiveSettings.multiChoiceScoring;}
function applySettings(){
  const oldMode=objectiveSettings.classificationMode;
  const newMode=tempSettings.classificationMode;
  const msc=tempSettings.multiChoiceScoring;

  // 模式切换：重构 subQuestions
  if(oldMode!==newMode&&subQuestions.value.length){
    saveDraft();
    if(newMode==='flat'){
      // group→flat: 将客观题 items 按类型拆分为多个小题
      const newSubs=[];
      subQuestions.value.forEach(sq=>{
        if(sq.sqKind==='subjective'){newSubs.push(sq);return;}
        const items=sq.objectiveItems||[];
        if(!items.length){newSubs.push(sq);return;}
        const groups={};
        items.forEach(item=>{(groups[item.type]||(groups[item.type]=[])).push(item);});
        Object.entries(groups).forEach(([type,groupItems])=>{
          newSubs.push(newSq({sqKind:'objective',objectiveItems:groupItems.map((item,i)=>({...item,key:i})),score:groupItems.reduce((s,i)=>s+(i.score||0),0)}));
        });
      });
      subQuestions.value=newSubs;
    }else{
      // flat→group: 合并所有客观题小题为一个
      const allItems=[];const newSubs=[];
      subQuestions.value.forEach(sq=>{
        if(sq.sqKind==='subjective'){newSubs.push(sq);return;}
        allItems.push(...(sq.objectiveItems||[]).map((item,i)=>({...item,key:i+allItems.length})));
      });
      if(allItems.length){
        newSubs.unshift(newSq({sqKind:'objective',objectiveItems:allItems,score:allItems.reduce((s,i)=>s+(i.score||0),0)}));
      }
      subQuestions.value=newSubs;
    }
    loadSq(0,0);
  }

  objectiveSettings.classificationMode=newMode;
  objectiveSettings.multiChoiceScoring=msc;
  saveSettings({classificationMode:newMode,multiChoiceScoring:msc});
  showSettings.value=false;
}

// 上传试卷
function resetUpload(){uploadFileList.value=[];uploadAnalyzing.value=false;uploadResult.value=0;uploadError.value='';uploadProgress.value=0;}
async function handleUploadExam(file){
  console.log('[上传试卷] 文件:', file.name, '大小:', (file.size/1024).toFixed(1), 'KB');
  uploadAnalyzing.value=true;uploadResult.value=0;uploadError.value='';uploadProgress.value=0;
  try{
    const ext=file.name.split('.').pop().toLowerCase();let text='';
    console.log('[上传试卷] 扩展名:', ext);
    if(ext==='docx'){
      console.log('[上传试卷] 使用 mammoth 解析 .docx...');
      const r=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
      text=r.value;
      console.log('[上传试卷] mammoth 解析完成，字符数:', text.length);
    }
    else if(ext==='xlsx'){
      console.log('[上传试卷] 使用 xlsx 解析...');
      const wb=XLSX.read(await file.arrayBuffer());
      for(const sn of wb.SheetNames){const ws=wb.Sheets[sn];text+=XLSX.utils.sheet_to_csv(ws)+'\n';}
      console.log('[上传试卷] xlsx 解析完成，字符数:', text.length);
    }
    else{uploadError.value='不支持的文件格式';uploadAnalyzing.value=false;return false;}
    if(!text.trim()){uploadError.value='文件内容为空';uploadAnalyzing.value=false;return false;}
    // 流式 SSE 解析 — 永不超时
    const token = (() => { try { return localStorage.getItem('token') || ''; } catch { return ''; } })();
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    const resp = await fetch(`${baseUrl}/teacher/parse-exam-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: text }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let questions = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.phase === 'streaming' || evt.phase === 'token') {
            uploadProgress.value = evt.contentLength || 0;
          } else if (evt.phase === 'done') {
            questions = evt.questions || [];
            uploadResult.value = questions.length;
          } else if (evt.phase === 'error') {
            throw new Error(evt.message);
          }
        } catch (e) { if (e.message && !e.message.includes('JSON')) throw e; }
      }
    }

    console.log('[上传试卷] 解析出题目数:', questions.length);
    if(questions.length>0){
      fillFromParsed(questions);
      showUploadExam.value=false;resetUpload();
    }
  }catch(e){console.error('[上传试卷] 错误:', e);uploadError.value=e?.message||'解析失败请重试';}
  finally{uploadAnalyzing.value=false;}
  return false;
}

function normalizeJudgeAnswer(ans){
  const a=String(ans||'').trim();
  if(/^(正确|对|√|T|true)$/i.test(a))return 'true';
  if(/^(错误|错|×|F|false)$/i.test(a))return 'false';
  return a;
}
function cleanOptionText(t){return String(t||'').replace(/^[A-H][.、．]\s*/, '').trim();}
function detectCodeLang(code, stem){
  const c=(code||'')+(stem||'');
  if(!c.trim())return 'cpp';
  // Java 特征最明显
  if(/public\s+(static\s+)?(class|void|int|String|boolean)\b|import\s+java\.|System\.(out|in)\b|\.\.\.\s*args|@Override|new\s+\w+\(/.test(c))return'java';
  // Python
  if(/\bdef\s+\w+\s*\(|import\s+[a-z_]+\s*$|print\s*\(|:\s*$/.test(c))return'python';
  // C#
  if(/using\s+System|namespace\s+\w+|Console\.(Write|Read)/.test(c))return'csharp';
  // JavaScript/TypeScript
  if(/\b(const|let|var)\s+\w+\s*=|=>\s*\{|console\.log|function\s+\w+\s*\(/.test(c)&&!/\b(int|String|void)\s+\w+\s*\(/.test(c))return'javascript';
  // TypeScript 额外特征
  if(/:\s*(string|number|boolean)\[\]?/.test(c)&&!/public class/.test(c))return'typescript';
  // Go
  if(/package\s+main|func\s+\w+\s*\(|fmt\.(Print|Scan)/.test(c))return'go';
  // Rust
  if(/fn\s+\w+\s*\(|let\s+mut\b|println!\(|use\s+std::/.test(c))return'rust';
  // PHP
  if(/\$[\w]+|<\?php/.test(c))return'php';
  // Ruby
  if(/\bdef\s+\w+\s*$|puts\s+|\.each\s+do\b/.test(c))return'ruby';
  // C
  if(/#include\s*<|printf\(|malloc\(/.test(c)&&!/\bclass\b/.test(c))return'c';
  // C++ (含 C 特征但有 class/namespace/template)
  if(/#include\s*<|std::|cout\s*<</)return'cpp';
  // Swift
  if(/\b(func|var|let)\s+\w+\s*[:\(]|import\s+Foundation/.test(c))return'swift';
  // Kotlin
  if(/\bfun\s+\w+\s*\(|val\s+\w+:\s*\w+/.test(c))return'kotlin';
  // Shell
  if(/^#!/.test(c)||/\becho\s+/.test(c))return'shell';
  // SQL
  if(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b/i.test(c))return'sql';
  // 兜底 C++
  return'cpp';
}
function normalizeItem(q){const item={key:0,type:q.type||'choice',stem:q.stem||'',answer:q.type==='judge'?normalizeJudgeAnswer(q.answer):(q.answer||''),score:DEFAULT_TYPE_SCORES[q.type]??1,options:(q.options||[]).map((o,oi)=>({key:String.fromCharCode(65+oi),text:cleanOptionText(o)}))};if(q.type==='fill'){updateFillBlanks(item);}return item;}

function fillFromParsed(qs){
  const hasCode=qs.some(q=>q.type==='code');
  const hasObj=qs.some(q=>q.type!=='code');

  if(!questionKind.value){
    if(hasCode&&!hasObj)questionKind.value='subjective';
    else if(!hasCode&&hasObj)questionKind.value='objective';
    else questionKind.value='subjective';
  }

  subQuestions.value=[];

  if(objectiveSettings.classificationMode==='flat'){
    let currentGroup=null, currentItems=[];
    const flushGroup=()=>{if(currentGroup&&currentItems.length){const items=currentItems.map(normalizeItem).map((item,i)=>({...item,key:i}));subQuestions.value.push(newSq({sqKind:'objective',score:items.reduce((s,i)=>s+(i.score||0),0),objectiveItems:items}));}};
    qs.forEach(q=>{
      if(q.type==='code'){
        flushGroup();currentGroup=null;currentItems=[];
        subQuestions.value.push(newSq({sqKind:'subjective',score:DEFAULT_TYPE_SCORES.code,content:`<p>${(q.stem||'').replace(/\n/g,'<br/>')}</p>`,referenceAnswer:q.referenceAnswer||'',scoringCriteria:q.scoringCriteria||'',language:q.language||detectCodeLang(q.referenceAnswer||'',q.stem||'')}));
      }else{
        if(currentGroup!==q.type){flushGroup();currentGroup=q.type;currentItems=[q];}
        else{currentItems.push(q);}
      }
    });
    flushGroup();
  }else{
    const objSqs=qs.filter(q=>q.type!=='code');
    const codeSqs=qs.filter(q=>q.type==='code');
    if(objSqs.length){const items=objSqs.map(normalizeItem).map((item,i)=>({...item,key:i}));subQuestions.value.push(newSq({sqKind:'objective',score:items.reduce((s,i)=>s+(i.score||0),0),objectiveItems:items}));}
    codeSqs.forEach(q=>{subQuestions.value.push(newSq({sqKind:'subjective',score:DEFAULT_TYPE_SCORES.code,content:`<p>${(q.stem||'').replace(/\n/g,'<br/>')}</p>`,referenceAnswer:q.referenceAnswer||'',scoringCriteria:q.scoringCriteria||'',language:q.language||detectCodeLang(q.referenceAnswer||'',q.stem||'')}));});
  }

  if(!subQuestions.value.length)subQuestions.value=[newSq()];
  loadSq(0,0);
  message.success(`已填充 ${qs.length} 道题目，请核对修改`);
}

// 草稿：saveDraft 是本地「左栏表单 → 当前小题」同步（不发请求），原 2s 防抖节拍不变，改用 useDraftAutosave
function markDraftChanged(){draftChanged=true;}
const draftSaver = useDraftAutosave({
  save: async () => { saveDraft(); draftChanged = false; },
  delay: 2000,
  enabled: () => draftChanged,
});
/** 动作条状态文本（role="status" aria-live="polite" 由模板提供） */
const statusText = computed(() => ({ idle: '', saving: '保存中…', saved: '已保存', error: '保存失败' }[draftSaver.status.value] || ''));
watch(()=>[form.content,form.referenceAnswer,form.objectiveItems,form.sqScore,form.scoringCriteria],()=>{if(isEdit)draftSaver.schedule();},{deep:true});
// AI 标记：手动编辑参考答案时自动清除
watch(()=>form.referenceAnswer,(newVal,oldVal)=>{if(aiTag.value&&!genRunning.value&&newVal!==oldVal)aiTag.value='';});

// 加载已有题目
async function load(){
  if(!isEdit){return;}
  const r=await request.get(`/teacher/questions/${editId}`);const q=r.data;
  form.title=q.title;form.difficulty=q.difficulty;form.material=q.material||'';
  if(q.objectiveSettings){Object.assign(objectiveSettings,q.objectiveSettings);}
  if(q.material)showMaterial.value=true;
  const sqs=(q.subQuestions||[]).map(sq=>{
    const kind=sq.type==='objective'?'objective':'subjective';
    let items=sq.objectiveItems?.length?[...sq.objectiveItems]:[];
    let score=sq.score;
    // 向后兼容：旧数据 null 分数 → 默认分
    if(kind==='subjective'&&score==null)score=DEFAULT_TYPE_SCORES.code;
    if(kind==='objective'){
      items.forEach(item=>{if(item.score==null||item.score<=0)item.score=DEFAULT_TYPE_SCORES[item.type]??1;if(item.type==='fill')updateFillBlanks(item);});
      if(!score||score<=0)score=items.reduce((s,item)=>s+(item.score||0),0);
    }
    return newSq({id:sq.id,sqKind:kind,title:sq.title||'',score,content:sq.content,referenceAnswer:sq.referenceAnswer,language:sq.language,objectiveItems:items,scoringCriteria:sq.scoringCriteria||''});
  });
  const firstSqKind=sqs[0]?.sqKind||'subjective';
  questionKind.value=firstSqKind;
  subQuestions.value=sqs;
  if(subQuestions.value.length>0)loadSq(0,0);
}

// 保存
function handleCancel(){router.push('/teacher/questions');}
function buildScoreSummary(){
  const sqs=subQuestions.value;const total=sqs.reduce((s,sq)=>s+(sq.score||0),0);
  const withZero=sqs.filter(sq=>!sq.score||sq.score<=0);
  let rows='';
  sqs.forEach((sq,i)=>{
    const label=sq.sqKind==='subjective'?'编程题':sq.objectiveItems?.length&&objectiveSettings.classificationMode==='flat'?(itemTypeLabel(sq.objectiveItems[0].type)||'客观题'):'客观题';
    const scoreLabel=sq.score&&sq.score>0?`${sq.score} 分`:`<span style="color:var(--status-danger-fg);">未设置</span>`;
    rows+=`<tr><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);">第${i+1}题</td><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);">${label}</td><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);">${scoreLabel}</td></tr>`;
  });
  const html=`<table style="width:100%;border-collapse:collapse;font-size:var(--fs-body-sm);">
    <thead><tr style="background:var(--bg-surface-2);"><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">小题</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">题型</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">设定分值</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:12px;font-size:var(--fs-body-sm);color:var(--text-secondary);">大题总分：<b>${computedMaxScore.value}</b> 分</p>`;
  return {html,total,withZero};
}

async function aiGenerateRefs(missing){
  genRunning.value=true;
  let done=0;
  try{
    for(const {sq,i} of missing){
      try{
        const r=await request.post('/teacher/generate-reference',{
          material:form.material||undefined,
          stem:(sq.content||'').replace(/<[^>]*>/g,''),
          scoringCriteria:sq.scoringCriteria||undefined,
        },{timeout:120000});
        const code=r.data.answer||'';
        sq.referenceAnswer=code;sq.isAiGenerated=true;
        if(i===activeIndex.value){form.referenceAnswer=code;aiTag.value='AI 生成，请审核';}
        done++;
      }catch(e){console.error('[AI生成] 第'+(i+1)+'小题失败:',e);}
    }
  }finally{genRunning.value=false;}
  if(done>0)message.success(`AI 已为 ${done} 道题生成参考答案，请审核后保存`);
}

function promptAiGenerate(missing){
  let rows='';
  missing.forEach(({sq,i})=>{rows+=`<tr><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);">第${i+1}小题</td><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);">${(sq.content||'').replace(/<[^>]*>/g,'').slice(0,50)}</td><td style="padding:6px 12px;border-bottom:1px solid var(--border-subtle);color:var(--status-danger-fg);">未设置</td></tr>`;});
  const tableHtml=`<table style="width:100%;border-collapse:collapse;font-size:var(--fs-body-sm);"><thead><tr style="background:var(--bg-surface-2);"><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">小题</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">题干</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-default);">参考答案</th></tr></thead><tbody>${rows}</tbody></table>`;
  confirm({
    title:`${missing.length} 道主观题未设参考答案`,
    content:()=>h('div',{innerHTML:_sanHtml(`<p style="margin-bottom:8px;color:var(--text-secondary);">以下主观题尚未编写参考答案：</p>${tableHtml}<p style="margin-top:8px;color:var(--status-warning-fg);font-size:var(--fs-body-sm);">可由 AI 根据题目内容和评分标准自动生成参考答案，生成后请核对修改。</p>`)}),
    okText:'AI 生成参考答案',
    cancelText:'暂不生成',
    width:640,
    onOk:async()=>{await aiGenerateRefs(missing);},
  });
}

function collectSubjectiveIssues(){
  const emptyContent=[], missingRef=[];
  subQuestions.value.forEach((sq,i)=>{
    if(sq.sqKind!=='subjective')return;
    const c=(sq.content||'').replace(/<[^>]*>/g,'').trim();
    if(!c)emptyContent.push(i);
    else if(!(sq.referenceAnswer||'').trim())missingRef.push({sq,i});
  });
  return {emptyContent,missingRef};
}

async function handleSave(){
  saveDraft();
  if(!form.title.trim())return message.warn('请输入题目标题');
  if(!subQuestions.value.length)return message.warn('请至少添加一道小题');

  const {emptyContent,missingRef}=collectSubjectiveIssues();
  if(emptyContent.length>0){
    const names=emptyContent.map(i=>`第${i+1}题`).join('、');
    return message.warn(`${names} 主观题尚未填写题目内容`);
  }
  if(missingRef.length>0){
    promptAiGenerate(missingRef);
    return;
  }

  // 检查各小题分值
  const unscored=[];
  subQuestions.value.forEach((sq,i)=>{
    let effective=sq.score||0;
    if(sq.sqKind==='objective'&&sq.objectiveItems?.length){
      effective=sq.objectiveItems.reduce((s,item)=>s+(item.score||0),0);
    }
    if(!effective||effective<=0)unscored.push({i,kind:sq.sqKind});
  });
  if(unscored.length>0){
    const names=unscored.map(u=>{const sq=subQuestions.value[u.i];const t=sq.sqKind==='subjective'?'编程题':sq.objectiveItems?.length&&objectiveSettings.classificationMode==='flat'?(itemTypeLabel(sq.objectiveItems[0].type)||'客观题'):'客观题';return`第${u.i+1}小题（${t}）`;}).join('、');
    return message.warn(`${names} 尚未设置分值。客观题请检查各小问分值，主观题请填入分值。`);
  }

  const {html}=buildScoreSummary();
  confirm({
    title:'确认保存',
    content:()=>h('div',{innerHTML:_sanHtml(`<p style="margin-bottom:8px;color:var(--text-secondary);">请确认各小题分值是否正确：</p>${html}<p style="margin-top:8px;color:var(--text-secondary);font-size:var(--fs-body-sm);">所有小题已设定分值，确认无误可保存。</p>`)}),
    okText:'确认保存',
    cancelText:'返回修改',
    width:640,
    onOk:doSave,
  });
}
async function doSave(){
  saving.value=true;
  try{
    subQuestions.value.forEach(sq=>{if(sq.sqKind==='objective'&&sq.objectiveItems?.length){sq.score=sq.objectiveItems.reduce((s,i)=>s+(i.score||0),0);}});
    const totalScore=subQuestions.value.reduce((s,sq)=>s+(sq.score||0),0);
    const p={title:form.title,difficulty:form.difficulty,maxScore:totalScore,material:form.material||undefined,
      objectiveSettings:{questionKind:questionKind.value,classificationMode:objectiveSettings.classificationMode,multiChoiceScoring:objectiveSettings.multiChoiceScoring},
      subQuestions:subQuestions.value.map(sq=>({
        title:sq.title||'',type:sq.sqKind==='objective'?'objective':'code',
        score:sq.score,content:sq.content,referenceAnswer:sq.referenceAnswer||'',language:sq.language||'cpp',
        objectiveItems:sq.objectiveItems?.length?sq.objectiveItems:undefined,
        scoringCriteria:sq.scoringCriteria||undefined,
      })),};
    if(isEdit){await request.put(`/teacher/questions/${editId}`,p);message.success('保存成功');}else{await request.post('/teacher/questions',p);message.success('创建成功');}
    router.push('/teacher/questions');
  }finally{saving.value=false;}
}
function beforeUnloadHandler(e){saveDraft();if(draftChanged){e.preventDefault();e.returnValue='有未保存的更改';}}
onMounted(()=>{load();window.addEventListener('beforeunload',beforeUnloadHandler);});
onUnmounted(()=>{window.removeEventListener('beforeunload',beforeUnloadHandler);saveDraft();});

const langs=['c','cpp','csharp','java','python','javascript','typescript','go','rust','ruby','php','swift','kotlin','sql','shell','r','scala','perl'];
</script>

<style scoped>
/* 工作区：视口 − 顶栏(56) − 内容内距(2×20) − 页头/返回条/动作条（约 200px） */
.lc-page-inner{height:calc(100vh - 300px);min-height:480px;display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-3);}
.lc-top{flex-shrink:0;background:var(--bg-surface);border-radius:var(--radius-lg);padding:12px 20px;box-shadow:var(--shadow-sm);}
.lc-top :deep(.ant-form-inline){display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.lc-top :deep(.ant-form-item){margin-bottom:0;}
.lc-main{flex:1;display:flex;overflow:hidden;gap:12px;min-height:0;}
.lc-left{width:50%;min-width:380px;background:var(--bg-surface);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;display:flex;flex-direction:column;min-height:0;}
.lc-right{flex:1;display:flex;flex-direction:column;background:var(--bg-surface);min-width:400px;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;min-height:0;}

/* 初始选类型 */
.kind-picker{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;}
.kind-add-btn{width:56px;height:56px;border-radius:50%;border:2px dashed var(--border-strong);background:var(--bg-surface-2);font-size:24px;color:var(--text-tertiary);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;}
.kind-add-btn:hover{border-color:var(--brand-600);color:var(--brand-600);background:var(--brand-50);}
.kind-hint{font-size:var(--fs-body-sm);color:var(--text-tertiary);}
.lc-left-editor{flex:1;display:flex;flex-direction:column;min-height:0;}

/* 题型选择 ↔ 编辑器切换动画 */
.kind-pick-switch-enter-active,.kind-pick-switch-leave-active{transition:all .25s ease;}
.kind-pick-switch-enter-from{opacity:0;transform:scale(.9);}
.kind-pick-switch-leave-to{opacity:0;transform:scale(.9);}

.material-toggle{display:flex;align-items:center;gap:8px;padding:8px 16px;font-size:var(--fs-body-sm);font-weight:500;color:var(--text-secondary);cursor:pointer;user-select:none;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface-2);}
.material-toggle:hover{background:var(--border-subtle);}
.material-arrow{margin-left:auto;font-size:10px;transition:transform .2s;}
.material-arrow.open{transform:rotate(180deg);}
.material-body{overflow:hidden;border-bottom:1px solid var(--border-subtle);}
.material-body-inner{padding:16px 20px;}
.collapse-enter-active,.collapse-leave-active{transition:all .25s ease;}
.collapse-enter-from,.collapse-leave-to{opacity:0;max-height:0;}
.collapse-enter-to,.collapse-leave-from{opacity:1;max-height:600px;}

.lc-left-tabs{display:flex;align-items:center;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface-2);flex-shrink:0;}
.tab-scroll-btn{flex-shrink:0;width:24px;height:100%;border:none;background:transparent;cursor:pointer;font-size:var(--fs-title-2);color:var(--text-tertiary);display:flex;align-items:center;justify-content:center;transition:color .15s;padding:0;}
.tab-scroll-btn:hover{color:var(--brand-600);}
.lc-left-tabs-scroll{flex:1;display:flex;align-items:center;gap:4px;padding:8px 4px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;}
.lc-left-tabs-scroll::-webkit-scrollbar{display:none;}
.sq-tab{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 12px;border:1px solid transparent;border-radius:var(--radius-sm);background:transparent;cursor:pointer;font-size:var(--fs-body-sm);color:var(--text-secondary);white-space:nowrap;transition:all .15s;}
.sq-tab:hover{background:var(--border-default);}
.sq-tab.active{background:var(--bg-surface);border-color:var(--border-strong);color:var(--brand-600);font-weight:500;}
.sq-del{font-size:var(--fs-body);color:var(--text-disabled);line-height:1;margin-left:2px;}
.sq-del:hover{color:var(--status-danger-fg);}
.sq-add{width:28px;height:28px;padding:0;border:none;font-size:var(--fs-title-3);color:var(--text-tertiary);display:inline-flex;align-items:center;justify-content:center;}
.sq-add:hover{color:var(--brand-600);background:var(--brand-50);}

.lc-left-body{padding:12px 16px;flex:1;overflow-y:auto;min-height:0;display:flex;flex-direction:column;}
.panel-wrap{min-height:0;display:flex;flex-direction:column;flex:1;}
.sq-top-row{display:flex;align-items:center;gap:8px;margin-bottom:4px;}

.obj-add-bar{flex-shrink:0;padding:8px 0;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-subtle);margin-bottom:4px;position:sticky;top:0;z-index:2;background:var(--bg-surface);box-shadow:var(--shadow-md);}

.upload-disabled{position:relative;opacity:.5;pointer-events:none;user-select:none;}

/* 上传模态框状态切换动效 */
.upload-status-enter-active,.upload-status-leave-active{transition:all .3s ease;}
.upload-status-enter-from{opacity:0;max-height:0;transform:translateY(-8px);}
.upload-status-leave-to{opacity:0;max-height:0;transform:translateY(-4px);}
.upload-status-leave-active{overflow:hidden;}
.upload-status-enter-to,.upload-status-leave-from{opacity:1;max-height:200px;}

.obj-items-scroll{flex:1;overflow-y:auto;min-height:0;}
.obj-items-list{display:flex;flex-direction:column;gap:10px;padding-top:4px;position:relative;}
.obj-item-card{border:1px solid var(--border-default);border-radius:var(--radius-md);padding:10px 12px;cursor:pointer;transition:border-color .2s,box-shadow .2s;}
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
.preview-obj-item{padding:12px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);transition:background .3s;}
.preview-obj-highlight{background:var(--status-warning-bg);border-color:var(--status-warning-bd);}
.preview-obj-num{font-weight:600;font-size:var(--fs-body);margin-bottom:6px;display:flex;align-items:center;gap:6px;}
.preview-stem{font-size:var(--fs-body);line-height:1.7;margin-bottom:8px;}
.preview-stem-code{font-family:monospace;font-size:var(--fs-body-sm);background:var(--bg-sunken);padding:8px 12px;border-radius:var(--radius-sm);white-space:pre-wrap;}
.preview-choice,.preview-judge,.preview-fill{margin-top:8px;}
.preview-answer-tag{display:inline-block;margin-top:6px;font-size:11px;color:var(--status-success-fg);background:var(--status-success-bg);padding:1px 6px;border-radius:var(--radius-xs);}

/* 动效 */
.sq-list-enter-active,.sq-list-leave-active,.sq-list-move{transition:all .2s ease;}
.sq-list-enter-from{opacity:0;transform:scale(.8);}
.sq-list-leave-to{opacity:0;transform:scale(.8);}
.sq-list-leave-active{position:absolute;}
.panel-switch-enter-active,.panel-switch-leave-active{transition:all .15s ease;}
.panel-switch-enter-from{opacity:0;transform:translateX(calc(8px * var(--slide-dir)));}
.panel-switch-leave-to{opacity:0;transform:translateX(calc(-8px * var(--slide-dir)));}
.tag-switch-enter-active,.tag-switch-leave-active{transition:all .15s ease;}
.tag-switch-enter-from{opacity:0;transform:translateX(calc(-12px * var(--slide-dir)));}
.tag-switch-leave-to{opacity:0;transform:translateX(calc(12px * var(--slide-dir)));}

.item-list-enter-active,.item-list-leave-active{transition:all .3s ease;}
.item-list-enter-from{opacity:0;transform:translateY(-12px);}
.item-list-leave-to{opacity:0;transform:translateX(20px);}
.item-list-leave-active{position:absolute;}
.item-list-move{transition:transform .3s ease;}
.opt-list-enter-active,.opt-list-leave-active{transition:all .2s ease;}
.opt-list-enter-from{opacity:0;transform:translateX(-10px);}
.opt-list-leave-to{opacity:0;transform:translateX(10px);}
.opt-list-move{transition:transform .2s ease;}

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
