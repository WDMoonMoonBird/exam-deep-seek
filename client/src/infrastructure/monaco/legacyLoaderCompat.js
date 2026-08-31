// legacyLoaderCompat.js — Monaco 旧浏览器兼容加载（infrastructure 层）
//
// 负责对 @monaco-editor/loader 单例的配置副作用（IO 收敛于 infrastructure）。
// 版本选择依据（0.24.0 验证记录）：
//   - 0.25+ 产物开始出现可选链 ?.；0.34.1 含 25 处空值合并 ??，均无法在旧内核解析
//   - 0.24.0：无可选链/空值合并/静态块；Promise.allSettled 为特性检测有 fallback；
//     worker 为 classic script（workerMain.js），兼容 Chrome 69
import { isLegacyBrowser } from '../../domain/browserCompat';

const LEGACY_MONACO_VS = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.24.0/min/vs';

// 在 loader.init() 之前调用：旧浏览器切换到兼容版 Monaco
export function applyMonacoCompat(loader) {
  if (isLegacyBrowser()) {
    loader.config({ paths: { vs: LEGACY_MONACO_VS } });
  }
}
