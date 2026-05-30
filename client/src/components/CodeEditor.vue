<template>
  <div class="code-editor-wrap">
    <div ref="editorRef" class="code-editor" :style="height ? { height: height + 'px' } : {}"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import loader from '@monaco-editor/loader';

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'cpp' },
  readOnly: { type: Boolean, default: false },
  height: { type: Number, default: 400 },
});

const emit = defineEmits(['update:modelValue']);

const editorRef = ref(null);
let editor = null;
let subscription = null;
let monaco = null;

onMounted(async () => {
  monaco = await loader.init();
  editor = monaco.editor.create(editorRef.value, {
    value: props.modelValue,
    language: props.language,
    readOnly: props.readOnly,
    minimap: { enabled: false },
    automaticLayout: true,
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    tabSize: 4,
  });

  subscription = editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.getValue());
  });
});

onUnmounted(() => {
  subscription?.dispose();
  editor?.dispose();
});

watch(() => props.language, (lang) => {
  if (editor && monaco) {
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, lang);
  }
});

watch(() => props.modelValue, (val) => {
  if (editor && val !== editor.getValue()) {
    editor.setValue(val);
  }
});

function format() {
  if (!editor) return;
  const lang = editor.getModel()?.getLanguageId();
  // Prettier 支持的语言
  if (['javascript', 'typescript', 'json', 'css', 'html', 'markdown'].includes(lang)) {
    editor.getAction('editor.action.formatDocument')?.run();
    return;
  }
  // C 系语言：简单括号缩进格式化
  if (['c', 'cpp', 'csharp', 'java'].includes(lang)) {
    const code = editor.getValue();
    editor.setValue(braceFormat(code));
    return;
  }
  // 其他语言：全选后 reindent
  editor.setSelection(editor.getModel().getFullModelRange());
  editor.trigger('format', 'editor.action.reindentSelectedLines');
}

function braceFormat(code) {
  let out = '';
  let indent = 0;
  const tab = '    ';
  const tokens = code.split(/([{};])/);
  for (const t of tokens) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    if (trimmed === '}') indent = Math.max(0, indent - 1);
    if (trimmed !== '{' && trimmed !== '}' && trimmed !== ';') {
      out += tab.repeat(indent) + trimmed + '\n';
    }
    if (trimmed === '{') { out = out.trimEnd() + ' {\n'; indent++; }
    if (trimmed === '}') { out += tab.repeat(indent) + '}\n'; }
    if (trimmed === ';') { out = out.trimEnd() + ';\n'; }
  }
  return out.trim();
}

defineExpose({ format });
</script>

<style scoped>
.code-editor-wrap {
  padding: 8px 0 0;
  height: 100%;
  display: flex;
}
.code-editor {
  width: 100%;
  height: 100%;
  border: none;
  overflow: hidden;
}
</style>
