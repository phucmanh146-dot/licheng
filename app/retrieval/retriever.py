"""Retrieval pipeline with explicit, testable stages.

The vector route is a deterministic TF-IDF cosine proxy in this local build.
It implements the same ``vector_scores(query, docs) -> list[float]`` contract as
a production embedding provider, so swapping in Zhipu Embedding + FAISS does
not change the pipeline or API.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Callable

from .memory import RetrievalMemoryStore

TOKEN_RE = re.compile(r"[a-zA-Z0-9_+.#-]+|[\u4e00-\u9fff]+")


@dataclass
class Doc:
    id: str
    title: str
    content: str
    doc_type: str
    difficulty: float
    source_type: str
    plain: str = ""
    analogy: str = ""
    stance: str = ""


@dataclass
class RetrievalResult:
    intent: str
    route_confidence: float
    rewritten_query: str
    clarification: list[str] = field(default_factory=list)
    results: list[dict] = field(default_factory=list)
    answer: str = ""
    trace: dict = field(default_factory=dict)
    memory: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "intent": self.intent,
            "routeConfidence": self.route_confidence,
            "rewrittenQuery": self.rewritten_query,
            "clarification": self.clarification,
            "results": self.results,
            "answer": self.answer,
            "trace": self.trace,
            "memory": self.memory,
        }


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for raw in TOKEN_RE.findall((text or "").lower()):
        if raw and re.match(r"[a-zA-Z0-9]", raw):
            tokens.append(raw)
        else:
            tokens.extend(raw)
            tokens.extend(raw[i : i + 2] for i in range(len(raw) - 1))
    return tokens


def build_default_corpus() -> list[Doc]:
    return [
        Doc("D1", "LangGraph 是什么", "LangGraph 用图结构组织有状态的多步智能体流程。", "concept", 0.2, "文档", "把步骤画成流程图，每个节点做一件事。", "像地铁线路图，站点是步骤，箭头是下一步。", "定义"),
        Doc("D2", "LangGraph 快速开始", "安装依赖后按官方示例创建 StateGraph 并编译运行。", "doc", 0.3, "文档", "先装依赖，再照着最小例子跑一遍。", "像照着菜谱做第一道菜。", "操作"),
        Doc("D3", "状态与节点设计", "State 决定节点间传递的数据，节点是纯函数或可执行单元。", "concept", 0.5, "论文", "状态就是一路带着走的背包。", "像接力赛的接力棒。", "定义"),
        Doc("D4", "条件边与循环", "条件边根据当前状态决定下一条边，可实现重试循环。", "concept", 0.6, "论文", "走到岔路口时看路牌选方向。", "像游戏里的分支剧情。", "定义"),
        Doc("D5", "检查点与恢复", "checkpoint 保存每一步状态，便于中断后恢复。", "doc", 0.55, "文档", "每走一步拍张存档照片。", "像游戏存档。", "操作"),
        Doc("D6", "调试技巧", "先打印每一步 state，再定位第一个异常节点。", "howto", 0.35, "视频", "先看哪一步开始不对。", "像查水管漏点，从第一段开始看。", "操作"),
        Doc("D7", "跑不通官方例子（依赖环境）", "多半是 Python 版本或依赖冲突导致环境问题。", "faq", 0.4, "文档", "先确认环境是不是装对了。", "像先看电源有没有插。", "环境"),
        Doc("D8", "TypeError missing argument", "调用节点函数时忘了传入 state 参数，补齐函数签名即可。", "faq", 0.25, "文档", "TypeError 多半是忘了传 state。", "像点名时少喊了一个人。", "代码"),
        Doc("D9", "流式输出与前端 SSE", "前端按 data: 行解析事件，需要支持多行 data 与心跳。", "howto", 0.7, "视频", "一条消息可能分几行发完。", "像快递分包裹送到。", "操作"),
        Doc("D10", "把 LangGraph 部署到边缘设备", "需要量化状态存储、限制并发并裁剪依赖。", "paper", 0.95, "论文", "设备小，就要少装东西、少存东西。", "像把行李箱塞进小背包。", "部署"),
    ]


class QueryRouter:
    """Classify intent before retrieval so raw student wording never goes straight to search."""

    ERROR_WORDS = ("报错", "异常", "错误", "traceback", "typeerror", "error", "失败", "跑不通", "不行")
    HOWTO_WORDS = ("怎么", "如何", "步骤", "开始", "下一步", "怎么做")
    CONCEPT_WORDS = ("是什么", "定义", "概念", "原理", "为什么", "区别")
    VAGUE_WORDS = ("那个", "东西", "玩意", "这个", "啥", "啥东西")

    def route(self, query: str) -> tuple[str, float, dict]:
        q = (query or "").strip().lower()
        info = self._information_score(q)
        has_vague = any(word in q for word in self.VAGUE_WORDS)
        has_action = any(
            word in q
            for group in (self.ERROR_WORDS, self.HOWTO_WORDS, self.CONCEPT_WORDS)
            for word in group
        )
        if has_vague and not has_action:
            return "vague", 0.32, {"informationScore": info, "reason": "只有指代，没有明确意图"}
        if info < 0.25 or (len(q) <= 8 and has_vague):
            return "vague", 0.35, {"informationScore": info, "reason": "信息量不足"}
        if any(word in q for word in self.ERROR_WORDS):
            return "error", 0.92, {"informationScore": info, "reason": "命中报错关键词"}
        if any(word in q for word in self.HOWTO_WORDS):
            return "howto", 0.84, {"informationScore": info, "reason": "命中操作关键词"}
        if any(word in q for word in self.CONCEPT_WORDS):
            return "concept", 0.86, {"informationScore": info, "reason": "命中概念关键词"}
        return "lookup", 0.62, {"informationScore": info, "reason": "默认混合路线"}

    @staticmethod
    def _information_score(query: str) -> float:
        tokens = tokenize(query)
        if not tokens:
            return 0.0
        unique = set(tokens)
        score = min(1.0, len(unique) / 8)
        if len(query) < 6:
            score *= 0.5
        return round(score, 3)


class QueryRewriter:
    """Loss-free rewriting: add synonyms, never invent facts the student did not state."""

    SYNONYMS = {
        "报错": ["error", "异常"],
        "错误": ["error", "异常"],
        "typeerror": ["参数错误", "missing argument"],
        "跑不通": ["运行失败", "启动失败"],
        "langgraph": ["lang graph"],
        "物料": ["材料", "清单"],
    }

    def rewrite(self, query: str, intent: str, route_info: dict) -> tuple[str, list[str]]:
        q = (query or "").strip()
        if intent == "vague":
            questions = [
                "你说的 LangGraph / 这个功能，具体是哪一步？",
                "你期望看到什么结果？现在实际看到了什么？",
                "有没有报错原文、截图或你正在跑的代码？",
            ]
            return q, questions
        expansions = []
        lower = q.lower()
        for key, values in self.SYNONYMS.items():
            if key == "跑不通" and intent == "error":
                # For error routing, generic failure words dilute exact error tokens.
                continue
            if key in lower:
                expansions.extend(value for value in values if value not in lower)
        if intent == "error":
            focus_tokens = [
                token
                for token in tokenize(q)
                if "error" in token or token in {"typeerror", "报错", "异常", "错误", "报"}
            ]
            base = " ".join(focus_tokens) if focus_tokens else q
        else:
            base = q
        rewritten = " ".join([base] + expansions[:6]).strip()
        return rewritten, []


class MetadataFilter:
    """i+1 soft filter: high-difficulty docs are removed but surfaced as bridge candidates."""

    def filter(self, docs: list[Doc], profile: dict) -> tuple[list[Doc], list[dict]]:
        level = float(profile.get("level", 0.3))
        preferred = set(profile.get("preferredSources") or [])
        max_difficulty = min(1.0, round(level + 0.1, 3))
        kept, removed, bridges = [], [], []
        for doc in docs:
            if preferred and doc.source_type not in preferred:
                removed.append({"docId": doc.id, "reason": "来源不在画像偏好内"})
            elif doc.difficulty > max_difficulty:
                removed.append({"docId": doc.id, "reason": f"难度 {doc.difficulty} > i+1 上限 {max_difficulty}"})
                bridges.append(doc)
            else:
                kept.append(doc)
        if not kept and bridges:
            bridge = min(bridges, key=lambda item: item.difficulty)
            kept.append(bridge)
            removed = [item for item in removed if item["docId"] != bridge.id]
        return kept, removed


class BM25Index:
    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b

    def scores(self, query: str, docs: list[Doc]) -> dict[str, float]:
        if not docs:
            return {}
        tokenized = [tokenize(doc.title + " " + doc.content) for doc in docs]
        doc_len = [len(items) for items in tokenized]
        avgdl = sum(doc_len) / len(doc_len)
        df: dict[str, int] = {}
        for items in tokenized:
            for token in set(items):
                df[token] = df.get(token, 0) + 1
        total = len(docs)
        idf = {
            token: math.log(1 + (total - freq + 0.5) / (freq + 0.5))
            for token, freq in df.items()
        }
        result: dict[str, float] = {}
        q_tokens = tokenize(query)
        for doc, items, length in zip(docs, tokenized, doc_len):
            tf: dict[str, int] = {}
            for token in items:
                tf[token] = tf.get(token, 0) + 1
            score = 0.0
            for token in q_tokens:
                if token not in tf:
                    continue
                freq = tf[token]
                denom = freq + self.k1 * (1 - self.b + self.b * length / max(avgdl, 1))
                score += idf.get(token, 0) * (freq * (self.k1 + 1)) / denom
            result[doc.id] = score
        return result


class TfidfVectorIndex:
    """Swap this class for Zhipu Embedding + FAISS in production; contract stays the same."""

    def scores(self, query: str, docs: list[Doc]) -> dict[str, float]:
        if not docs:
            return {}
        tokenized = [tokenize(doc.title + " " + doc.content) for doc in docs]
        df: dict[str, int] = {}
        for items in tokenized:
            for token in set(items):
                df[token] = df.get(token, 0) + 1
        total = len(docs)
        idf = {token: math.log(1 + total / (freq + 1)) for token, freq in df.items()}

        def vector(tokens: list[str]) -> dict[str, float]:
            tf: dict[str, int] = {}
            for token in tokens:
                tf[token] = tf.get(token, 0) + 1
            raw = {token: (1 + math.log(freq)) * idf.get(token, 0) for token, freq in tf.items()}
            norm = math.sqrt(sum(value * value for value in raw.values())) or 1.0
            return {token: value / norm for token, value in raw.items()}

        q_vec = vector(tokenize(query))
        result = {}
        for doc, items in zip(docs, tokenized):
            d_vec = vector(items)
            common = set(q_vec) & set(d_vec)
            result[doc.id] = sum(q_vec[token] * d_vec[token] for token in common)
        return result


class RRFusion:
    """Reciprocal Rank Fusion: Σ 1/(k + rank), rank starts at 1."""

    def __init__(self, k: int = 60, top_k: int = 20):
        self.k = k
        self.top_k = top_k

    def fuse(self, routes: list[tuple[str, dict[str, float]]]) -> list[dict]:
        scores: dict[str, float] = {}
        ranks: dict[str, dict[str, int]] = {}
        for name, scoring in routes:
            ordered = sorted(scoring.items(), key=lambda item: item[1], reverse=True)[: self.top_k]
            for rank, (doc_id, _) in enumerate(ordered, start=1):
                scores[doc_id] = scores.get(doc_id, 0.0) + 1 / (self.k + rank)
                ranks.setdefault(doc_id, {})[name] = rank
        return [
            {
                "docId": doc_id,
                "rrfScore": round(score, 6),
                "ranks": ranks[doc_id],
            }
            for doc_id, score in sorted(scores.items(), key=lambda item: item[1], reverse=True)
        ]


class AnswerAssembler:
    def assemble(self, query: str, ranked: list[dict], docs: list[Doc], profile: dict) -> str:
        if not ranked:
            return "没有找到与当前画像匹配的资料。你可以补充报错原文或具体步骤，我再检索一次。"
        doc_map = {doc.id: doc for doc in docs}
        top = doc_map[ranked[0]["docId"]]
        level = float(profile.get("level", 0.3))
        conclusion = top.plain or top.content
        if level < 0.34:
            return (
                f"【先说结论】{conclusion}\n"
                f"【依据】{top.source_type}《{top.title}》（难度 {top.difficulty}）\n"
                f"【名词】{top.title}：{top.plain or top.content}（{top.analogy or '先记住这个说法即可。'}）\n"
                "【下一步只做一件事】只贴报错全文，只修第一处失败，不要整条重试。"
            )
        if level < 0.67:
            return (
                f"【结论】{conclusion}\n"
                f"【依据】{top.source_type}《{top.title}》（难度 {top.difficulty}）\n"
                "【操作要点】先看第一个失败点，确认参数是否传齐，再决定是否换来源。"
            )
        return (
            f"【结论】{conclusion}\n"
            f"【依据】{top.source_type}《{top.title}》（难度 {top.difficulty}）\n"
            "【边界】先确认版本、依赖和状态传递；若三处都正常，再考虑换论文或视频来源。"
        )


class Retriever:
    def __init__(
        self,
        docs: list[Doc] | None = None,
        vector_scorer: Callable[[str, list[Doc]], dict[str, float]] | None = None,
    ):
        self.docs = docs or build_default_corpus()
        self.vector = TfidfVectorIndex()
        self.custom_vector = vector_scorer
        self.router = QueryRouter()
        self.rewriter = QueryRewriter()
        self.filter = MetadataFilter()
        self.bm25 = BM25Index()
        self.rrf = RRFusion()
        self.assembler = AnswerAssembler()

    def retrieve(
        self,
        query: str,
        profile: dict | None = None,
        trace: bool = False,
        memory: RetrievalMemoryStore | None = None,
    ) -> RetrievalResult:
        profile = profile or {}
        intent, confidence, route_info = self.router.route(query)
        rewritten, clarification = self.rewriter.rewrite(query, intent, route_info)
        pipeline_trace: dict = {
            "originalQuery": query,
            "routing": {"intent": intent, "confidence": confidence, **route_info},
            "rewrittenQuery": rewritten,
        }
        if intent == "vague":
            pipeline_trace["stopped"] = "信息量不足，不检索；先澄清"
            memory_result = self._record_memory(memory, query, intent, [], profile, "vague")
            return RetrievalResult(
                intent=intent,
                route_confidence=confidence,
                rewritten_query=rewritten,
                clarification=clarification,
                answer="这条问题还没定义清楚，我先不检索，避免制造更多碎片。请先回答上面的三个问题。",
                trace=pipeline_trace if trace else {},
                memory=memory_result,
            )

        kept, removed = self.filter.filter(self.docs, profile)
        pipeline_trace["metadataFilter"] = {"kept": [doc.id for doc in kept], "removed": removed}
        bm25_scores = self.bm25.scores(rewritten, kept)
        # BM25 uses the keyword-focused rewrite; the semantic route keeps the
        # student's original wording so it can still follow context and nuance.
        vector_scores = (
            self.custom_vector(query, kept)
            if self.custom_vector
            else self.vector.scores(query, kept)
        )
        fused = self.rrf.fuse([("bm25", bm25_scores), ("vector", vector_scores)])
        pipeline_trace["routes"] = {
            "bm25Query": rewritten,
            "vectorQuery": query,
            "bm25Top": sorted(bm25_scores.items(), key=lambda item: item[1], reverse=True)[:5],
            "vectorTop": sorted(vector_scores.items(), key=lambda item: item[1], reverse=True)[:5],
        }
        pipeline_trace["rrf"] = fused[:10]

        doc_map = {doc.id: doc for doc in self.docs}
        results = []
        for item in fused[:10]:
            doc = doc_map[item["docId"]]
            results.append(
                {
                    "docId": doc.id,
                    "title": doc.title,
                    "sourceType": doc.source_type,
                    "difficulty": doc.difficulty,
                    "snippet": doc.content[:160],
                    "rrfScore": item["rrfScore"],
                    "ranks": item["ranks"],
                    "evidencePointer": f"{doc.source_type}/{doc.id}",
                }
            )
        answer = self.assembler.assemble(query, fused, self.docs, profile)
        memory_result = self._record_memory(memory, query, intent, results[:3], profile, "retrieved")
        return RetrievalResult(
            intent=intent,
            route_confidence=confidence,
            rewritten_query=rewritten,
            results=results,
            answer=answer,
            trace=pipeline_trace if trace else {},
            memory=memory_result,
        )

    @staticmethod
    def _record_memory(memory, query, intent, results, profile, stage):
        if not memory:
            return {"enabled": False}
        return memory.record_retrieval(
            query=query,
            intent=intent,
            results=results,
            profile=profile,
            stage=stage,
        )
