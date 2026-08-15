// 将测试报告渲染为精美 HTML，通过 Playwright 导出 PDF
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mdPath = path.join(__dirname, 'TEST-REPORT.md');
const pdfPath = path.join(__dirname, 'TEST-REPORT.pdf');

const md = readFileSync(mdPath, 'utf-8');

// 简单 Markdown → HTML 转换
function md2html(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // bold / code
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // table rows
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map(c => c.trim());
      const tag = row.includes('---') || row.includes(':--:') ? 'th' : 'td';
      const content = cells.filter(c => c && !/^[-:]+$/.test(c)).map(c => `<${tag}>${c}</${tag}>`).join('');
      return `<tr>${content}</tr>`;
    })
    // wrap tables
    .replace(/(<tr>[\s\S]*?<\/tr>\n)(<tr>[\s\S]*?<\/tr>)+/g, '<table>$&</table>')
    // horizontal rules
    .replace(/^---$/gm, '<hr>')
    // paragraphs
    .replace(/^(?!<[htr/])(.+)/gm, '<p>$1</p>')
    // line breaks
    .replace(/\n/g, '');
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>测试报告 — Deadpan 判题</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; font-size: 14px; line-height: 1.8; color: #333; padding: 40px 48px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 700; margin: 16px 0 8px; color: #1a1a1a; }
  h2 { font-size: 20px; font-weight: 600; margin: 24px 0 8px; color: #1a1a1a; border-bottom: 2px solid #1677ff; padding-bottom: 6px; }
  h3 { font-size: 15px; font-weight: 600; margin: 16px 0 4px; color: #555; }
  p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  table th { background: #f0f5ff; text-align: center; padding: 6px 10px; font-weight: 600; border: 1px solid #d9e0e8; }
  table td { padding: 5px 10px; border: 1px solid #d9e0e8; }
  table td:first-child, table th:first-child { text-align: left; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; color: #d63384; font-family: "SF Mono", Monaco, Menlo, monospace; }
  hr { border: none; border-top: 1px solid #e8e8e8; margin: 20px 0; }
  .passed { color: #52c41a; font-weight: 700; }
  .failed { color: #ff4d4f; font-weight: 700; }
  .skipped { color: #faad14; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
  .badge-pass { background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; }
  .badge-skip { background: #fffbe6; color: #d48806; border: 1px solid #ffe58f; }
</style>
</head>
<body>
${md2html(md)}
</body>
</html>`;

const dest = path.join(__dirname, 'test-report.html');
writeFileSync(dest, html);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
  printBackground: true,
});
await browser.close();

console.log('PDF saved to:', pdfPath);
