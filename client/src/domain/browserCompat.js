// browserCompat.js — 浏览器能力检测（Chrome 69 等旧内核兼容分流）
//
// 注意：本文件必须保持 ES5/ES2015 写法，禁止使用可选链/空值合并等新语法——
// 否则在旧浏览器上文件自身解析失败，检测逻辑无法执行。
//
// 本文件仅含纯检测函数（domain 层契约：纯逻辑下沉 domain、IO 收敛 infrastructure）。
// Monaco 配置副作用见 infrastructure/monaco/legacyLoaderCompat.js。
//
// 判定为 legacy 的条件（满足其一）：
//   1. 不支持 :where() 选择器（Chrome < 88）——antd cssinjs 默认 low 模式样式会被丢弃
//   2. 不支持可选链语法（Chrome < 80）

export function isLegacyBrowser() {
  try {
    // :where() 支持检测（CSS.supports 对未知条件返回 false，不抛错）
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
      if (!CSS.supports('selector(:where(x))')) {
        return true;
      }
    }
    // 可选链语法检测（Function 构造器在旧浏览器解析该字符串会抛 SyntaxError）
    new Function('a?.b');
  } catch {
    return true;
  }
  return false;
}
