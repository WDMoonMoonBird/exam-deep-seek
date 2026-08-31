import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [vue(), legacy({ targets: ['chrome >= 69'] })],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    modulePreload: false,
    // 必须用 terser：vite 8.2+ 默认 oxc 压缩 legacy chunk，实测在 Chrome 69 触发
    // cssinjs 样式处理崩溃（Cannot read property '&'/'.anticon' of undefined，109 个报错）
    minify: 'terser',
  },
  base: '/exam/',
})
