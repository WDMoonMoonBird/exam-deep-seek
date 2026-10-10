// legacyLoaderCompat.js — Monaco 旧浏览器兼容加载（infrastructure 层）
//
// 负责对 @monaco-editor/loader 单例的配置副作用（IO 收敛于 infrastructure）。
// 版本选择依据（0.24.0 验证记录）：
//   - 0.25+ 产物开始出现可选链 ?.；0.34.1 含 25 处空值合并 ??，均无法在旧内核解析
//   - 0.24.0：无可选链/空值合并/静态块；Promise.allSettled 为特性检测有 fallback；
//     worker 为 classic script（workerMain.js），兼容 Chrome 69
import { isLegacyBrowser } from '../../domain/browserCompat';

// R-1 本地化（t15）：0.24.0 的 min/vs 已作为**仓库资产**放在 client/public/monaco-legacy/vs，
// 与原 CDN 同源同版本（来源、integrity/shasum、重新提取与升级步骤见 client/public/monaco-legacy/README.md），
// 只是改由本站提供 —— 校园网无外网时旧内核也能用编辑器。路径随 vite base 走（不写死 /exam）。
// 布局必须整目录：AMD 入口会按 vs/ 相对路径再取 basic-languages/、language/*.js 与 base/worker/workerMain.js。
const LEGACY_MONACO_VS = import.meta.env.BASE_URL + 'monaco-legacy/vs';

// 在 loader.init() 之前调用：旧浏览器切换到兼容版 Monaco
export function applyMonacoCompat(loader) {
  if (isLegacyBrowser()) {
    loader.config({ paths: { vs: LEGACY_MONACO_VS } });
  }
}
