"""Project-owned immutable bytes and reproducible text locators, stored atomically.

No client paths are opened. Uploaded bytes are read, hashed and stored in SQLite.
The parsed document is evidence, never instructions for executing code.
"""
import base64
import csv
import hashlib
import io
import json
import re
import uuid
import zipfile
from pathlib import PurePath
from xml.etree import ElementTree as ET
import team_orchestrator as team

MAX_BYTES = 2_000_000
MAX_TEXT = 200_000
MAX_UNITS = 4000
KINDS = {'official', 'user_material', 'reference'}


def init(c):
    c.execute('''CREATE TABLE IF NOT EXISTS team_artifacts(
      project_id TEXT, artifact_id TEXT, version INTEGER, filename TEXT,
      sha256 TEXT, data BLOB, parsed TEXT,
      PRIMARY KEY(project_id, artifact_id, version))''')


def parse(filename, raw):
    suffix = PurePath(filename).suffix.lower()
    units, stats = [], {}
    def add(locator, text):
        if text.strip():
            units.append({'locator': locator, 'text': text})
    if suffix in ('.txt', '.md', '.csv', '.json'):
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeError:
            raise ValueError('文本需为 UTF-8 编码，请另存为 UTF-8 后导入') from None
        if '\x00' in text:
            raise ValueError('材料包含不可读取的文本字符')
        if suffix == '.csv':
            try:
                rows = list(csv.reader(io.StringIO(text), strict=True))
            except csv.Error:
                raise ValueError('CSV 格式不完整，请检查引号和分隔符') from None
            stats = {'logical_rows': len(rows), 'columns': len(rows[0]) if rows else 0}
            for n, row in enumerate(rows, 1):
                add('row:' + str(n), json.dumps(row, ensure_ascii=False))
        else:
            if suffix == '.json':
                json.loads(text)  # Reject malformed JSON; do not execute it.
            for n, line in enumerate(text.splitlines(), 1):
                add('line:' + str(n), line)
    elif suffix in ('.docx', '.pptx'):
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                if sum(x.file_size for x in z.infolist()) > 10_000_000:
                    raise ValueError('压缩文档展开过大，请缩小材料')
                def xml(name):
                    content = z.read(name)
                    if b'<!DOCTYPE' in content or b'<!ENTITY' in content:
                        raise ValueError('不支持包含实体声明的文档')
                    return ET.fromstring(content)
                if suffix == '.docx':
                    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                    body = xml('word/document.xml').find('w:body', ns)
                    if body is None:
                        raise ValueError('DOCX 没有可读正文')
                    para = table = 0
                    def texts(node):
                        return ''.join(x.text or '' for x in node.findall('.//w:t', ns))
                    for node in body:
                        if node.tag.endswith('}p'):
                            para += 1
                            add(f'paragraph:{para}', texts(node))
                        elif node.tag.endswith('}tbl'):
                            table += 1
                            for r, row in enumerate(node.findall('w:tr', ns), 1):
                                for col, cell in enumerate(row.findall('w:tc', ns), 1):
                                    add(f'table:{table}/row:{r}/cell:{col}', texts(cell))
                else:
                    ns = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
                    pns = {'p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
                    rels = {r.attrib['Id']:r.attrib['Target'] for r in xml('ppt/_rels/presentation.xml.rels')}
                    names = []
                    for slide_id in xml('ppt/presentation.xml').findall('p:sldIdLst/p:sldId', pns):
                        rid = slide_id.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
                        target = rels[rid].lstrip('/')
                        name = target if target.startswith('ppt/') else 'ppt/' + target
                        if not re.fullmatch(r'ppt/slides/slide\d+\.xml', name):
                            raise ValueError('幻灯片顺序或关系路径无效')
                        names.append(name)
                    for slide, name in enumerate(names, 1):
                        for n, paragraph in enumerate(xml(name).findall('.//a:p', ns), 1):
                            add(f'slide:{slide}/paragraph:{n}', ''.join(x.text or '' for x in paragraph.findall('.//a:t', ns)))
        except (zipfile.BadZipFile, KeyError, ET.ParseError):
            raise ValueError('文档损坏或不包含可读取正文') from None
    elif suffix == '.pdf':
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ValueError('PDF 读取需安装 pypdf；可先导入 UTF-8 文本') from None
        try:
            reader = PdfReader(io.BytesIO(raw))
            if reader.is_encrypted:
                raise ValueError('请先在本人有权限的环境导出未加密材料')
            for n, page in enumerate(reader.pages, 1):
                for line, text in enumerate((page.extract_text() or '').splitlines(), 1):
                    add(f'page:{n}/line:{line}', text)
        except ValueError:
            raise
        except Exception:
            raise ValueError('PDF 无法提取文本，请导入可读文本或核对文件') from None
    else:
        raise ValueError('当前支持 TXT、MD、CSV、JSON、DOCX、PPTX 和文本 PDF；图片/视频请走求助入口')
    if not units:
        raise ValueError('没有提取到文本；扫描图像与视频未进行 OCR/音频识别')
    if len(units) > MAX_UNITS or sum(len(x['text']) for x in units) > MAX_TEXT:
        raise ValueError('正文超过本轮读取上限，请拆分材料；没有静默截断')
    return {'units': units, 'statistics': stats,
            'limitations': ['只核对可提取文字，不分析图片、音频、DOCX分页或版式']}


def import_file(data):
    p = team.current(data)
    name = team.required(data, 'filename')
    if len(name) > 180 or '/' in name or '\\' in name or '\x00' in name:
        raise ValueError('请提供单个文件名，不填写磁盘路径')
    try:
        raw = base64.b64decode(team.required(data, 'data_base64'), validate=True)
    except ValueError:
        raise ValueError('文件编码无效') from None
    if not 1 <= len(raw) <= MAX_BYTES:
        raise ValueError('每个文件需为 1 字节至 2 MB')
    parsed = parse(name, raw)
    kind = data.get('kind', 'user_material')
    if kind not in KINDS:
        raise ValueError('材料来源须为官方条件、用户作品或参考')
    purpose = data.get('purpose', 'input')
    if purpose not in ('input', 'submission', 'capability'):
        raise ValueError('用途须为诊断输入、提交成果或能力试做')
    identifier = data.get('artifact_id') or uuid.uuid4().hex
    if not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', identifier):
        raise ValueError('材料标识格式无效')
    catalog = p.setdefault('stored_artifacts', [])
    version = max((x['artifact_version'] for x in catalog if x['artifact_id'] == identifier), default=0) + 1
    digest = hashlib.sha256(raw).hexdigest()
    meta = {'artifact_id': identifier, 'artifact_version': version, 'title': name,
            'kind': kind, 'purpose': purpose, 'sha256': digest, 'size_bytes': len(raw),
            'unit_count': len(parsed['units']), 'created': team.agent.now(),
            'limitations': parsed['limitations']}
    catalog.append(meta)
    p['artifact_storage_required'] = True
    if purpose == 'input':
        p['diagnosis_needs_refresh'] = True
        p['proposal'] = None
    def write(c):
        init(c)
        c.execute('INSERT INTO team_artifacts VALUES(?,?,?,?,?,?,?)',
                  (p['project_id'], identifier, version, name, digest, raw, team.agent.dump(parsed)))
    return team.commit(p, p['version'], '保存实际文件：' + name + ' v' + str(version), write=write)


def read(project, identifier, version):
    if not any(x['artifact_id'] == identifier and x['artifact_version'] == version for x in project.get('stored_artifacts', [])):
        raise ValueError('材料未登记在当前项目或版本不存在')
    with team.connection() as c:
        init(c)
        row = c.execute('SELECT * FROM team_artifacts WHERE project_id=? AND artifact_id=? AND version=?',
                        (project['project_id'], identifier, version)).fetchone()
    if not row or hashlib.sha256(row['data']).hexdigest() != row['sha256']:
        raise ValueError('实际材料不可读或内容校验失败')
    value = parse(row['filename'], row['data'])
    return {**value, 'artifact_id': identifier, 'artifact_version': version,
            'filename': row['filename'], 'sha256': row['sha256']}


def references(project, refs, submitted=None):
    if not isinstance(refs, list) or not refs:
        raise ValueError('判断必须提供实际原文引用')
    has_submission = submitted is None
    for ref in refs:
        doc = read(project, team.required(ref, 'artifact_id'), team.integer(ref, 'artifact_version', 1))
        loc, quote = team.required(ref, 'locator'), team.required(ref, 'quote')
        unit = next((x for x in doc['units'] if x['locator'] == loc), None)
        if not unit or quote not in unit['text']:
            raise ValueError('引用位置或引文与实际材料不一致')
        if submitted and (ref['artifact_id'], ref['artifact_version']) == submitted:
            has_submission = True
    if not has_submission:
        raise ValueError('复核须引用实际提交的新版成果')

