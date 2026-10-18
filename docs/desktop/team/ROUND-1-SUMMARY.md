# Round 1 交付总结（Electron 桌面壳脚手架）

> 日期：2026-10-18 ｜ 分支：`feat/desktop-shell` ｜ 状态：**PASS**（A/T8 终验通过，Lead 验收通过）

## 1. 结论

- Round 1 目标（可测试的桌面壳脚手架）已完成。
- 未修改任何后端代码：`server/**`、数据库、后端 env/nginx 零改动。
- 未修改 `client/**`、根 `package.json`、client/server lockfile；未覆盖 `client/dist`。
- 桌面代码无 GodFile：最大 `content-server.mjs` 288 行（≤300），`index.mjs` 173 行仅组合。
- 单元测试：**112/112 PASS**，两条命令均 EXIT=0。

## 2. 交付物

| 类别 | 内容 |
|---|---|
| Electron 壳 | `desktop/src/main/`：config / path-safety / csp / proxy-headers / security-policy / security / content-server / static-assets / proxy / index |
| 预加载 | `desktop/src/preload/index.cjs`（sandbox 兼容，极窄只读桥） |
| 构建 | `desktop/scripts/build-dist.mjs`（legacy 裁剪 + dry-run + 仓库内 out 校验）、`electron-builder.yml`、ad-hoc 签名脚本 |
| 测试 | `desktop/test/*.test.mjs`（10 文件 + helpers，112 用例） |
| 文档 | `desktop/README.md`、`docs/desktop/2026-10-18-electron-desktop-plan.md`、团队约定/状态 |
| 报告 | A 基线/审查/终验、C 测试/回归、D 自检/修复、B no-op 报告（`reports/desktop/**`） |

## 3. 验证命令

~~~bash
node --test "desktop/test/*.test.mjs"      # 112/112 PASS
cd desktop && npm test                      # 112/112 PASS, EXIT=0
node --check desktop/src/main/*.mjs          # 13/13 PASS
git status --porcelain -- client server package.json package-lock.json   # 空
~~~

## 4. A 审查修复闭环

| 项 | 级别 | 修复 |
|---|---|---|
| F1 入站 Origin 未校验 | High | content-server 对 HTTP+WS 校验 Origin；evil→403，本地/无→放行 |
| F2 桌面 CSP 默认 report-only | High | content-server 默认 enforce；CSP_MODE 可覆盖；指令串与 nginx 等价 |
| F3 长请求超时未显式 | Medium | requestTimeout=900000 / headersTimeout=60000 |
| F4 *.map 泄露 | Low | 一律 404 |
| F5 build-dist --out 任意路径 | Low | 限定仓库根内，越界 exit 2 且不删 |
| F6 npm test 脚本坏 | Low | node --test glob，EXIT=0 |
| F7 死 import | Low | 清理并使用 secureWebPreferences |
| F8 README 模块表缺项 | Low | 补齐 |
| F9 http serverUrl 无告警 | Low | 启动告警 + README“生产必须 https” |

## 5. 未覆盖 / 风险

- R1：网关 `client_max_body_size 12m` vs 50MB 上传（E3），Round 2 前需运维决策或书面接受。
- R2：Electron GUI / preload 运行时未实跑（需 Round 2 打包冒烟）。
- R3：真实远端 API/WS/TLS/内网 CA 未 E2E。
- R4：content-server 288/300 行，Round 2 增量前先拆入站门禁。
- R5：csp.mjs 头注释仍写“纯函数默认 report-only”，Round 2 微调。
- R6：F9 仅告警不强制 https。
- R7：F10 死导出、诊断页、菜单、DMG/ad-hoc 实机验证属 Round 2。

## 6. 下一轮（Round 2）建议

1. 安装 desktop 依赖（electron/electron-builder，仅 desktop）。
2. 用当前 `client/dist` 生成 `dist-desktop`，验证 legacy 裁剪体积。
3. `@electron-builder --mac --arm64` 出 DMG；afterPack ad-hoc 签名；codesign 验证。
4. 干净 Mac Gatekeeper 安装流程 + 启动冒烟（可先只验证进程启动/窗口加载，不接生产数据）。
5. Playwright-Electron 或最小启动脚本；真实远端 API/WS 联调。
6. A/C/B 流水线复跑：D 打包 → C 打包/启动测试 → A 审查 → B（如有 GodFile） → C 回归 → A 终验。
