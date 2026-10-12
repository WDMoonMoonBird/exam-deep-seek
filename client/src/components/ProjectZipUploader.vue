<template>
  <div class="zip-uploader">
    <!-- 选文件 -->
    <!-- 选择入口：圆形按钮（还原封装前 UI）；选完文件/回看有树后消失（不支持重新选择） -->
    <div v-if="!hasContent" class="kind-picker">
      <button class="kind-add-btn" @click="triggerUpload" :disabled="processing">
        <LoadingOutlined v-if="processing" spin />
        <span v-else>+</span>
      </button>
      <p class="kind-hint">{{ processing ? '正在解析中...' : hint }}</p>
      <input ref="fileInputRef" type="file" accept=".zip" style="display:none" @change="onFileChange" />
    </div>

    <!-- 错误提示 -->
    <a-alert v-if="errorMsg" type="error" :message="errorMsg" show-icon closable style="margin-top:8px" @close="errorMsg = ''" />

    <!-- 文件树（内部过滤树优先；外部 treeData 存在时（回看/提交后）显示外部树） -->
    <div v-if="visibleTree.length" class="zu-tree">
      <div class="zu-tree-head">
        <span class="zu-tree-title">资源管理器</span>
      </div>
      <a-tree
        :tree-data="visibleTree"
        :field-names="{ children: 'children', title: 'name', key: 'path' }"
        :expanded-keys="expandedKeys"
        :selected-keys="selectedKeys"
        :show-icon="true"
        @select="onTreeSelect"
        @expand="onTreeExpand"
      >
        <template #icon="{ type, path }">
          <FolderOutlined v-if="type === 'directory'" style="color:var(--status-warning-fg);font-size:var(--fs-body);" />
          <span v-else class="tree-icon fiv-icon" :class="getClassWithColor(path || '')"></span>
        </template>
        <template #title="{ name, type }">
          <span :class="type === 'directory' ? 'tree-dir' : 'tree-file'">{{ name }}</span>
        </template>
      </a-tree>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { LoadingOutlined, FolderOutlined } from '@ant-design/icons-vue';
import { getClassWithColor } from 'file-icons-js';
import 'file-icons-js/css/style.css';
import { useProjectUpload } from '../composables/useProjectUpload.js';

const props = defineProps({
  /** 过滤后展开大小上限（MB），超限拒绝 */
  sizeLimitMB: { type: Number, default: 50 },
  /** 禁用选择 */
  disabled: { type: Boolean, default: false },
  /** 外部文件树（回看/提交后服务端返回），存在时优先显示 */
  treeData: { type: Array, default: () => [] },
  /** 选择提示文案（还原原 UI：教师"点击上传标准工程包"/学生"点击上传项目文件"） */
  hint: { type: String, default: '点击上传工程文件（zip）' },
});

const emit = defineEmits(['update:package', 'ready', 'select', 'error']);

const fileInputRef = ref(null);
const expandedKeys = ref([]);
const selectedKeys = ref([]);

// 上传逻辑（composable：过滤重打包 + 大小校验 + 状态），UI 保持基线一致
const { processing, errorMsg, tree, packageFile, selectFile } = useProjectUpload({
  sizeLimitMB: props.sizeLimitMB,
});

/** 显示的树：外部 treeData（回看/提交后）优先，否则内部过滤树 */
const visibleTree = computed(() => (props.treeData.length ? props.treeData : tree.value));

/** 已选文件或已有树（回看）：选择按钮锁定；仅过滤失败（errorMsg）时解锁供重试 */
const hasContent = computed(() => tree.value.length > 0 || props.treeData.length > 0);

// 外部树（回看/提交后）就位时默认全展开
watch(
  () => props.treeData,
  (val) => {
    if (val?.length) expandedKeys.value = collectDirKeys(val);
  },
  { immediate: true, deep: false }
);

/** 收集全部目录节点 path，用于默认全展开 */
function collectDirKeys(nodes, acc = []) {
  for (const n of nodes || []) {
    if (n.type === 'directory') acc.push(n.path);
    if (n.children?.length) collectDirKeys(n.children, acc);
  }
  return acc;
}

function findNode(nodes, key) {
  for (const n of nodes || []) {
    if (n.path === key) return n;
    if (n.children) {
      const r = findNode(n.children, key);
      if (r) return r;
    }
  }
  return null;
}

function triggerUpload() {
  fileInputRef.value?.click();
}

async function onFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  // composable：过滤重打包 + 大小校验 + 状态更新；成功返回产出
  const r = await selectFile(file);
  if (!r) {
    // 失败（错误信息已在 composable.errorMsg）
    emit('error', errorMsg.value);
    return;
  }
  // 展示过滤后文件树（全展开）+ 统计
  expandedKeys.value = collectDirKeys(r.tree);
  selectedKeys.value = [];
  // 把过滤后的包交给使用方（上传动作由页面决定：教师立刻传、学生提交时传）
  emit('update:package', { blob: packageFile.value.blob, name: packageFile.value.name });
  emit('ready', {
    tree: r.tree,
    fileContents: r.fileContents,
    keptBytes: r.keptBytes,
    keptCount: r.keptCount,
  });
}

function onTreeSelect(keys) {
  if (!keys.length) return;
  const node = findNode(visibleTree.value, keys[0]);
  if (node && node.type === 'file') {
    selectedKeys.value = keys;
    emit('select', { path: node.path, name: node.name, language: node.language });
  }
}

function onTreeExpand(keys) {
  expandedKeys.value = keys;
}
</script>

<style scoped>
.zip-uploader { display:flex; flex-direction:column; height:100%; padding:10px 12px; }

/* 圆形选择按钮（还原封装前 kind-picker UI） */
.kind-picker { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; min-height:120px; }
.kind-add-btn { width:56px; height:56px; border-radius:50%; border:2px dashed var(--border-strong); background:var(--bg-surface-2); font-size:24px; color:var(--text-tertiary); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:var(--transition-control); }
.kind-add-btn:hover { border-color:var(--border-focus); color:var(--text-link); background:var(--bg-selected); }
.kind-add-btn:disabled { cursor:not-allowed; opacity:.8; animation:upload-pulse var(--duration-loop-pulse) var(--ease-in-out) infinite; }
.kind-hint { font-size:var(--fs-body-sm); color:var(--text-tertiary); transition:color var(--duration-base) var(--ease-out); }
@keyframes upload-pulse { 0%,100% { opacity:.6; } 50% { opacity:1; } }
.zu-tree { flex:1; overflow:auto; margin-top:10px; min-height:0; }
.zu-tree-head { display:flex; align-items:baseline; gap:8px; margin-bottom:6px; }
.zu-tree-title { font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-secondary); letter-spacing:.5px; }

.zu-tree :deep(.ant-tree) { background:transparent; font-size:var(--fs-body-sm); }
.zu-tree :deep(.ant-tree-treenode) { padding:1px 0; white-space:nowrap; }
.zu-tree :deep(.ant-tree-node-content-wrapper) { padding:0 6px 0 2px; overflow:hidden; text-overflow:ellipsis; }
.tree-icon { font-size:var(--fs-body); width:16px; text-align:center; display:inline-block; flex-shrink:0; }
.tree-dir { font-weight:500; }
.tree-file { font-weight:400; }
</style>
