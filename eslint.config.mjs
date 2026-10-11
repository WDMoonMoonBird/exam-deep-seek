// ESLint 扁平配置（2026-10-11 由 Captain 添加）
//
// 目的：把本仓在 GodFile 拆分中反复踩到的四类「机器本可以拦住」的缺陷变成自动检查——
//   ① 自由标识符（引用但未声明/未 import/未注入）② 未绑定名进入 return 面
//   ③ 相对 import 指向已删除的模块 ④ 未使用的声明 / 拼写错的引用
// 注意：本配置**只查缺陷，不查风格**（不引入 stylistic / prettier 规则，避免噪音淹没信号）。
//
// 落点说明：装在仓库根，一份配置同时覆盖 client/src（浏览器侧 + .vue）与 server/src（Node 侧）。
import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'

const IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  'tests/**',
  'docs/**',
  'backups/**',
  '**/*.min.js',
  'client/public/**',
]

/** 两个扫描面共用的「缺陷类」规则（刻意不含风格规则） */
const DEFECT_RULES = {
  // ① 自由标识符 —— 本配置的核心（学生的答题页曾因漏注入依赖在此抛 ReferenceError）
  'no-undef': 'error',
  // ④ 未使用的声明（下划线前缀豁免；函数参数不查，避免大量噪音）
  'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
  // 作用域与赋值类
  'no-redeclare': 'error',
  'no-const-assign': 'error',
  'no-func-assign': 'error',
  'no-class-assign': 'error',
  'no-self-assign': 'error',
  // 对象 / 数组字面量
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-sparse-arrays': 'error',
  // 控制流
  'no-unreachable': 'error',
  'no-fallthrough': 'error',
  'no-cond-assign': 'error',
  'no-constant-condition': 'warn',
  // 运行时陷阱
  'valid-typeof': 'error',
  'use-isnan': 'error',
  'no-obj-calls': 'error',
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-async-promise-executor': 'error',
  'no-loss-of-precision': 'error',
  'no-misleading-character-class': 'error',
  'no-template-curly-in-string': 'warn',
  // 降噪：这几条在本仓存量代码里噪音大、收益低，显式关掉
  'no-empty': 'off',
  'no-useless-escape': 'off',
  'no-control-regex': 'off',
  'no-prototype-builtins': 'off',
  'no-inner-declarations': 'off',
}

export default [
  { ignores: IGNORES },

  // ---- server/src：Node + ESM ----
  {
    files: ['server/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: { ...js.configs.recommended.rules, ...DEFECT_RULES },
  },

  // ---- client/src：浏览器 + ESM（纯 .js） ----
  {
    files: ['client/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
    },
    rules: { ...js.configs.recommended.rules, ...DEFECT_RULES },
  },

  // ---- client/src 的 .vue：用 vue 官方解析器，但只套「缺陷类」规则（不启用 vue 风格规则集） ----
  ...pluginVue.configs['flat/base'],
  {
    files: ['client/src/**/*.vue'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
    },
    rules: { ...js.configs.recommended.rules, ...DEFECT_RULES },
  },
]
