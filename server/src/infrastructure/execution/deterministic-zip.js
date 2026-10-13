/**
 * deterministicZip.js —— R2-B20：**确定性** ZIP 生成（无第三方依赖，Node 内置 zlib）。
 *
 * 为什么需要：装置契约要求导出目录里的 `标准工程包.zip` 与各学生 zip，在**同一输入下逐字节稳定**（sha256 可比对、可复算）。
 * 因此本模块：①条目名按字节序排序；②所有条目使用**固定** DOS 时间戳（1980-01-01）；③固定压缩级别；④不含任何随机/时间字段。
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// 固定时间戳：DOS date 1980-01-01（time=0）。这是确定性的关键——不含生成时刻。
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 0x0021;

/** 把 [{name, data}] 打包成确定性 zip（Buffer） */
export function buildZip(entries) {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of sorted) {
    const nameBuf = Buffer.from(String(e.name).replace(/\\/g, '/'), 'utf8');
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const crc = crc32(raw);
    const comp = zlib.deflateRawSync(raw, { level: 9 });
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags（无 data descriptor）
    local.writeUInt16LE(8, 8);           // method = deflate（固定）
    local.writeUInt16LE(FIXED_DOS_TIME, 10);
    local.writeUInt16LE(FIXED_DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);        // version made by
    central.writeUInt16LE(20, 6);        // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(FIXED_DOS_TIME, 12);
    central.writeUInt16LE(FIXED_DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);        // external attrs（固定）
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(locals), centralBuf, eocd]);
}

/** 读目录为条目列表（递归、按相对路径升序、跳过符号链接与非常规文件） */
export function collectDirEntries(dir) {
  const out = [];
  const walk = (cur, rel) => {
    const items = fs.readdirSync(cur, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const it of items) {
      const abs = path.join(cur, it.name);
      const relName = rel ? rel + '/' + it.name : it.name;
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(abs, relName);
      else if (st.isFile()) out.push({ name: relName, data: fs.readFileSync(abs) });
    }
  };
  walk(dir, '');
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** 目录 ⇒ 确定性 zip Buffer */
export function zipDirectory(dir) {
  return buildZip(collectDirEntries(dir));
}

/** 解析 zip（只读校验用；支持 store/deflate） */
export function readZipEntries(buf) {
  const entries = [];
  const eocdPos = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdPos < 0) throw new Error('not_a_zip:EOCD');
  const count = buf.readUInt16LE(eocdPos + 10);
  let p = buf.readUInt32LE(eocdPos + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('not_a_zip:CDIR');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    const lnameLen = buf.readUInt16LE(localOff + 26);
    const lextraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lnameLen + lextraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);
    entries.push({ name, method, data: method === 0 ? raw : zlib.inflateRawSync(raw) });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return entries;
}
