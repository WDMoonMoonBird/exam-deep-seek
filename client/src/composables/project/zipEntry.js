/**
 * zipEntry.js —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 B1，源行 444-446 / 448-454 / 632-641）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */

// zip 条目名智能解码：先 UTF-8 严格，失败（Windows GBK 包）回退 GBK
const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true });
const GBK_DECODER = new TextDecoder('gbk');

/**
 * 本地 zip 解析（降级/内容预览用）：
 * 1) 解压全部条目（UTF-8 → GBK 智能解码文件名）
 * 2) 填 fileContents：所有文件内容，>1MB 不读内容、用占位字符串（控制内存）
 * 3) 返回全量文件树（教师上传失败时回退展示用）
 * 不再维护前端过滤清单（目录/扩展名黑名单已删除，避免与服务端双清单漂移），过滤以服务端为准
 */

function findFirstFile(nodes) {
  for (const n of nodes || []) {
    if (n.type === 'file') return n;
    if (n.children?.length) {
      const f = findFirstFile(n.children);
      if (f) return f;
    }
  }
  return null;
}

export { UTF8_STRICT, GBK_DECODER, findFirstFile };
