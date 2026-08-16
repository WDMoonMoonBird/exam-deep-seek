<template>
  <div class="page">
    <div class="page-header">
      <h2>{{ isEdit ? '编辑任务' : '新建任务' }}</h2>
    </div>

    <a-form :model="form" layout="vertical" class="edit-form" :labelCol="{ span: 4 }">
      <!-- 基本信息 -->
      <a-card title="基本信息" size="small" class="section-card">
        <a-form-item label="任务标题" required>
          <a-input v-model:value="form.title" placeholder="请输入任务标题" :maxlength="200" />
        </a-form-item>
        <a-form-item label="任务描述">
          <a-textarea v-model:value="form.description" :rows="4" placeholder="请输入任务描述（可选）" />
        </a-form-item>
        <a-form-item label="截止时间" required>
          <a-date-picker v-model:value="form.endTime" show-time placeholder="选择截止时间" style="width:100%" />
        </a-form-item>
        <a-form-item label="发布班级" required>
          <a-select v-model:value="form.classIds" mode="multiple" placeholder="选择班级" :loading="loadingClasses">
            <a-select-option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-card>

      <!-- 标准工程包 -->
      <a-card title="标准工程包" size="small" class="section-card">
        <a-upload
          :beforeUpload="handleUpload"
          :showUploadList="false"
          accept=".zip"
          :disabled="uploading"
        >
          <a-button :loading="uploading">
            <UploadOutlined />
            {{ fileTree.length ? '重新上传' : '上传 zip 工程包' }}
          </a-button>
        </a-upload>
        <div v-if="fileTree.length" class="file-tree-preview">
          <div class="file-tree-title">已上传文件结构（{{ fileCount }} 个文件，{{ formatSize(totalSize) }}）</div>
          <a-tree
            :tree-data="fileTree"
            :fieldNames="{ children: 'children', title: 'name', key: 'path' }"
            defaultExpandAll
            :showIcon="false"
            size="small"
          />
        </div>
      </a-card>

      <!-- 评分权重 -->
      <a-card title="评分权重" size="small" class="section-card">
        <div class="weight-row">
          <span class="weight-label">机器校验 ({{ form.machineWeight }}%)</span>
          <a-slider
            v-model:value="form.machineWeight"
            :min="0" :max="100" :step="5"
            style="flex:1;margin:0 16px"
            @change="onMachineWeightChange"
          />
        </div>
        <div class="weight-row">
          <span class="weight-label">AST 分析 ({{ form.astWeight }}%)</span>
          <a-slider
            v-model:value="form.astWeight"
            :min="0" :max="100" :step="5"
            style="flex:1;margin:0 16px"
            @change="onAstWeightChange"
          />
        </div>
        <div class="weight-row">
          <span class="weight-label">AI 评审 ({{ form.aiWeight }}%)</span>
          <a-slider
            v-model:value="form.aiWeight"
            :min="0" :max="100" :step="5"
            style="flex:1;margin:0 16px"
            @change="onAiWeightChange"
          />
        </div>
        <div v-if="weightSum !== 100" class="weight-warn">权重合计 {{ weightSum }}%，应为 100%</div>
      </a-card>

      <!-- 机器校验配置 -->
      <a-card title="机器校验配置" size="small" class="section-card">
        <a-checkbox v-model:checked="form.machineConfig.checkCompile">编译检查</a-checkbox>
        <span class="hint-text">（P0 仅支持 Java javac 和 Python py_compile 编译检查）</span>
      </a-card>

      <!-- AI 提示词 -->
      <a-card title="AI 评审提示词（可选）" size="small" class="section-card">
        <a-textarea
          v-model:value="form.aiPromptExtra"
          :rows="3"
          placeholder="附加提示词，如：请特别关注代码中是否使用了设计模式..."
        />
      </a-card>

      <!-- 底部按钮 -->
      <div class="form-footer">
        <a-button @click="$router.back()">取消</a-button>
        <a-space style="margin-left:auto">
          <a-button @click="save('draft')" :loading="saving">保存草稿</a-button>
          <a-button type="primary" @click="save('published')" :loading="saving">保存并发布</a-button>
        </a-space>
      </div>
    </a-form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { UploadOutlined } from '@ant-design/icons-vue';
import { createProject, updateProject, getProject, uploadPackage } from '../../api/projects.js';
import request from '../../api/request.js';

const router = useRouter();
const route = useRoute();
const isEdit = computed(() => !!route.params.id);
const saving = ref(false);
const uploading = ref(false);
const loadingClasses = ref(false);
const classes = ref([]);
const fileTree = ref([]);
const fileCount = ref(0);
const totalSize = ref(0);
const tempId = ref('');

const form = reactive({
  title: '',
  description: '',
  endTime: null,
  classIds: [],
  machineWeight: 30,
  astWeight: 30,
  aiWeight: 40,
  machineConfig: { checkCompile: true },
  aiPromptExtra: '',
});

const weightSum = computed(() => form.machineWeight + form.astWeight + form.aiWeight);

function onMachineWeightChange(val) {
  const remaining = 100 - val;
  form.astWeight = Math.round(remaining * form.astWeight / (form.astWeight + form.aiWeight || 1) / 5) * 5;
  form.aiWeight = remaining - form.astWeight;
}

function onAstWeightChange(val) {
  const remaining = 100 - val;
  form.machineWeight = Math.round(remaining * form.machineWeight / (form.machineWeight + form.aiWeight || 1) / 5) * 5;
  form.aiWeight = remaining - form.machineWeight;
}

function onAiWeightChange(val) {
  const remaining = 100 - val;
  form.machineWeight = Math.round(remaining * form.machineWeight / (form.machineWeight + form.astWeight || 1) / 5) * 5;
  form.astWeight = remaining - form.machineWeight;
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function handleUpload(file) {
  uploading.value = true;
  try {
    const formData = new FormData();
    formData.append('file', file);
    const r = await uploadPackage(formData);
    fileTree.value = r.data.tree || [];
    fileCount.value = r.data.fileCount || 0;
    totalSize.value = r.data.totalSize || 0;
    tempId.value = r.data.tempId || '';
    message.success(`上传成功，${fileCount.value} 个文件`);
  } catch {
    message.error('上传失败');
  }
  uploading.value = false;
  return false; // 阻止默认上传
}

async function loadClasses() {
  loadingClasses.value = true;
  try {
    const r = await request.get('/teacher/classes');
    classes.value = r.data || [];
  } catch { /* ignore */ }
  loadingClasses.value = false;
}

async function loadProject() {
  if (!isEdit.value) return;
  try {
    const r = await getProject(route.params.id);
    const p = r.data;
    form.title = p.title;
    form.description = p.description || '';
    form.endTime = p.endTime ? dayjs(p.endTime) : null;
    form.classIds = p.classes?.map(c => c.class?.id).filter(Boolean) || [];
    form.machineWeight = Math.round((p.machineWeight || 0.3) * 100);
    form.astWeight = Math.round((p.astWeight || 0.3) * 100);
    form.aiWeight = Math.round((p.aiWeight || 0.4) * 100);
    form.machineConfig = p.machineConfig || { checkCompile: true };
    form.aiPromptExtra = p.aiPromptExtra || '';
    fileTree.value = p.fileTree || [];
    fileCount.value = p.files?.length || (p.fileTree ? countFiles(p.fileTree) : 0);
  } catch { /* ignore */ }
}

function countFiles(tree) {
  let count = 0;
  for (const n of tree) {
    if (n.type === 'file') count++;
    if (n.children) count += countFiles(n.children);
  }
  return count;
}

async function save(status) {
  if (!form.title) return message.warn('请输入任务标题');
  if (!form.endTime) return message.warn('请选择截止时间');
  if (!form.classIds.length) return message.warn('请选择发布班级');
  if (weightSum.value !== 100) return message.warn('评分权重合计必须为 100%');

  saving.value = true;
  try {
    const data = {
      title: form.title,
      description: form.description,
      // 仅新建时提交 startTime；编辑时不带该字段（后端 updateProject 对未传字段不做更新），
      // 避免每次编辑都把任务开始时间重置为当前时间
      ...(isEdit.value ? {} : { startTime: new Date().toISOString() }),
      endTime: form.endTime.toISOString(),
      machineWeight: form.machineWeight / 100,
      astWeight: form.astWeight / 100,
      aiWeight: form.aiWeight / 100,
      machineConfig: form.machineConfig,
      aiPromptExtra: form.aiPromptExtra || null,
      classIds: form.classIds,
      tempId: tempId.value || undefined,
      status,
    };

    if (isEdit.value) {
      await updateProject(route.params.id, data);
      message.success('更新成功');
    } else {
      await createProject(data);
      message.success('创建成功');
    }
    router.push('/teacher/projects');
  } catch { /* handled by interceptor */ }
  saving.value = false;
}

import dayjs from 'dayjs';

onMounted(() => {
  loadClasses();
  loadProject();
});
</script>

<style scoped>
.page {
  max-width: 900px;
  height: 100%;
  overflow-y: auto;
}
.page-header {
  margin-bottom: 20px;
}
.page-header h2 {
  font-size: 28px;
  margin: 0;
}
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.section-card {
  border: 1px solid #f0f0f0;
}
.file-tree-preview {
  margin-top: 12px;
  padding: 12px;
  background: #fafafa;
  border-radius: 6px;
  max-height: 300px;
  overflow-y: auto;
}
.file-tree-title {
  font-size: 13px;
  color: var(--ink-muted);
  margin-bottom: 8px;
}
.weight-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.weight-label {
  width: 160px;
  font-size: 13px;
  flex-shrink: 0;
}
.weight-warn {
  color: #ff4d4f;
  font-size: 13px;
  margin-top: 8px;
}
.hint-text {
  color: var(--ink-muted);
  font-size: 12px;
  margin-left: 8px;
}
.form-footer {
  display: flex;
  align-items: center;
  padding: 16px 0;
  border-top: 1px solid #f0f0f0;
  margin-top: 8px;
}
</style>
