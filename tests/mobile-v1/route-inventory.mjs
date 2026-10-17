import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mod = await import('file://' + path.resolve(__dirname, '../../client/src/mobile/routes.js'));
const rows = mod.mobileRoutes.map((r) => {
  const m = String(r.component || '').match(/import\(['"]([^'"]+)['"]\)/);
  return { path: r.path, name: r.name, file: m ? m[1] : '(redirect/catch-all)', meta: r.meta || {} };
});
const out = { total: rows.length, rows };
fs.writeFileSync(path.join(__dirname, 'artifacts', 'routes.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.rows.map((r) => [r.path, r.name, r.file, r.meta.role || (r.meta.public ? 'public' : '')])));
