<template>
  <PageShell
    title="学生管理"
    description="维护学生账号，并把学生分配到班级。"
    :max-width="'var(--layout-content-max)'"
  >
    <template #actions>
      <a-button type="primary" @click="openAdd">新增学生</a-button>
    </template>

    <!-- TODO(P1-7): 接口支持服务端分页后切换（/admin/students 目前全量返回，暂由前端切片） -->
    <ListPage
      :columns="columns"
      :data-source="pagedList"
      :loading="loading"
      row-key="id"
      :total="list.length"
      :current="page.current"
      :page-size="page.pageSize"
      empty-title="还没有学生"
      empty-desc="新增学生后，即可把学生加入班级并参加作业。"
      empty-action-text="新增学生"
      @page-change="onPageChange"
      @empty-action="openAdd"
    >
      <template #bodyCell="{ column, record }">
        <!-- 学号：等宽字体，横向比对不受字宽影响（列只写了 dataIndex，故按 column.dataIndex 判断） -->
        <template v-if="column.dataIndex === 'username'">
          <span class="lp-mono">{{ record.username }}</span>
        </template>

        <!-- 姓名：两行式（姓名 + 班级名）；班级不再单列，多个班级用「、」连接、超过 2 个折叠为 +N -->
        <template v-else-if="column.key === 'realName'">
          <span class="lp-stack">
            <b>{{ record.realName }}</b>
            <span>{{ classSummary(record) }}</span>
          </span>
        </template>

        <template v-else-if="column.key === 'createdAt'">{{ formatDate(record.createdAt) }}</template>
      </template>
    </ListPage>

    <a-modal title="新增学生" :open="visible" @ok="handleOk" @cancel="visible = false" ok-text="新增学生" cancel-text="取消" :width="480">
      <a-form :model="form">
        <!-- T5-A2：可见 label 用 id + html-for 关联（antd FormItem 只有拿到 name/html-for 才渲染 label[for]），
             不新增 aria-label 以免与可见文案重复 -->
        <a-form-item label="学号" html-for="admin-student-username">
          <a-input id="admin-student-username" v-model:value="form.username" />
        </a-form-item>
        <a-form-item label="姓名" html-for="admin-student-realname">
          <a-input id="admin-student-realname" v-model:value="form.realName" />
        </a-form-item>
        <a-form-item label="班级" html-for="admin-student-class">
          <a-select id="admin-student-class" v-model:value="form.classIds" mode="multiple" placeholder="选择班级">
            <a-select-option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import { useSafeRequest } from '../../composables/useSafeRequest.js';   // ★W1（t1）：失败就地提示、不冒泡
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import { formatDate } from '../../domain/format.js';
const { safeLoad, safeSubmit } = useSafeRequest({ tag: 'admin/Students.vue' });
const loading = ref(false);
const list = ref([]);
const page = reactive({ current: 1, pageSize: 20 });
const classes = ref([]);
const visible = ref(false);
const form = reactive({ username: '', realName: '', classIds: [] });

// 列表样式 v2：姓名列两行式（姓名 + 班级，原「班级」列并入次行）；学号等宽；日期列不换行、窄屏隐藏
const columns = [
  { title: '学号', dataIndex: 'username', width: 150 },
  { title: '姓名', key: 'realName', dataIndex: 'realName', width: '1fr' },
  { title: '创建时间', key: 'createdAt', width: 120, responsive: ['xl'] },
];

/** 姓名列次行：班级名（多个用「、」连接，超过 2 个只显示前 2 个 + 「+N」；无班级同改前的「—」） */
function classSummary(record) {
  const names = (record.studentClasses || []).map((sc) => sc.class?.name).filter(Boolean);
  if (!names.length) return '—';
  return names.length > 2 ? `${names.slice(0, 2).join('、')} +${names.length - 2}` : names.join('、');
}

/** /admin/students 目前全量返回 → 保持前端切片分页（见模板 TODO(P1-7)） */
const pagedList = computed(() => {
  const start = (page.current - 1) * page.pageSize;
  return list.value.slice(start, start + page.pageSize);
});

function onPageChange(p) {
  page.current = p;
}

async function fetch() {
  loading.value = true;
  try {
    const r = await safeLoad(() => request.get('/admin/students'), { action: '加载学生列表' });
    if (!r.error) list.value = r.data || [];
  } finally {
    loading.value = false;
  }
}

async function openAdd() {
  form.username = ''; form.realName = ''; form.classIds = [];
  const r = await safeLoad(() => request.get('/admin/classes'), { action: '加载班级列表' });
  if (!r.error) classes.value = r.data || [];
  visible.value = true;
}

async function handleOk() {
  // ★W1（t1）④：提交前必填校验（学号 / 姓名）—— 从源头避免 400
  if (!String(form.username || '').trim() || !String(form.realName || '').trim()) {
    message.warning('请填写学号与姓名');
    return;
  }
  const r = await safeSubmit(() => request.post('/admin/students', { ...form }), { action: '新增' });
  if (r.error) return;
  visible.value = false;
  // ★H6（W2-P2d）：新建学生返回**一次性随机口令**（在响应 message 内）⇒ 必须回显；否则该账号无人知晓口令
  const text = (r.res && r.res.message) || '新增成功';
  const oneTime = !!(r.res && r.res.data && r.res.data.initialPassword);
  if (oneTime) message.success(text + '（该口令仅显示一次，请立即转交本人）', 8);
  else message.success(text);
  fetch();
}

onMounted(fetch);
</script>

<style scoped>
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}
</style>
