/**
 * fact-extractor.test.js —— 工程事实提取器单元测试（离线，纯函数 + 临时工程）。
 * 覆盖：空目录全缺省、简单 JS 工程（依赖/import/语法错误计数）、语法错误文件、
 * Vue 工程（router/stores/App.vue/axios 封装）、工程根探测（单子目录包裹）、
 * .vue <script> 与 <script setup> 提取分析。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractFacts, resolveProjectRoot } from '../../../src/services/factExtractor.js';

/** 创建临时目录（测试后清理） */
function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fact-extract-test-'));
}

/**
 * 构造简单 JS 工程：package.json（express + axios 依赖，nodemon 放 devDependencies）+
 * src/index.js（import express/axios + 一次 axios.get 调用）。
 * 额外建一个顶层 public/ 目录，避免「单子目录含源码 → 下钻」改变工程根。
 * @param {string} dir - 工程根
 */
function buildJsProject(dir) {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'simple',
    version: '1.0.0',
    dependencies: { express: '^4.19.2', axios: '^1.7.2' },
    devDependencies: { nodemon: '^3.1.0' },
  }));
  fs.writeFileSync(
    path.join(dir, 'src', 'index.js'),
    "import express from 'express';\n"
      + "import axios from 'axios';\n"
      + 'const app = express();\n'
      + "app.get('/', async (req, res) => {\n"
      + "  const r = await axios.get('/api/x');\n"
      + '  res.json({ r });\n'
      + '});\n'
      + 'export default app;\n',
  );
}

/**
 * 构造 Vue 工程：package.json（vue/vue-router/pinia/axios）+ src/main.js +
 * src/router/index.js（createRouter 3 条路由 + 1 次 addRoute）+ src/stores/user.js（defineStore）
 * + src/api/request.js（axios.create 封装）+ src/App.vue（<script setup> 内含 axios.get 与 fetch）。
 * 额外建 public/ 顶层目录防止根探测下钻。
 * @param {string} dir - 工程根
 */
function buildVueProject(dir) {
  fs.mkdirSync(path.join(dir, 'src', 'router'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'stores'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'api'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'vue-app',
    version: '1.0.0',
    dependencies: { vue: '^3.4.0', 'vue-router': '^4.3.0', pinia: '^2.1.0', axios: '^1.7.0' },
  }));
  fs.writeFileSync(
    path.join(dir, 'src', 'main.js'),
    "import { createApp } from 'vue';\n"
      + "import { createPinia } from 'pinia';\n"
      + "import App from './App.vue';\n"
      + "import router from './router';\n"
      + 'const app = createApp(App);\n'
      + 'app.use(createPinia());\n'
      + 'app.use(router);\n'
      + "app.mount('#app');\n",
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'router', 'index.js'),
    "import { createRouter, createWebHistory } from 'vue-router';\n"
      + "const router = createRouter({\n"
      + '  history: createWebHistory(),\n'
      + '  routes: [\n'
      + "    { path: '/login', component: Login },\n"
      + "    { path: '/home', component: Home },\n"
      + "    { path: '/user/:id', component: User },\n"
      + '  ],\n'
      + '});\n'
      + "router.addRoute({ path: '/extra', component: Login });\n"
      + 'export default router;\n',
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'stores', 'user.js'),
    "import { defineStore } from 'pinia';\n"
      + "export const useUserStore = defineStore('user', {\n"
      + "  state: () => ({ name: '', token: '' }),\n"
      + '  actions: {\n'
      + '    async login() {\n'
      + "      const { data } = await axios.post('/api/login', {});\n"
      + '      return data;\n'
      + '    },\n'
      + '  },\n'
      + '});\n',
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'api', 'request.js'),
    "import axios from 'axios';\n"
      + "const service = axios.create({ baseURL: '/api', timeout: 5000 });\n"
      + 'service.interceptors.request.use((c) => c);\n'
      + 'export default service;\n',
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'App.vue'),
    '<template>\n'
      + '  <div class="app">{{ msg }}</div>\n'
      + '</template>\n'
      + '<script setup>\n'
      + "import { ref } from 'vue';\n"
      + "import axios from 'axios';\n"
      + "const msg = ref('hello');\n"
      + 'async function load() {\n'
      + "  const r = await axios.get('/api/things');\n"
      + "  const f = await fetch('/api/other');\n"
      + '  return [r, f];\n'
      + '}\n'
      + '</script>\n',
  );
  fs.writeFileSync(path.join(dir, 'public', 'index.html'), '<html><body></body></html>\n');
}

describe('extractFacts — 空目录与缺省', () => {
  it('空目录 → 全缺省（字段齐全，缺省为 0/[]/false/unknown）', () => {
    const dir = tmpdir();
    try {
      const facts = extractFacts(dir);
      expect(facts).toEqual({
        language: 'unknown',
        framework: 'unknown',
        hasPackageJson: false,
        dependencies: [],
        entryFiles: [],
        vueFiles: 0,
        jsFiles: 0,
        components: [],
        routes: 0,
        routePaths: [],
        hasCreateRouter: false,
        hasVueRouter: false,
        hasPinia: false,
        stores: [],
        apiCalls: 0,
        hasAxiosWrapper: false,
        hasAxios: false,
        syntaxErrors: 0,
        syntaxErrorFiles: [],
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('不存在的目录 → 不抛错，返回全缺省', () => {
    const facts = extractFacts(path.join(os.tmpdir(), 'no-such-fact-extract-dir-xyz'));
    expect(facts.hasPackageJson).toBe(false);
    expect(facts.syntaxErrors).toBe(0);
    expect(facts.language).toBe('unknown');
  });
});

describe('extractFacts — 简单 JS 工程', () => {
  it('package.json 依赖提取（dependencies + devDependencies）、import 提取、语法错误为 0', () => {
    const dir = tmpdir();
    try {
      buildJsProject(dir);
      const facts = extractFacts(dir);
      expect(facts.hasPackageJson).toBe(true);
      expect(facts.dependencies).toEqual(expect.arrayContaining(['express', 'axios', 'nodemon']));
      // import 提取：hasAxios 来自 import axios
      expect(facts.hasAxios).toBe(true);
      // axios.get 调用计数
      expect(facts.apiCalls).toBe(1);
      expect(facts.jsFiles).toBe(1);
      expect(facts.vueFiles).toBe(0);
      expect(facts.entryFiles).toContain('src/index.js');
      expect(facts.syntaxErrors).toBe(0);
      expect(facts.syntaxErrorFiles).toEqual([]);
      expect(facts.language).toBe('javascript');
      expect(facts.framework).toBe('node'); // 依赖含 express
      expect(facts.hasCreateRouter).toBe(false);
      expect(facts.hasVueRouter).toBe(false);
      expect(facts.hasPinia).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('含语法错误文件 → syntaxErrors > 0 且 syntaxErrorFiles 有相对路径；好文件仍被分析', () => {
    const dir = tmpdir();
    try {
      buildJsProject(dir);
      fs.writeFileSync(path.join(dir, 'src', 'broken.js'), 'function foo( {\nconst x = ;\n}\n');
      const facts = extractFacts(dir);
      expect(facts.syntaxErrors).toBeGreaterThan(0);
      expect(facts.syntaxErrorFiles).toContain('src/broken.js');
      // 好文件不受影响：apiCalls 仍来自 src/index.js
      expect(facts.apiCalls).toBe(1);
      expect(facts.syntaxErrorFiles).not.toContain('src/index.js');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('node_modules / .git 等目录被跳过，不计入文件数与分析', () => {
    const dir = tmpdir();
    try {
      buildJsProject(dir);
      fs.mkdirSync(path.join(dir, 'node_modules', 'express'), { recursive: true });
      fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'node_modules', 'express', 'index.js'), 'const bad = ;\n');
      fs.writeFileSync(path.join(dir, '.git', 'config.js'), 'const bad2 = ;\n');
      const facts = extractFacts(dir);
      expect(facts.jsFiles).toBe(1);
      expect(facts.syntaxErrors).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extractFacts — Vue 工程', () => {
  it('Vue 工程：framework/language、vue-router 路由、pinia store、axios 封装、apiCalls', () => {
    const dir = tmpdir();
    try {
      buildVueProject(dir);
      const facts = extractFacts(dir);
      expect(facts.language).toBe('vue');
      expect(facts.framework).toBe('vue');
      expect(facts.hasPackageJson).toBe(true);
      expect(facts.dependencies).toEqual(expect.arrayContaining(['vue', 'vue-router', 'pinia', 'axios']));

      // 文件统计与组件
      expect(facts.vueFiles).toBe(1);
      expect(facts.jsFiles).toBe(4);
      expect(facts.components).toContain('App');

      // 路由：createRouter routes 数组 3 条 + addRoute 1 次
      expect(facts.hasCreateRouter).toBe(true);
      expect(facts.hasVueRouter).toBe(true);
      expect(facts.routes).toBeGreaterThanOrEqual(3);
      expect(facts.routes).toBe(4);
      expect(facts.routePaths).toEqual(expect.arrayContaining(['/login', '/home', '/user/:id', '/extra']));

      // pinia
      expect(facts.hasPinia).toBe(true);
      expect(facts.stores).toContain('user');

      // axios
      expect(facts.hasAxios).toBe(true);
      expect(facts.hasAxiosWrapper).toBe(true); // src/api/request.js 的 axios.create
      expect(facts.apiCalls).toBeGreaterThanOrEqual(1);

      // 入口
      expect(facts.entryFiles).toContain('src/main.js');

      // 无语法错误
      expect(facts.syntaxErrors).toBe(0);
      expect(facts.syntaxErrorFiles).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('routes 计数 = 数组元素 + addRoute 调用次数；routePaths 去重保序', () => {
    const dir = tmpdir();
    try {
      buildVueProject(dir);
      fs.writeFileSync(
        path.join(dir, 'src', 'router', 'extra.js'),
        "import { createRouter } from 'vue-router';\n"
          + "const r2 = createRouter({ routes: [ { path: '/dup' }, { path: '/dup' }, { path: '/tail' } ] });\n"
          + 'export default r2;\n',
      );
      const facts = extractFacts(dir);
      // 主 router 4 条 + extra 3 条 = 7
      expect(facts.routes).toBe(7);
      // 重复的 /dup 只出现一次
      expect(facts.routePaths.filter((p) => p === '/dup').length).toBe(1);
      expect(facts.routePaths).toContain('/tail');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('createRouter({ routes }) 变量引用：顶层 const routes = [...] 也能解析出路由', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src', 'router'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.4', 'vue-router': '^4.3' } }));
      fs.writeFileSync(
        path.join(dir, 'src', 'router', 'index.js'),
        "import { createRouter, createWebHistory } from 'vue-router';\n"
          + "const routes = [\n"
          + "  { path: '/login', component: Login },\n"
          + "  { path: '/home', component: Home },\n"
          + "];\n"
          + "const router = createRouter({ history: createWebHistory(), routes });\n"
          + "export default router;\n",
      );
      const facts = extractFacts(dir);
      expect(facts.routes).toBe(2);
      expect(facts.routePaths).toEqual(expect.arrayContaining(['/login', '/home']));
      expect(facts.hasCreateRouter).toBe(true);
      expect(facts.hasVueRouter).toBe(true);
      expect(facts.syntaxErrors).toBe(0);
      // 返回 facts 不含内部累积字段
      expect('topLevelConsts' in facts).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extractFacts — 工程根探测', () => {
  it('单子目录包裹：resolveProjectRoot 下钻到内层工程，facts 以内层为根', () => {
    const wrap = tmpdir();
    try {
      const inner = path.join(wrap, 'app');
      fs.mkdirSync(path.join(inner, 'src'), { recursive: true });
      fs.writeFileSync(path.join(inner, 'package.json'), JSON.stringify({ name: 'inner', dependencies: { vue: '^3.4' } }));
      fs.writeFileSync(
        path.join(inner, 'src', 'main.js'),
        "import { createApp } from 'vue';\nconst app = createApp({});\n",
      );
      expect(resolveProjectRoot(wrap)).toBe(inner);
      const facts = extractFacts(wrap);
      expect(facts.hasPackageJson).toBe(true);
      expect(facts.dependencies).toContain('vue');
      expect(facts.entryFiles).toContain('src/main.js');
      expect(facts.framework).toBe('vue');
    } finally {
      fs.rmSync(wrap, { recursive: true, force: true });
    }
  });

  it('多个顶层子目录：不下钻，工程根保持原目录', () => {
    const dir = tmpdir();
    try {
      buildVueProject(dir); // src/ + public/ 两个子目录
      expect(resolveProjectRoot(dir)).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extractFacts — .vue 脚本提取', () => {
  it('<script> 与 <script setup> 均被提取并用 JS 解析（import/调用/pinia 同 JS 逻辑）', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.4', pinia: '^2.1' } }));
      fs.writeFileSync(
        path.join(dir, 'src', 'App.vue'),
        '<template>\n'
          + '  <div>{{ msg }}</div>\n'
          + '</template>\n'
          + '<script>\n'
          + "export default { name: 'App' };\n"
          + '</script>\n'
          + '<script setup>\n'
          + "import axios from 'axios';\n"
          + "import { defineStore } from 'pinia';\n"
          + "const msg = ref('hi');\n"
          + "export const useCounterStore = defineStore('counter', () => ({ n: 0 }));\n"
          + 'async function load() {\n'
          + "  const r = await axios.get('/api/list');\n"
          + '  return r;\n'
          + '}\n'
          + '</script>\n',
      );
      const facts = extractFacts(dir);
      expect(facts.vueFiles).toBe(1);
      expect(facts.components).toContain('App');
      // <script setup> 里的 axios.get 被计数、defineStore 被提取
      expect(facts.apiCalls).toBe(1);
      expect(facts.hasAxios).toBe(true);
      expect(facts.hasPinia).toBe(true);
      expect(facts.stores).toContain('counter');
      expect(facts.syntaxErrors).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('.vue 内 script 有语法错误 → syntaxErrors > 0 且 syntaxErrorFiles 含该 .vue 相对路径', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.4' } }));
      fs.writeFileSync(
        path.join(dir, 'src', 'Bad.vue'),
        '<template>\n'
          + '  <div>ok</div>\n'
          + '</template>\n'
          + '<script>\n'
          + 'const x = ;\n'
          + '</script>\n',
      );
      const facts = extractFacts(dir);
      expect(facts.syntaxErrors).toBeGreaterThan(0);
      expect(facts.syntaxErrorFiles).toContain('src/Bad.vue');
      expect(facts.vueFiles).toBe(1);
      expect(facts.components).toContain('Bad');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveProjectRoot — 与 ruleExecutor 同语义', () => {
  it('导出 resolveProjectRoot 且可独立调用', () => {
    const dir = tmpdir();
    try {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'index.js'), 'const a = 1;\n');
      expect(resolveProjectRoot(dir)).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
