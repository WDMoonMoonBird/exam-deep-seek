/**
 * 生成静态错误页（供 nginx error_page 或 Express sendFile 使用）。
 * 用法：node client/scripts/build-error-pages.mjs
 * 产物：client/public/error-pages/<code>.html（vite 原样拷进 dist/error-pages/）+ NOTICE.txt
 * 新增错误码：在下方 MESSAGES 加一行即可。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../public/error-pages');

// 429 与 5xx 类页面自带 30 秒自动重试（沿用上游 ghost 模板行为）
const AUTO_REFRESH = new Set([408, 425, 429, 500, 502, 503, 504]);

const MESSAGES = {
  400: ['请求有误', '这次请求的内容不合法，可能是参数缺失或格式不对。请返回上一页重试。'],
  401: ['登录已过期', '为了安全，长时间没操作会自动退出登录。重新登录后会回到你刚才的页面。'],
  403: ['没有访问权限', '你已登录，但当前账号的身份不能打开这个页面。需要访问请联系管理员开通权限。'],
  404: ['页面不存在', '你访问的地址没有对应的页面 —— 可能是链接输错了，或者这个页面已经被移除。'],
  405: ['请求方式不被允许', '这个地址不支持当前的操作方式，请从页面上的入口重新操作。'],
  408: ['请求超时', '网络或服务器响应太慢，这次请求没有完成。页面会在 30 秒后自动重试。'],
  409: ['操作冲突', '数据已经被改动过，这次操作没有生效。请刷新页面后重试。'],
  410: ['内容已删除', '这个内容已经被删除，不再提供访问。'],
  413: ['文件太大', '上传的文件超过了大小限制，请压缩或拆分后再试。'],
  418: ['无法理解的请求', '服务器拒绝了一个它无法理解的请求。'],
  429: ['请求过于频繁', '短时间内操作太多次，请稍候再试。页面会在 30 秒后自动重试。'],
  500: ['服务暂时不可用', '服务器出了点问题，这次操作没有完成。页面会在 30 秒后自动重试。'],
  501: ['功能暂未实现', '这个功能还没有开放。'],
  502: ['网关错误', '服务之间的连接出了问题，请稍后重试。页面会在 30 秒后自动重试。'],
  503: ['正在维护', '系统正在升级维护，预计稍后恢复。页面会在 30 秒后自动重试。'],
  504: ['网关超时', '上游服务响应超时，请稍后重试。页面会在 30 秒后自动重试。'],
};

const NOTICE = [
  'client/public/error-pages/*.html 基于 tarampampam/error-pages 的 ghost 模板改写。',
  'Upstream: https://github.com/tarampampam/error-pages (templates/html/ghost.tpl.html)',
  'License: MIT - Copyright (c) tarampampam',
  'Modifications: Go template placeholders replaced with markers; copy localized to Chinese; home link points to /exam/.',
  'Source template: client/scripts/error-page.tpl.html',
  '',
  'MIT License',
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and',
  'associated documentation files (the Software), to deal in the Software without restriction,',
  'including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,',
  'and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,',
  'subject to the following conditions:',
  '',
  'The above copyright notice and this permission notice shall be included in all copies or substantial',
  'portions of the Software.',
  '',
  'THE SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.',
].join('\n');

const tpl = await readFile(join(here, 'error-page.tpl.html'), 'utf8');
await mkdir(outDir, { recursive: true });
const made = [];
for (const [code, pair] of Object.entries(MESSAGES)) {
  const refresh = AUTO_REFRESH.has(Number(code)) ? '<meta http-equiv="refresh" content="30">' : '';
  const html = tpl.split('{{CODE}}').join(code).split('{{MSG}}').join(pair[0]).split('{{DESC}}').join(pair[1]).split('{{REFRESH}}').join(refresh);
  await writeFile(join(outDir, code + '.html'), html, 'utf8');
  made.push(code + ':' + (Buffer.byteLength(html) / 1024).toFixed(1) + 'KB');
}
await writeFile(join(outDir, 'NOTICE.txt'), NOTICE, 'utf8');
console.log('生成 ' + made.length + ' 个错误页 -> ' + outDir);
console.log(made.join(' '));