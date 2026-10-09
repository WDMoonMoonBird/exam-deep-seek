<template>
  <div class="rich-editor" :class="{ focused }">
    <div v-if="editor" class="toolbar">
      <!-- 行内格式 -->
      <button @click="editor.chain().focus().toggleBold().run()" :class="{ active: editor.isActive('bold') }" title="加粗"><strong>B</strong></button>
      <button @click="editor.chain().focus().toggleItalic().run()" :class="{ active: editor.isActive('italic') }" title="斜体"><em>I</em></button>
      <button @click="editor.chain().focus().toggleUnderline().run()" :class="{ active: editor.isActive('underline') }" title="下划线"><u>U</u></button>
      <button @click="editor.chain().focus().toggleStrike().run()" :class="{ active: editor.isActive('strike') }" title="删除线"><s>S</s></button>
      <button @click="editor.chain().focus().toggleCode().run()" :class="{ active: editor.isActive('code') }" title="行内代码">&lt;/&gt;</button>
      <button @click="editor.chain().focus().toggleHighlight().run()" :class="{ active: editor.isActive('highlight') }" title="高亮" style="background: var(--status-warning-bg)">H</button>
      <span class="sep" />
      <!-- 文字颜色 -->
      <input type="color" class="color-pick" @input="setColor($event.target.value)" title="文字颜色" />
      <span class="sep" />
      <!-- 标题 -->
      <button @click="editor.chain().focus().toggleHeading({ level: 2 }).run()" :class="{ active: editor.isActive('heading', { level: 2 }) }" title="标题2">H2</button>
      <button @click="editor.chain().focus().toggleHeading({ level: 3 }).run()" :class="{ active: editor.isActive('heading', { level: 3 }) }" title="标题3">H3</button>
      <span class="sep" />
      <!-- 对齐 -->
      <button @click="editor.chain().focus().setTextAlign('left').run()" :class="{ active: editor.isActive({ textAlign: 'left' }) }" title="左对齐">≡</button>
      <button @click="editor.chain().focus().setTextAlign('center').run()" :class="{ active: editor.isActive({ textAlign: 'center' }) }" title="居中">≡</button>
      <button @click="editor.chain().focus().setTextAlign('right').run()" :class="{ active: editor.isActive({ textAlign: 'right' }) }" title="右对齐">≡</button>
      <span class="sep" />
      <!-- 列表 -->
      <button @click="editor.chain().focus().toggleBulletList().run()" :class="{ active: editor.isActive('bulletList') }" title="无序列表">•</button>
      <button @click="editor.chain().focus().toggleOrderedList().run()" :class="{ active: editor.isActive('orderedList') }" title="有序列表">1.</button>
      <button @click="editor.chain().focus().toggleTaskList().run()" :class="{ active: editor.isActive('taskList') }" title="待办">☑</button>
      <span class="sep" />
      <button @click="editor.chain().focus().toggleBlockquote().run()" :class="{ active: editor.isActive('blockquote') }" title="引用">❝</button>
      <button @click="editor.chain().focus().toggleCodeBlock().run()" :class="{ active: editor.isActive('codeBlock') }" title="代码块">&lt;{&gt;</button>
      <span class="sep" />
      <button @click="addLink" :class="{ active: editor.isActive('link') }" title="链接">🔗</button>
      <button @click="addImage" title="图片">🖼</button>
      <button @click="showTableDialog = true" title="表格">⊞</button>
      <span class="sep" />
      <button @click="editor.chain().focus().setHorizontalRule().run()" title="分割线">—</button>
      <button @click="editor.chain().focus().undo().run()" title="撤销">↩</button>
      <button @click="editor.chain().focus().redo().run()" title="重做">↪</button>
    </div>
    <editor-content :editor="editor" />

    <!-- 表格行列数选择弹窗 -->
    <Teleport to="body">
      <div v-if="showTableDialog" class="table-dialog-overlay" @click.self="showTableDialog = false">
        <div class="table-dialog">
          <div class="table-dialog-title">插入表格</div>
          <div class="table-dialog-row">
            <label>行数</label>
            <input type="number" v-model.number="tableRows" min="1" max="20" />
          </div>
          <div class="table-dialog-row">
            <label>列数</label>
            <input type="number" v-model.number="tableCols" min="1" max="10" />
          </div>
          <div class="table-dialog-actions">
            <button @click="showTableDialog = false">取消</button>
            <button class="primary" @click="insertTable">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '请输入内容...' },
});
const emit = defineEmits(['update:modelValue']);

const focused = ref(false);
const showTableDialog = ref(false);
const tableRows = ref(3);
const tableCols = ref(3);

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    // Tiptap 3 的 StarterKit 已内置 link/underline，需显式禁用避免重复注册警告
    StarterKit.configure({ link: false, underline: false }),
    Placeholder.configure({ placeholder: props.placeholder }),
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Link.configure({ openOnClick: false }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ allowBase64: false, inline: false }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
  ],
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML());
  },
  onFocus: () => { focused.value = true; },
  onBlur: () => { focused.value = false; },
});

function setColor(color) {
  editor.value?.chain().focus().setColor(color).run();
}

function addLink() {
  if (editor.value?.isActive('link')) {
    editor.value.chain().focus().unsetLink().run();
    return;
  }
  const url = window.prompt('请输入链接 URL（含 https://）：');
  if (url) {
    editor.value?.chain().focus().setLink({ href: url }).run();
  }
}

function addImage() {
  const url = window.prompt('请输入图片 URL：');
  if (url) {
    editor.value?.chain().focus().setImage({ src: url }).run();
  }
}

function insertTable() {
  editor.value?.chain().focus().insertTable({
    rows: tableRows.value,
    cols: tableCols.value,
    withHeaderRow: true,
  }).run();
  showTableDialog.value = false;
  tableRows.value = 3;
  tableCols.value = 3;
}

watch(() => props.modelValue, (val) => {
  if (editor.value && val !== editor.value.getHTML()) {
    editor.value.commands.setContent(val, false);
  }
});

onUnmounted(() => {
  editor.value?.destroy();
});
</script>

<style scoped>
.rich-editor {
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition: border-color 0.2s;
  background: var(--bg-surface);
}
.rich-editor.focused {
  border-color: var(--border-focus);
  box-shadow: var(--ring-focus);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface-2);
  flex-wrap: wrap;
}
.toolbar button {
  width: 30px;
  height: 28px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  cursor: pointer;
  font-size: var(--fs-body-sm);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast);
  flex-shrink: 0;
}
.toolbar button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.toolbar button.active {
  background: var(--bg-selected);
  color: var(--text-link);
}
.toolbar .sep {
  width: 1px;
  height: 20px;
  background: var(--border-strong);
  margin: 0 4px;
  flex-shrink: 0;
}
.color-pick {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  padding: 0;
  cursor: pointer;
}
.color-pick::-webkit-color-swatch-wrapper { padding: 0; }
.color-pick::-webkit-color-swatch { border-radius: 3px; border: none; }

/* 表格弹窗 */
.table-dialog-overlay {
  position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: var(--bg-overlay); z-index: 9999;
  display: flex; align-items: center; justify-content: center;
}
.table-dialog {
  background: var(--bg-surface); border-radius: var(--radius-lg); padding: 24px; width: 280px;
  box-shadow: var(--shadow-lg);
}
.table-dialog-title { font-size: var(--fs-title-3); font-weight: 600; margin-bottom: 16px; }
.table-dialog-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.table-dialog-row label { width: 40px; font-size: var(--fs-body); color: var(--text-secondary); }
.table-dialog-row input {
  flex: 1; height: 32px; padding: 0 8px; border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm); font-size: var(--fs-body); outline: none;
}
.table-dialog-row input:focus { border-color: var(--border-focus); }
.table-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.table-dialog-actions button {
  height: 32px; padding: 0 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong);
  background: var(--bg-surface); cursor: pointer; font-size: var(--fs-body-sm);
}
.table-dialog-actions button.primary { background: var(--btn-primary-bg); color: var(--btn-primary-fg); border-color: var(--btn-primary-bg); }

:deep(.tiptap) {
  padding: 12px 16px; min-height: 160px; outline: none; font-size: var(--fs-body); line-height: 1.7;
  /* 正文颜色显式绑令牌：否则继承 antd 的 rgba(0,0,0,.88)，暗色深底上对比度仅 1.19:1 */
  color: var(--text-primary);
}
:deep(.tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder); color: var(--text-disabled); pointer-events: none; float: left; height: 0;
}
:deep(.tiptap h2) { font-size: 1.25em; margin: 0.5em 0; }
:deep(.tiptap h3) { font-size: 1.1em; margin: 0.4em 0; }
:deep(.tiptap code) { background: var(--bg-sunken); padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
:deep(.tiptap pre) { background: var(--code-bg); color: var(--code-fg); padding: 12px 16px; border-radius: var(--radius-sm); overflow-x: auto; }
:deep(.tiptap blockquote) { border-left: 3px solid var(--border-strong); padding-left: 16px; color: var(--text-secondary); margin: 0.5em 0; }
:deep(.tiptap ul, .tiptap ol) { padding-left: 24px; }
:deep(.tiptap hr) { border: none; border-top: 1px solid var(--border-strong); margin: 1em 0; }
:deep(.tiptap a) { color: var(--text-link); text-decoration: underline; cursor: pointer; }
:deep(.tiptap mark) { background: var(--status-warning-bg); padding: 1px 4px; border-radius: 2px; }
:deep(.tiptap ul[data-type="taskList"] li) { display: flex; align-items: flex-start; gap: 8px; }
:deep(.tiptap ul[data-type="taskList"] li label) { margin-top: 2px; }

:deep(.tiptap img) { max-width: 100%; border-radius: var(--radius-xs); margin: 0.5em 0; }

:deep(.tiptap table) { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
:deep(.tiptap th) { background: var(--bg-sunken); border: 1px solid var(--border-strong); padding: 8px 12px; font-weight: 600; text-align: left; }
:deep(.tiptap td) { border: 1px solid var(--border-strong); padding: 6px 12px; }
:deep(.tiptap .selectedCell) { background: var(--bg-selected); }
</style>
