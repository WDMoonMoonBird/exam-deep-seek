#!/usr/bin/env python3
"""生成 scripts/dsh-checker/fixtures/ 夹具（幂等；纯 stdlib，零模型调用）。

产物：
  fixtures/rubric.md            评分标准（可被 rubric_hash 引用）
  fixtures/standard/**          标准工程包最小样本（可被 standard_hash 引用）
  fixtures/submission/**        学生提交样本（含一个缺失文件 → 触发 missing 状态与扣分）
  fixtures/checker.json         合法 checker（checker_id 由本脚本计算写入，禁止手写）
  fixtures/checker.t1.json      含 T1 谓词（执行器必须 exit 6 fail-closed）
  fixtures/checker.invalid.json 缺字段（执行器必须 exit 3）
运行：python3 scripts/dsh-checker/fixtures/build_fixtures.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import validate as V  # noqa: E402

RUBRIC = """# 用户管理系统（前端）评分标准（夹具样本）

1. 项目初始化：存在 package.json 且依赖齐全 —— 10 分。
2. 登录页：src/views/Login.vue 存在且实现了登录流程 —— 20 分。
3. 状态管理：user store 做了持久化（localStorage 或持久化插件）—— 30 分。
4. 页面齐备：src/views 下的页面文件与入口文件都在 —— 15 分。
5. 入口接线：main.js 装配了 Pinia —— 25 分。
合计 100 分。
"""

FILES = {
    'submission/UserManagement/package.json':
        json.dumps({'name': 'usermgmt', 'version': '1.0.0',
                    'dependencies': {'vue': '^3.4.0', 'pinia': '^2.1.0', 'axios': '^1.6.0'}},
                   ensure_ascii=False, indent=2) + chr(10),
    'submission/UserManagement/src/main.js':
        "import { createApp } from 'vue'" + chr(10) +
        "import { createPinia } from 'pinia'" + chr(10) +
        "import App from './App.vue'" + chr(10) +
        "const app = createApp(App)" + chr(10) +
        "app.use(createPinia())" + chr(10) +
        "app.mount('#app')" + chr(10),
    'submission/UserManagement/src/App.vue':
        '<template><router-view /></template>' + chr(10),
    'submission/UserManagement/src/views/Register.vue':
        '<template><a-form /></template>' + chr(10) +
        '<script setup>' + chr(10) +
        "// 注册成功后本地留痕" + chr(10) +
        "localStorage.setItem('lastRegister', Date.now())" + chr(10) +
        '</script>' + chr(10),
    'submission/UserManagement/src/views/User.vue':
        '<template><a-layout /></template>' + chr(10),
    'submission/UserManagement/src/stores/user.js':
        "import { defineStore } from 'pinia'" + chr(10) +
        'export const useUserStore = defineStore(' + chr(39) + 'user' + chr(39) + ", {" + chr(10) +
        '  state: () => ({ name: ' + chr(39) + chr(39) + ' }),' + chr(10) +
        '})' + chr(10),
    'standard/UserManagement/package.json':
        json.dumps({'name': 'usermgmt', 'version': '1.0.0',
                    'dependencies': {'vue': '^3.4.0', 'pinia': '^2.1.0'}},
                   ensure_ascii=False, indent=2) + chr(10),
    'standard/UserManagement/src/main.js': "import { createApp } from 'vue'" + chr(10),
    'standard/UserManagement/src/views/Login.vue': '<template><a-form /></template>' + chr(10),
}


def write(rel, text):
    p = os.path.join(HERE, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(text)
    return p


def main():
    for rel, text in sorted(FILES.items()):
        write(rel, text)
    write('rubric.md', RUBRIC)
    rubric_hash = 'sha256:' + V.content_sha256(os.path.join(HERE, 'rubric.md'))
    standard_hash, n_std = V.dir_sha256(os.path.join(HERE, 'standard'))
    ic = {'project_root_glob': '**/package.json', 'required_paths': ['src/main.js'],
          'ignore': ['node_modules/**', '.git/**', 'dist/**'], 'encoding': 'utf-8'}
    checker = {
        'schema_version': 'checker/1',
        'checker_id': 'sha256:' + '0' * 64,
        'assignment_ref': {'assignment_id': 'A-2026-10-11-fixture', 'question_id': 'Q-UserManagement',
                           'rubric_hash': rubric_hash, 'standard_hash': standard_hash},
        'generated': {'session_id': 'fixture-session-0001', 'model': 'none(人工夹具)',
                      'created_at': '2026-10-11T23:00:00+08:00', 'generator': 'dsh-checker/fixtures-build'},
        'scoring': {'max_score': 100, 'aggregate': 'sum_clamped', 'rounding': 'half_up_1',
                    'zero_credit_rule': 'missing_required_path'},
        'input_contract': ic,
        'predicates': [
            {'id': 'P01', 'group': '工程结构', 'item': '存在工程根 package.json', 'max_score': 10,
             'rule_type': 'file_exists', 'params': {'path': 'package.json'}},
            {'id': 'P02', 'group': '登录', 'item': '登录页文件存在', 'max_score': 20,
             'rule_type': 'file_exists', 'params': {'path': 'src/views/Login.vue'}},
            {'id': 'P03', 'group': '状态管理', 'item': 'user store 做了持久化', 'max_score': 30,
             'rule_type': 'contains_regex',
             'params': {'path': 'src/stores/user.js', 'pattern': 'localStorage|pinia-plugin-persist',
                        'min_count': 1},
             'deductions': [{'code': 'NO_PERSIST', 'when': 'hit==0', 'delta': -1.0}]},
            {'id': 'P04', 'group': '页面齐备', 'item': '页面文件与入口都在', 'max_score': 15,
             'rule_type': 'glob_covers',
             'params': {'patterns': ['src/views/*.vue', 'src/main.js']}},
            {'id': 'P05', 'group': '入口接线', 'item': 'main.js 装配 Pinia', 'max_score': 25,
             'rule_type': 'contains_text',
             'params': {'path': 'src/main.js', 'text': 'createPinia', 'min_count': 1},
             'deductions': [{'code': 'NO_ROUTER', 'when': 'hit==1', 'delta': -5.0}]},
        ],
        'deductions': [
            {'code': 'MISSING_FILE', 'match': {'status': 'missing', 'rule_type': '*'}, 'delta': -1.0},
            {'code': 'EMPTY_FILE', 'match': {'status': 'empty', 'rule_type': '*'}, 'delta': -0.5},
        ],
        'evidence_policy': {'require_line': True, 'quote_max_chars': 120},
    }
    checker['checker_id'] = V.checker_id_of(checker)
    check_path = os.path.join(HERE, 'checker.json')
    with open(check_path, 'w', encoding='utf-8') as f:
        json.dump(checker, f, ensure_ascii=False, indent=2, sort_keys=False)
        f.write(chr(10))

    t1 = json.loads(json.dumps(checker))
    t1['predicates'] = list(checker['predicates']) + [
        {'id': 'P90', 'group': '语法', 'item': '登录页语法正确（需解析器）', 'max_score': 0,
         'rule_type': 'syntax_check', 'params': {'path': 'src/views/Login.vue'}}]
    t1['checker_id'] = V.checker_id_of(t1)
    with open(os.path.join(HERE, 'checker.t1.json'), 'w', encoding='utf-8') as f:
        json.dump(t1, f, ensure_ascii=False, indent=2)
        f.write(chr(10))

    bad = {'schema_version': 'checker/1', 'checker_id': 'sha256:' + '0' * 64}
    with open(os.path.join(HERE, 'checker.invalid.json'), 'w', encoding='utf-8') as f:
        json.dump(bad, f, ensure_ascii=False, indent=2)
        f.write(chr(10))

    print('FIXTURES_OK rubric_hash=%s standard_hash=%s(n=%d) checker_id=%s' % (
        rubric_hash[:14], standard_hash[:14], n_std, checker['checker_id'][:14]))
    print('VALID=' + ('yes' if not V.validate_checker(checker) else 'no'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
