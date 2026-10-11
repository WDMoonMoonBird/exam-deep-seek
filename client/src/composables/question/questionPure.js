/**
 * questionPure.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B1，源行 320-323 / 361-362 / 411 / 438-440 / 476 / 487-492 / 608-651 / 853）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * 纯叶子：零 vue / 零响应式 / 零内部依赖，被 U3/U4/U6/U10/U12 import。
 */
import DOMPurify from 'dompurify';

// 默认分值（固定值，不可配置）
const DEFAULT_TYPE_SCORES = { choice: 1, multi_choice: 2, judge: 1, fill: 1, code: 10 };

const SETTINGS_KEY = 'exam_question_settings';

const langs=['c','cpp','csharp','java','python','javascript','typescript','go','rust','ruby','php','swift','kotlin','sql','shell','r','scala','perl'];

// 题型徽标工具（模板 :139 / :210 直接绑定）
function itemTypeLabel(t){const m={choice:'单选',multi_choice:'多选',judge:'判断',fill:'填空'};return m[t]||t;}
function itemTypeColor(t){const m={choice:'blue',multi_choice:'purple',judge:'orange',fill:'green'};return m[t]||'default';}
/** T4-F2 类别收口（动态预置色）：题型徽标里三类解析成 antd 预置色且不达 AA —— judge→orange 亮 3.34:1、
    fill→green 亮 3.37:1、multi_choice→purple 暗 3.39:1 → 改走全局语义类（style.css，0-2-1 会接管三色，
    上面 :color 的预置色对这些类型只作保留写法，实际渲染由类决定）；choice→blue 亮 5.45:1 达标，按 captain 决定不动。 */
function itemTypeTagClass(t){const m={judge:'tag-warning',fill:'tag-success',multi_choice:'tag-accent'};return m[t]||null;}

function isCodeStem(s){return s&&(s.includes('```')||s.includes('{')||s.includes('function')||s.includes('class ')||s.includes('def ')||s.includes('import '));}

// 小问工厂与填空空数
function newItem(type,key){const b={key,type,stem:'',options:[],answer:'',score:DEFAULT_TYPE_SCORES[type]??1};if(type==='choice'){b.options=[{key:'A',text:''},{key:'B',text:''},{key:'C',text:''},{key:'D',text:''}];b.answer='A';}else if(type==='multi_choice'){b.options=[{key:'A',text:''},{key:'B',text:''},{key:'C',text:''},{key:'D',text:''}];b.answer='';}else if(type==='judge')b.answer='true';else if(type==='fill'){b._blankParts=[];b.score=0;}return b;}
function countBlanks(stem){return Math.max(1,(stem||'').match(/_{2,}/g)?.length||0);}
function updateFillBlanks(item){if(item.type!=='fill')return;const n=countBlanks(item.stem);item._blankParts=Array.from({length:n},(_,i)=>({answer:((item.answer||'').split(',')[i]||'').trim()}));if(!item.score||item.score<=0||item._autoBlanks!==n){item.score=n*(DEFAULT_TYPE_SCORES.fill||1);item._autoBlanks=n;}}

// 富文本净化：只放行表格/段落/预格式，ALLOWED_TAGS / ALLOWED_ATTR 白名单逐字未动
const _sanHtml = (s) => DOMPurify.sanitize(s, {
  ALLOWED_TAGS: ['table','thead','tbody','tr','th','td','p','span','b','br','pre','div'],
  ALLOWED_ATTR: ['style','class'],
});

// 试卷解析（规范化解码）
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

export { _sanHtml, DEFAULT_TYPE_SCORES, SETTINGS_KEY, langs,
  itemTypeLabel, itemTypeColor, itemTypeTagClass, isCodeStem,
  newItem, countBlanks, updateFillBlanks,
  normalizeJudgeAnswer, cleanOptionText, detectCodeLang, normalizeItem };
