/**
 * 项目类型检测 —— 从标准工程包文件树（路径集合）识别语言/框架。
 * 供自动评分器向导展示"已识别项目类型"（2026-08-18 起替代写死的 mock 值）。
 * 规则：Java 系优先（pom/gradle/.java），其次 Vue/React/Node（package.json），
 * 再 Python（.py/requirements.txt）、Go（go.mod），未命中为通用工程。
 * @param {Array} tree antd tree 节点数组（{name, type, path, children}）
 * @returns {{ label: string, paths: number }}
 */
export function detectProjectType(tree) {
  const paths = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n && typeof n.path === 'string') paths.push(n.path);
      if (n && Array.isArray(n.children)) walk(n.children);
    }
  };
  walk(tree);

  const text = paths.join('\n');
  // 多行匹配：$ 锚定到每一行（每个文件路径）末尾
  const has = (re) => new RegExp(re.source, 'm').test(text);
  const count = (re) => paths.filter((p) => re.test(p)).length;

  if (!paths.length) return { label: '待识别（需先上传标准工程包）', paths: 0 };

  // ---- Java 系 ----
  if (has(/pom\.xml$/) || has(/build\.gradle$/) || has(/settings\.gradle$/) || count(/\.java$/) > 0) {
    if (has(/spring-mvc\.xml$/) || has(/WEB-INF\//) || has(/applicationContext[^/]*\.xml$/) || has(/spring-boot/) || has(/@SpringBootApplication/)) {
      return { label: 'Java Spring 工程', paths: paths.length };
    }
    return { label: 'Java 工程', paths: paths.length };
  }

  // ---- 前端（package.json 系）----
  if (has(/package\.json$/)) {
    if (count(/\.vue$/) > 0) return { label: 'Vue 前端工程', paths: paths.length };
    if (count(/\.(jsx|tsx)$/) > 0) return { label: 'React 前端工程', paths: paths.length };
    if (count(/\.(js|ts)$/) > 0) return { label: 'Node.js 工程', paths: paths.length };
  }

  // ---- Python / Go ----
  if (has(/requirements\.txt$/) || has(/setup\.py$/) || has(/pyproject\.toml$/) || count(/\.py$/) > 0) {
    return { label: 'Python 工程', paths: paths.length };
  }
  if (has(/go\.mod$/)) return { label: 'Go 工程', paths: paths.length };

  return { label: '通用工程项目', paths: paths.length };
}
