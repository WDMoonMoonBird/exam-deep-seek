/**
 * r3-r11-temp-owner.test.js — R3-R11 temp 目录归属绑定（集成级，使用 DB 测试库租户 ID）
 * 覆盖 ticket §3：本人 temp 可通过、他人/无凭据/损坏/过期均为 null（fail-closed）、非法形状仍 null、清理任务回收过期目录。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveTempDir, writeTempOwner, TEMP_OWNER_FILE, TEMP_TTL_MS, cleanupExpiredTempDirs,
} from '../../src/controllers/projectController.js';
import { getTestData } from './helpers.js';

const UPLOADS = path.resolve(process.cwd(), 'uploads/projects');
const created = [];

function mkTemp(suffix) {
  const id = 'temp_' + Date.now() + '_' + suffix;
  const dir = path.join(UPLOADS, id);
  fs.mkdirSync(dir, { recursive: true });
  created.push(dir);
  return { id, dir };
}

afterAll(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

describe('R3-R11 · temp 目录归属凭据（DB 测试库租户 ID）', () => {
  let td;
  beforeAll(() => { td = getTestData(); });

  it('本人 tempId ⇒ 返回目录；他人 teacherId ⇒ null', () => {
    const { id, dir } = mkTemp('ownera');
    writeTempOwner(dir, td.teacherId);
    expect(resolveTempDir(id, td.teacherId)).toBe(dir);
    expect(resolveTempDir(id, td.studentIds[0])).toBeNull();
  });

  it('无凭据 / 凭据损坏 / 过期 ⇒ 一律 null（fail-closed）', () => {
    const missing = mkTemp('noowner');
    expect(resolveTempDir(missing.id, td.teacherId)).toBeNull();

    const corrupt = mkTemp('corrupt');
    fs.writeFileSync(path.join(corrupt.dir, TEMP_OWNER_FILE), '{bad');
    expect(resolveTempDir(corrupt.id, td.teacherId)).toBeNull();

    const expired = mkTemp('expired');
    writeTempOwner(expired.dir, td.teacherId, Date.now() - TEMP_TTL_MS - 1000);
    expect(resolveTempDir(expired.id, td.teacherId)).toBeNull();
  });

  it('非法形状 / 穿越 tempId ⇒ null（H1 不回归）', () => {
    for (const bad of ['../etc', 'temp_abc_x', 'temp_123_', '/tmp/x', '', null, 'temp_1_x/../y']) {
      expect(resolveTempDir(bad, td.teacherId)).toBeNull();
    }
  });

  it('凭据文件权限仅进程可读（0600 语义）', () => {
    const { dir } = mkTemp('mode');
    writeTempOwner(dir, td.teacherId);
    const mode = fs.statSync(path.join(dir, TEMP_OWNER_FILE)).mode & 0o777;
    expect(mode & 0o077).toBe(0);
  });

  it('cleanupExpiredTempDirs 回收过期 temp（sidecar TTL 判定）', () => {
    const { dir } = mkTemp('cleanup');
    writeTempOwner(dir, td.teacherId, Date.now() - TEMP_TTL_MS - 60000);
    cleanupExpiredTempDirs({ now: Date.now(), limit: 500 });
    expect(fs.existsSync(dir)).toBe(false);
  });
});
