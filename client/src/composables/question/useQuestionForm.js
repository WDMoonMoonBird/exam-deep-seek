/**
 * useQuestionForm.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B2，源行 339-343 / 434）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * form 所有权唯一：其余单元一律以参数接收同一 reactive 引用（模板 12 处 v-model 绑在它上面）。
 */
import { reactive, computed } from 'vue';

export function useQuestionForm() {
const form = reactive({
  title:'',difficulty:'easy',material:'',
  sqTitle:'',sqScore:null,content:'',referenceAnswer:'',
  language:'cpp',objectiveItems:[],scoringCriteria:'',
});

const hasMaterial = computed(()=>{const h=form.material||'';return h.replace(/<[^>]*>/g,'').trim().length>0;});

  return { form, hasMaterial };
}

export default useQuestionForm;
