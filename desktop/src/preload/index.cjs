/**
 * preload/index.cjs —— 极窄桥（CommonJS）。
 *
 * 为什么是 .cjs：sandbox:true 下不支持 ESM preload（Electron 官方 ESM 矩阵；A 基线 §3.4），
 * 且不得为迁就 .mjs 而关闭 sandbox。本桥只注入**只读**平台/版本信息，
 * 不暴露 fs、child_process、ipcRenderer 或任何 Node API。
 * v0 的渲染层（client 源码）不消费该桥；未来需要区分桌面行为时经 window.__DESKTOP__ 判定（计划 §2.4）。
 */
const { contextBridge } = require('electron');

const bridge = Object.freeze({
  isDesktop: true,
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }),
});

try {
  contextBridge.exposeInMainWorld('__DESKTOP__', bridge);
} catch {
  /* 桥失败不影响页面安全（页面本来就不依赖它） */
}
