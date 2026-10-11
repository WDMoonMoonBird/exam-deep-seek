#!/usr/bin/env python3
"""只读方式准备批改物料：把【标准工程包 + 学生提交】复制（不是软链）到工作区，解压后置为只读。

用法:
  prepare_materials.py --repo <仓库根> --workdir <工作区> [--submissions N] [--source-dir 实验]
                       [--manifest <json路径>] [--allow-identical]
输出:
  stdout 一行摘要 MATERIALS_OK ...；完整机读清单写到 --manifest（默认 <workdir>/materials/materials-manifest.json）
安全:
  1) 只读源目录，源文件不移动不修改；2) 解压前逐条校验 zip 条目：拒绝绝对路径 / .. / 盘符 / 符号链接；
  3) 解压完成后把 materials 树整体去写位（文件 444 / 目录 555）。
健壮性（本仓库数据集实测需要）:
  A) zip 条目未置 UTF-8 标志位时，Python 会按 cp437 解码，中文名变乱码；本脚本对未置位的名字做 cp437->utf-8 还原。
  B) 压缩包内顶层目录名不固定（实测有 UserManagement / UserManagement_副本 两种），脚本自动探测 project_root。
  C) 实测 实验/ 下 63 个 zip 只有 6 个不同摘要，其中 21 个与标准工程包逐字节相同；默认跳过「与标准包相同」的提交
     （它们对评分没有信号量），跳过清单写进 manifest；用 --allow-identical 可关闭该过滤。
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), chr(46) + chr(46), 'dsh-checker'))
import validate as V  # noqa: E402  （R3-B：复用 validate.py 的哈希口径，禁止另写一套）


STANDARD_NAME = '标准工程包.zip'
RUBRIC_NAME = '评分标准.md'
ASSIGNMENT_NAME = '题目描述.md'


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(1 << 16)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def fix_name(raw, flag_bits):
    """未置 UTF-8 标志位(0x800)时按 cp437 还原为 utf-8 原名。"""
    if flag_bits & 0x800:
        return raw
    try:
        return raw.encode('cp437').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return raw


def check_rel(name, slug):
    if name.startswith('/') or name.startswith('..') or (len(name) > 1 and name[1] == ':'):
        sys.exit('UNSAFE_ZIP_ENTRY absolute %s :: %s' % (slug, name))
    if '..' in name.split('/'):
        sys.exit('UNSAFE_ZIP_ENTRY traversal %s :: %s' % (slug, name))


def safe_extract(zip_path, dest, slug):
    """逐条解压（手工写文件，不走 extractall），返回解压后顶层条目名集合。"""
    os.makedirs(dest, exist_ok=True)
    tops = []
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            raw = info.filename
            name = fix_name(raw, info.flag_bits)
            check_rel(name, slug)
            if raw.split('/')[0] not in tops:
                tops.append(raw.split('/')[0])
            mode = (info.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                print('SKIP_SYMLINK %s :: %s' % (slug, name))
                continue
            parts = [p for p in name.split('/') if p not in ('', '.')]
            if not parts:
                continue
            target = os.path.join(dest, *parts)
            if info.is_dir() or raw.endswith('/'):
                os.makedirs(target, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with zf.open(info) as src, open(target, 'wb') as out:
                shutil.copyfileobj(src, out)
    return tops


def detect_project_root(dest):
    """返回相对 dest 的项目根（顶层唯一目录时取它，否则取 '.'）。"""
    try:
        names = sorted(os.listdir(dest))
    except OSError:
        return '.'
    dirs = [n for n in names if os.path.isdir(os.path.join(dest, n))]
    if len(dirs) == 1:
        return dirs[0]
    return '.'


def file_manifest(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for fn in sorted(filenames):
            p = os.path.join(dirpath, fn)
            try:
                st = os.lstat(p)
            except OSError:
                continue
            entry = {'path': os.path.relpath(p, root), 'size': st.st_size}
            if st.st_size < (2 << 20) and stat.S_ISREG(st.st_mode):
                entry['sha256'] = sha256_file(p)
            out.append(entry)
    return out


def readonly(root):
    for dirpath, dirnames, filenames in os.walk(root, topdown=False):
        for fn in filenames:
            try:
                os.chmod(os.path.join(dirpath, fn), 0o444)
            except OSError:
                pass
        for dn in dirnames:
            p = os.path.join(dirpath, dn)
            if not os.path.islink(p):
                try:
                    os.chmod(p, 0o555)
                except OSError:
                    pass
    try:
        os.chmod(root, 0o555)
    except OSError:
        pass




def split_rubric(text):
    """裁定 3：按 ## 标题切分；无 ## 退化 ###；再退化到「第N项/编号行」；最后整篇为一段。
    返回 (sections, rule)；sections = [{'sid', 'head', 'text'}...]（顺序即原文顺序）。"""
    pre = 'none'
    escaped = chr(92) + 'n'
    if text.count(escaped) >= 3 and text.count(chr(10)) < text.count(escaped):
        text = text.replace(escaped, chr(10))
        pre = 'escaped_newlines_normalized'
    lines = text.split(chr(10))

    def by_heading(prefix):
        out, cur = [], None
        for i, ln in enumerate(lines):
            if ln.startswith(prefix):
                if cur is not None:
                    out.append(cur)
                cur = {'head': ln[len(prefix):].strip(), 'lines': [ln]}
            elif cur is not None:
                cur['lines'].append(ln)
        if cur is not None:
            out.append(cur)
        return out

    def by_item():
        out, cur = [], None
        pat = re.compile(r'^\s*(第[一二三四五六七八九十百]+项|[0-9]+[.、])\s*')
        for ln in lines:
            if pat.match(ln):
                if cur is not None:
                    out.append(cur)
                cur = {'head': ln.strip()[:40], 'lines': [ln]}
            elif cur is not None:
                cur['lines'].append(ln)
        if cur is not None:
            out.append(cur)
        return out

    for rule, fn, minimum in (('##', by_heading, 2), ('###', by_heading, 2), ('item', by_item, 2)):
        if rule == 'item':
            secs = fn()
        else:
            secs = fn(rule)
        if len(secs) >= minimum:
            return secs, rule + ('' if pre == 'none' else '+' + pre)
    return [{'head': 'WHOLE-DOC', 'lines': lines}], 'whole-doc' + ('' if pre == 'none' else '+' + pre)


def write_rubric_sections(materials_dir, rubric_path):
    """产出 materials/rubric-sections.json + materials/rubric-sections/<sid>.md（可被 validate.content_sha256 复算）。"""
    text = open(rubric_path, encoding='utf-8').read()
    secs, rule = split_rubric(text)
    out_dir = os.path.join(materials_dir, 'rubric-sections')
    os.makedirs(out_dir, exist_ok=True)
    rows = []
    for i, s in enumerate(secs, 1):
        sid = 'S%03d' % i
        body = chr(10).join(s['lines']).rstrip() + chr(10)
        fp = os.path.join(out_dir, sid + '.md')
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(body)
        rows.append({'sid': sid, 'head': s['head'],
                     'sha256': 'sha256:' + sha256_file(fp),
                     'file': 'materials/rubric-sections/' + sid + '.md',
                     'excerpt': re.sub(r'\s+', ' ', body)[:120]})
    doc = {'schema_version': 'rubric-sections/1', 'split_rule': rule,
           'rubric': 'materials/rubric.md', 'rubric_sha256': 'sha256:' + sha256_file(rubric_path),
           'sections_total': len(rows), 'sections': rows}
    with open(os.path.join(materials_dir, 'rubric-sections.json'), 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write(chr(10))
    return doc

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--workdir', required=True)
    ap.add_argument('--submissions', type=int, default=1)
    ap.add_argument('--source-dir', default='实验')
    ap.add_argument('--manifest', default='')
    ap.add_argument('--allow-identical', action='store_true')
    args = ap.parse_args()

    materials = os.path.join(args.workdir, 'materials')
    if os.path.exists(materials) and not os.access(materials, os.W_OK):
        sys.exit('MATERIALS_FAIL materials-dir-not-writable %s（上一次运行把它置为只读；run.sh 会自动重建，手工调用请先 chmod -R u+w）' % materials)

    src = os.path.join(args.repo, args.source_dir)
    if not os.path.isdir(src):
        sys.exit('MATERIALS_FAIL source-dir-missing %s' % src)
    standard_zip = os.path.join(src, STANDARD_NAME)
    rubric_md = os.path.join(src, RUBRIC_NAME)
    assignment_md = os.path.join(src, ASSIGNMENT_NAME)
    for p in (standard_zip, rubric_md, assignment_md):
        if not os.path.isfile(p):
            sys.exit('MATERIALS_FAIL missing %s' % p)

    std_sha = sha256_file(standard_zip)
    zips = sorted([n for n in os.listdir(src) if n.endswith('.zip') and n != STANDARD_NAME])
    if not zips:
        sys.exit('MATERIALS_FAIL no-submission-zips')

    selected = []
    skipped = []
    for name in zips:
        sha = sha256_file(os.path.join(src, name))
        if sha == std_sha and not args.allow_identical:
            skipped.append({'zip': name, 'reason': 'byte-identical-to-standard-package', 'sha256': sha})
            continue
        selected.append((name, sha))
    if not selected:
        sys.exit('MATERIALS_FAIL all-submissions-identical-to-standard (use --allow-identical)')
    n = max(1, args.submissions)
    chosen = selected[:n]

    src_copy = os.path.join(materials, 'src')
    os.makedirs(src_copy, exist_ok=True)

    shutil.copy2(standard_zip, os.path.join(src_copy, STANDARD_NAME))
    shutil.copy2(rubric_md, os.path.join(materials, 'rubric.md'))
    shutil.copy2(assignment_md, os.path.join(materials, 'assignment.md'))

    std_dir = os.path.join(materials, 'standard')
    safe_extract(standard_zip, std_dir, 'standard')
    std_root = detect_project_root(std_dir)
    std_files = file_manifest(std_dir)
    std_digests = set(e.get('sha256', '') for e in std_files)

    submissions = []
    for idx, (name, sha) in enumerate(chosen, 1):
        slug = 's%02d' % idx
        shutil.copy2(os.path.join(src, name), os.path.join(src_copy, name))
        dest = os.path.join(materials, 'submissions', slug)
        safe_extract(os.path.join(src, name), dest, slug)
        root = detect_project_root(dest)
        files = file_manifest(dest)
        digests = set(e.get('sha256', '') for e in files)
        submissions.append({
            'id': name[:-4],
            'slug': slug,
            'zip': name,
            'sha256': sha,
            'files': len(files),
            'extract_dir': os.path.relpath(dest, args.workdir),
            'project_root': os.path.join(os.path.relpath(dest, args.workdir), root),
            'differs_from_standard': digests != std_digests,
        })

    sections_doc = write_rubric_sections(materials, os.path.join(materials, 'rubric.md'))
    manifest = {
        'schema_version': 1,
        'repo': args.repo,
        'source_dir': args.source_dir,
        'standard': {
            'zip': STANDARD_NAME,
            'extract_digest': V.dir_sha256(os.path.join(materials, 'standard'),
                                              ['node_modules/**', '.git/**', 'dist/**'])[0],
            'sha256': std_sha,
            'files': len(std_files),
            'extract_dir': os.path.relpath(std_dir, args.workdir),
            'project_root': os.path.join(os.path.relpath(std_dir, args.workdir), std_root),
        },
        'rubric': {'src': RUBRIC_NAME, 'path': 'materials/rubric.md', 'sha256': sha256_file(rubric_md),
                   'sections_file': 'materials/rubric-sections.json',
                   'sections_total': sections_doc['sections_total'],
                   'split_rule': sections_doc['split_rule']},
        'assignment': {'src': ASSIGNMENT_NAME, 'path': 'materials/assignment.md', 'sha256': sha256_file(assignment_md)},
        'submissions': submissions,
        'skipped': skipped,
        'candidates_total': len(zips),
        'candidates_after_filter': len(selected),
        'materials_tree_sha256': hashlib.sha256(
            json.dumps(file_manifest(materials), sort_keys=True, ensure_ascii=False).encode('utf-8')
        ).hexdigest(),
    }

    out_manifest = args.manifest or os.path.join(materials, 'materials-manifest.json')
    os.makedirs(os.path.dirname(out_manifest), exist_ok=True)
    with open(out_manifest, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    readonly(materials)

    print('MATERIALS_OK submissions=%d candidates=%d skipped_identical=%d manifest=%s' % (
        len(submissions), len(zips), len(skipped), out_manifest))
    for s in submissions:
        print('SUBMISSION id=%s slug=%s files=%d project_root=%s differs_from_standard=%s zip_sha256=%s' % (
            s['id'], s['slug'], s['files'], s['project_root'],
            'yes' if s['differs_from_standard'] else 'no', s['sha256'][:12]))
    print('STANDARD files=%d project_root=%s zip_sha256=%s rubric_sha256=%s' % (
        manifest['standard']['files'], manifest['standard']['project_root'],
        std_sha[:12], manifest['rubric']['sha256'][:12]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
