/**
 * dshPlatformLlmConfig.js —— R2-B9：平台 LLM 配置解析（模型/端点）。
 *
 * 口径（与 R2-B8 的 r2b7 一致）：DB `system_configs.deepseek_model` / `deepseek_base_url` 优先，
 * 其次进程 env（`DEEPSEEK_MODEL` / `DEEPSEEK_BASE_URL`）；两者都没有 ⇒ 返回空串 **不注入**，
 * 装置侧保持 headless 默认（deepseek-flash / 官方端点）。读库异常 ⇒ 回退 env（不抛，避免拖垮 worker）。
 */
const KEYS = { deepseek_model: 'model', deepseek_base_url: 'baseUrl' };

export async function readPlatformLlmConfig(prisma, env = process.env) {
  let model = env.DEEPSEEK_MODEL || '';
  let baseUrl = env.DEEPSEEK_BASE_URL || '';
  try {
    const rows = await prisma.$queryRawUnsafe("SELECT `key`, `value` FROM system_configs WHERE `key` IN ('deepseek_model','deepseek_base_url')");
    for (const r of rows || []) {
      const field = KEYS[r.key];
      if (field && r.value) { if (field === 'model') model = String(r.value); else baseUrl = String(r.value); }
    }
  } catch { /* 读不到就用 env/默认 */ }
  return { model, baseUrl };
}

/** 只在有值时构造子进程 env（未配置 ⇒ 不注入，默认行为不变） */
export function llmEnv({ model, baseUrl } = {}) {
  return { ...(model ? { DEEPSEEK_MODEL: model } : {}), ...(baseUrl ? { DEEPSEEK_BASE_URL: baseUrl } : {}) };
}

/** 供日志/摘要：未配置时打 (unset:device-default) */
export function describeLlmConfig({ model, baseUrl } = {}) {
  return { platformModel: model || '(unset:device-default)', platformBaseUrl: baseUrl || '(unset:device-default)' };
}
