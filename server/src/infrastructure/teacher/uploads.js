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

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  defParamCharset: 'utf8',
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.zip') return cb(new Error('仅支持 zip 文件'));
    cb(null, true);
  },
});

export const uploadMaterial = (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ code: 1001, message: err.message, data: null });
    if (!req.file) return res.status(400).json({ code: 1001, message: '未选择文件', data: null });
    const url = `/uploads/materials/${req.file.filename}`;
    res.json({ code: 0, message: '上传成功', data: { url, name: req.file.originalname } });
  });
};
