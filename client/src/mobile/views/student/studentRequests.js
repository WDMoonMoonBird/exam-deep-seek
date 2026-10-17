/**
 * studentRequests.js —— 学生端 v1 页面请求包装（failed-in-place，失败不冒泡）
 *
 * 背景：学生页面有多处「并行取数后各分区独立降级」的场景（首页/我的/成绩列表/逐小题草稿保存）。
 * 直接写 `await request.get(...)` 虽然包在 Promise.allSettled 里不会冒泡，但全仓门禁
 * client/scripts/verify-frontend.mjs ⑮b（裸 request 调用未就地处理）只识别
 * 「带 catch 的 try」与「safeLoad/safeSubmit 实参」两种写法；这里提供页面内的 safeGet/safePut，
 * 让失败在函数内被接住并转成 { ok:false, error }，调用方保持原有「分区降级/错误态」行为。
 *
 * 约定：
 *   · 成功 -> { ok:true, res, data, message, error:null }：data 已按 request.js 的响应体解包一层；
 *   · 失败 -> { ok:false, res:null, data:null, message:'', error }：error 仍是 ApiError（文案口径不变）；
 *   · 不弹全局提示（与请求的 silent:true 配合；页面用 errorText(error) 渲染错误态 / Toast）。
 *   · 只管 GET / PUT；提交（POST）在页面内已有带 catch 的 try，保持原样。
 */
import request from '../../../api/request.js';
import { payload } from './studentPure.js';

/** GET 包装：失败就地接住 */
export async function safeGet(url, config) {
  try {
    const res = await request.get(url, config);
    return {
      ok: true,
      res,
      data: payload(res),
      message: res && typeof res.message === 'string' ? res.message : '',
      error: null,
    };
  } catch (error) {
    return { ok: false, res: null, data: null, message: '', error };
  }
}

/** PUT 包装：失败就地接住（用于逐小题草稿保存） */
export async function safePut(url, body, config) {
  try {
    const res = await request.put(url, body, config);
    return {
      ok: true,
      res,
      data: payload(res),
      message: res && typeof res.message === 'string' ? res.message : '',
      error: null,
    };
  } catch (error) {
    return { ok: false, res: null, data: null, message: '', error };
  }
}
