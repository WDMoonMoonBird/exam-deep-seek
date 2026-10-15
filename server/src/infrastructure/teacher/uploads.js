/**
 * uploads.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 1288-1320）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：infrastructure（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { UPLOADS_ROOT } from '../../utils/projectPaths.js';

// ===================== 文件上传 =====================

const uploadDir = path.join(UPLOADS_ROOT, 'materials');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

// ★R2-B61（P1-4）：上限可注入（便于用「小上限」做 413 测试，无需真传 50MB）
export const MATERIAL_MAX_BYTES = 50 * 1024 * 1024;

export function createMaterialUpload(maxBytes = MATERIAL_MAX_BYTES) {
  return multer({
    storage,
    limits: { fileSize: maxBytes },
    defParamCharset: 'utf8',
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.zip') return cb(new Error('仅支持 zip 文件'));
      cb(null, true);
    },
  });
}

const upload = createMaterialUpload();

/**
 * ★R2-B61（P1-4）：multer 错误 → 统一响应（学生/教师两条上传路径共用同一口径）。
 *   LIMIT_FILE_SIZE ⇒ 413 + code1403「文件超过大小限制」；其它错误 ⇒ 400 + 可读 message；body 恒为 {code,message,data}。
 */
export function multerErrorResponse(err) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return { status: 413, body: { code: 1403, message: '文件超过大小限制', data: null } };
  }
  // ★M6（W2-P2b）：**只放行本仓库自定义的文案**（multer 原生消息带英文与字段/实现细节），其余一律固定文案。
  const KNOWN_UPLOAD_MESSAGES = ['仅支持 zip 文件'];
  const raw = err && err.message ? String(err.message) : '';
  const message = KNOWN_UPLOAD_MESSAGES.includes(raw) ? raw : '上传失败';
  return { status: 400, body: { code: 1001, message, data: null } };
}

/** 处理函数工厂（测试可传入小上限实例，走的仍是生产同一条代码路径） */
export function makeUploadMaterialHandler(uploader = upload) {
  return (req, res) => {
    uploader.single('file')(req, res, (err) => {
      if (err) { const m = multerErrorResponse(err); return res.status(m.status).json(m.body); }
      if (!req.file) return res.status(400).json({ code: 1001, message: '未选择文件', data: null });
      const url = '/uploads/materials/' + req.file.filename;
      res.json({ code: 0, message: '上传成功', data: { url, name: req.file.originalname } });
    });
  };
}

export const uploadMaterial = makeUploadMaterialHandler(upload);
