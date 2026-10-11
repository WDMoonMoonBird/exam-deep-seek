import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'

/* ===========================================================================
 * Monaco 运行时本地化（缺陷 R-1）
 * ---------------------------------------------------------------------------
 * 背景：三处 loader.init() 用的 @monaco-editor/loader 默认从
 *   https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs 拉 AMD 运行时
 *   （loader.js → vs/editor/editor.main + 语言/worker 分片，QA 实测 15 个文件 ≈1MB）。
 * 本系统部署在校园网：无外网时编辑器完全不可用（作答、实训出题/审核全被阻塞）。
 *
 * 做法（不新增依赖）：把**已安装**的 monaco-editor 包的 min/vs 目录当本站资产提供，
 * 客户端把 loader 的 paths.vs 指到 <base>/monaco/vs（三处调用点各自配置，见组件内注释）：
 *   · dev  ：本插件中间件把 <base>/monaco/vs/** 实时映射到 node_modules/monaco-editor/min/vs（不复制）
 *   · build：closeBundle 把整目录拷到 dist/monaco/vs
 * 必须整目录（vs 布局）：index 的 vs/editor/editor.main.js 是 AMD 模块，按 vs/ 相对路径再取
 * basic-languages/、language/、monaco.contribution-*.js 与 assets/*.worker-*.js。
 * 路径经 Vite base（/exam/）拼接，故部署前缀下同样成立；nginx 仍只做 dist 静态服务，无需改配置。
 * 旧内核（Chrome < 88）走既有兼容分流（infrastructure/monaco/legacyLoaderCompat.js），其 0.24.0 资产
 * 由 public/monaco-legacy/（vendored，来源/版本/升级见该目录 README.md）经 publicDir 提供，
 * 本插件不管那条（资产是静态的，dev/build 都由 Vite 自己处理）。
 * 另有 monacoLoaderLocalDefault()：构建期把 loader 的**内置默认**基址也换成本站路径，使产物不含任何 CDN 串。
 * =========================================================================== */

const MONACO_VS_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'node_modules/monaco-editor/min/vs')
const MONACO_VS_SUBDIR = 'monaco/vs'

const MONACO_MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
}

/**
 * monacoLoaderLocalDefault —— 把 @monaco-editor/loader 的**内置默认**基址
 * （默认值即 https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs，见该包 lib/{es,cjs}/config/index.js）
 * 在构建期换成本站路径，使产物里不再出现任何 CDN 串（静态 externals=0）。
 * 做法：把 loader 内部对 '../config/index.js' 的导入替换为虚拟模块（改配置默认值，而非字符串替换）。
 * 三处调用点本就会显式 loader.config(...)，即使此处匹配失败也不影响运行；只是静态串会回来，
 * closeBundle 的守卫会就此告警（不阻断构建）。
 */
function monacoLoaderLocalDefault() {
  const VIRTUAL_ID = '\0monaco-loader-local-default'
  let base = '/'
  return {
    name: 'monaco-loader-local-default',
    enforce: 'pre',
    configResolved(config) { base = config.base },
    resolveId(source, importer) {
      if (importer && /@monaco-editor[\\/]loader/.test(importer) && /(?:^|\/)config\/index\.js$/.test(source)) return VIRTUAL_ID
      return null
    },
    load(id) {
      if (id !== VIRTUAL_ID) return null
      return 'export default { paths: { vs: ' + JSON.stringify(base + MONACO_VS_SUBDIR) + ' } }\n'
    },
  }
}

function monacoLocalVs() {
  let outDir = ''
  let base = '/'
  return {
    name: 'monaco-local-vs',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      base = config.base
    },
    /**
     * dev：<base>/monaco/vs/** → node_modules/monaco-editor/min/vs/**
     * 直接 use（不返回后置钩子）= 注册在 Vite 内置中间件**之前**，避免请求先被静态/SPA 回退吃掉；
     * 同时兼容 req.url 已被 base 中间件剥掉前缀的情况（两种情况都判一遍）。
     */
    configureServer(server) {
      const handler = (req, res, next) => {
        let url = (req.url || '').split('?')[0]
        // Vite 的 base 中间件可能已剥掉前缀，这里两种形态都归一化成 /monaco/vs/...
        if (base !== '/' && url.startsWith(base)) url = '/' + url.slice(base.length)
        const prefix = '/' + MONACO_VS_SUBDIR + '/'
        if (!url.startsWith(prefix)) return next()
        const file = path.resolve(MONACO_VS_SRC, decodeURIComponent(url.slice(prefix.length)))
        if (!file.startsWith(MONACO_VS_SRC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404
          return res.end('Monaco asset not found')
        }
        res.setHeader('Content-Type', MONACO_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
      }
      server.middlewares.use(handler)
    },
    /** build：产物自带一份 vs 目录（与 dev 中间件同源同布局） */
    closeBundle() {
      const dest = path.join(outDir, MONACO_VS_SUBDIR)
      const t0 = Date.now()
      fs.rmSync(dest, { recursive: true, force: true })
      fs.cpSync(MONACO_VS_SRC, dest, { recursive: true })
      console.log(`[monaco-local-vs] 已拷贝本地 Monaco 运行时 → ${path.relative(process.cwd(), dest)}（${Date.now() - t0}ms）`)
      // 构建守卫：产物不应再出现任何 CDN 串（现代 0.55 = 本地拷贝；旧内核 0.24 = public/monaco-legacy；
      // loader 内置默认已被 monacoLoaderLocalDefault 换掉）。出现即为回归，明确告警（不阻断构建）。
      const assetsDir = path.join(outDir, 'assets')
      const hits = fs.existsSync(assetsDir)
        ? fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js') && /cdn\.jsdelivr\.net/.test(fs.readFileSync(path.join(assetsDir, f), 'utf8')))
        : []
      if (hits.length) console.warn('[monaco-local-vs] ⚠ 产物仍含 CDN 串，请检查 loader 默认替换/兼容分流：' + hits.join(', '))
      else console.log('[monaco-local-vs] 静态守卫：dist/assets 内 CDN 串 = 0 ✓')
    },
  }
}

/**
 * baseSlashRedirect —— 让 "<base>"（不带末尾斜杠，如 /exam）也能进站。
 *
 * 病因：vite 的 base 中间件对 "/exam" 直接返回 404（"The server is configured with a public
 * base URL of /exam/ - did you mean to visit /exam/ instead?"），用户手敲 http://host/exam 会看到
 * 404 纯文本而不是页面；生产 nginx 的 "location /exam/" 同样不匹配 "/exam"（前缀匹配要求末尾斜杠）。
 * 做法：在 vite 内部中间件之前拦一层，301 到带斜杠的 base —— 与 nginx 侧新增的
 * "location = /exam { return 301 /exam/; }" 对齐，dev 与 prod 行为一致。
 * 注册时机：configureServer 里直接 use() = 注册在内部中间件之前（与 monacoLocalVs 同一手法）。
 */
function baseSlashRedirect() {
  let base = '/'
  return {
    name: 'base-slash-redirect',
    configResolved(config) { base = config.base },
    configureServer(server) {
      if (base === '/') return
      const bare = base.replace(/\/+$/, '')
      server.middlewares.use((req, res, next) => {
        const raw = req.url || ''
        if (raw.split('?')[0] === bare) {
          const qs = raw.includes('?') ? '?' + raw.split('?').slice(1).join('?') : ''
          res.statusCode = 301
          res.setHeader('Location', base + qs)
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          return res.end('Redirecting to ' + base + qs + '\n')
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), legacy({ targets: ['chrome >= 69'] }), monacoLoaderLocalDefault(), monacoLocalVs(), baseSlashRedirect()],
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
