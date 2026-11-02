"""Skill-oriented Feishu knowledge classification for the user's Shanganya Agent.

Read-only planning. This module does not claim Feishu API permissions or move files.
Every classification preserves source URL, confidence and evidence.
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

CATEGORIES = [
    ("01", "AI?????", ("??", "???", "????", "??", "??", "obsidian", "gpu", "datawhale", "??", "??")),
    ("02", "Agent?Skill?MCP", ("agent", "???", "hermes", "skill", "mcp", "workbuddy", "autoclaw", "????", "???", "????", "????")),
    ("03", "AI???????", ("??", "??", "github", "??", "??", "??", "??", "??", "??", "???", "codex", "????")),
    ("04", "AI???????", ("????", "????", "????", "??", "prd", "??", "????")),
    ("05", "AI?????????", ("????", "????", "??", "???", "ai??", "????")),
    ("06", "????????", ("??", "??", "??", "??", "??", "??", "??", "offer", "??")),
    ("07", "???????", ("???", "??", "??", "??", "??", "??", "???", "??", "??")),
    ("08", "????????", ("???", "??", "???", "??", "??", "????", "???")),
    ("09", "???????", ()),
]
SPECIAL_NAMES = ("小雷", "小黎", "老秦", "咪小熙", "王大仙")
CANDIDATE_KEYS = ("sourcePerson", "person", "author", "sharedBy", "fromPerson", "sender")

def clean(value, size=140):
    return re.sub(r"[\\/:*?\"<>|\x00-\x1f]", "·", str(value or "")).strip()[:size]

def link_type(url):
    try:
        parsed = urlsplit(str(url or "").strip())
        if parsed.scheme not in ("http", "https"):
            return "无有效链接"
        host = (parsed.hostname or "").lower()
        if host in ("feishu.cn", "larkoffice.com") or host.endswith((".feishu.cn", ".larkoffice.com", ".larksuite.com")):
            return "飞书文档"
        if host == "github.com" or host.endswith(".github.com"):
            return "GitHub仓库"
        if host in ("bilibili.com", "b23.tv") or host.endswith(".bilibili.com"):
            return "B站视频"
        if host in ("youtube.com", "youtu.be") or host.endswith(".youtube.com"):
            return "YouTube视频"
        if host.endswith(".xiaohongshu.com"):
            return "小红书"
        if host.endswith(".douyin.com") or host == "v.douyin.com":
            return "抖音视频"
        return "网页链接"
    except (ValueError, TypeError):
        return "无有效链接"

def choose_category(title, body="", hint=""):
    title = str(title or "").lower()
    text = (str(body or "")[:8000] + " " + str(hint or "")).lower()
    results = []
    for priority, (key, label, words) in enumerate(CATEGORIES[:-1]):
        scores = [3 if word.lower() in title else (1 if word.lower() in text else 0) for word in words]
        score = sum(scores)
        if score:
            results.append((score, -priority, key, label))
    if not results:
        return {"code": "08", "category": "待阅读与待核验", "confidence": "待核验", "evidence": "标题与正文没有足够的分类依据"}
    score, _, code, label = max(results)
    confidence = "高" if score >= 6 else ("中" if score >= 3 else "低")
    return {"code": code, "category": label, "confidence": confidence,
            "evidence": "匹配了标题或正文中的分类关键词；请核对全文"}

def classify(item):
    if not isinstance(item, dict):
        raise ValueError("资料必须是对象")
    title = str(item.get("title") or "").strip()[:300]
    url = str(item.get("url") or "").strip()[:3000]
    body = str(item.get("text") or item.get("content") or "")[:120000]
    if not title and not url:
        raise ValueError("资料需要标题或链接")
    person = next((clean(item.get(k), 80) for k in CANDIDATE_KEYS if item.get(k)), "")
    basis = "用户明确提供的来源人物" if person else ""
    if not person:
        matches = re.findall(r"(?:来自|分享人[：:]?|作者[：:]?)\s*([\u4e00-\u9fa5A-Za-z0-9_]{2,16})", title + "\n" + body[:800])
        if matches:
            person, basis = clean(matches[0], 80), "文档中的来源人物字段"
    if not person:
        matches = [name for name in SPECIAL_NAMES if name in title]
        if len(matches) == 1:
            person, basis = matches[0], "标题包含人物名（仍需确认）"
    if not person:
        person, basis = "来源待确认", "未发现可核实的分享人"
    category = choose_category(title, body, item.get("categoryHint", ""))
    link = link_type(url)
    safe_person = clean(person, 80) or "来源待确认"
    safe_title = clean(title or "未命名链接", 110)
    return {
        "title": title or "未命名链接",
        "url": url,
        "sourcePerson": person,
        "personEvidence": basis,
        **category,
        "linkType": link,
        "targetFolder": f"{category['code']}-{category['category']}/{safe_person}",
        "feishuExistingStylePath": f"{safe_person} | {category['category']} | {link}",
        "displayName": f"{safe_title}｜{link}",
        "readStatus": "用户提供正文" if body else "未读取正文",
        "requiresReview": person == "来源待确认" or category["confidence"] in ("低", "待核验"),
        "operationStatus": "仅分类建议，未移动飞书原文",
    }

def batch(data):
    if not isinstance(data, dict):
        raise ValueError("请输入对象")
    items = data.get("items")
    if not isinstance(items, list) or len(items) > 500:
        raise ValueError("items 必须为不超过500项的数组")
    normalized, seen, duplicates = [], {}, []
    for position, item in enumerate(items):
        result = classify(item)
        key = (result["url"].split("?")[0].rstrip("/").lower()
               if result["url"].startswith(("http://", "https://"))
               else "title:" + result["title"].strip().lower())
        if key in seen:
            result["duplicateOf"] = seen[key]
            duplicates.append({"index": position, "duplicateOf": seen[key], "title": result["title"]})
        else:
            seen[key] = position
        normalized.append(result)
    folders = sorted({r["targetFolder"] for r in normalized})
    return {
        "ok": True, "items": normalized, "folders": folders, "duplicates": duplicates,
        "summary": {"total": len(normalized), "folders": len(folders),
                    "needsReview": sum(bool(r["requiresReview"]) for r in normalized),
                    "duplicates": len(duplicates), "moved": 0},
        "note": "只生成按类别→人物的归档方案；未调用飞书写入API，未移动、删除或复制任何云文档。"
    }

def skills():
    return {
        "ok": True,
        "agents": [
            {"id":"knowledge","name":"???? Agent","skills":["???????","??????","??????","????","????","?????"],"state":"????????????"},
            {"id":"feishu","name":"???? Agent","skills":["???/??????","????????","??????????","?????????","??????"],"state":"??????????????????????????????"},
            {"id":"learning","name":"?? Agent","skills":["??????","GPU/AI???","??????","????","??????"],"state":"???????????????????"},
            {"id":"planner","name":"???? Agent","skills":["?????????","????????????","?????????","???????????","???????","??????????"],"state":"??????????????????"},
            {"id":"project","name":"???? Agent","skills":["????","???????","????","?????????","????"],"state":"??????????????????????"},
            {"id":"content","name":"?????? Agent","skills":["?????","??/??/????","??????","?????????","????"],"state":"?????????????????????/API"},
            {"id":"review","name":"?????? Agent","skills":["???????","?????????","Obsidian????","??????","???????"],"state":"?????????????????????"},
        ],
        "folders": [{"code":c,"category":name} for c,name,_ in CATEGORIES],
        "observedFeishuFolders": ["01-?????", "??????", "?????AI agent??", "AI??????", "??????", "AI????"],
        "directoryPolicy": "?????????????????????????????????????? | ?? | ???????????????????",
    }
