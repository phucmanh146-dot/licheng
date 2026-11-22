"""Run the three narrative scenarios from the resume against real code."""
from __future__ import annotations

import tempfile
from pathlib import Path

from .memory import RetrievalMemoryStore
from .retriever import Retriever


def section(title: str) -> None:
    print(f"\n{'=' * 72}\n{title}\n{'=' * 72}")


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="licheng-retrieval-"))
    memory = RetrievalMemoryStore(tmp / "memory.json")
    retriever = Retriever()

    section("场景 A · 为什么必须混合检索")
    result = retriever.retrieve(
        "跑不通官方例子，报 TypeError", profile={"level": 0.3}, trace=True, memory=memory
    )
    trace = result.trace
    bm25_top = trace["routes"]["bm25Top"][:1]
    vector_top = trace["routes"]["vectorTop"][:1]
    print("原话      :", trace["originalQuery"])
    print("查询路由  :", trace["routing"]["intent"], trace["routing"]["confidence"])
    print("查询重写  :", trace["rewrittenQuery"])
    print("BM25 top1 :", bm25_top)
    print("向量 top1 :", vector_top)
    print("RRF top3  :", trace["rrf"][:3])
    print("过滤掉    :", [item["docId"] for item in trace["metadataFilter"]["removed"]])
    print("\n答案组装（理解档 0.3）：\n" + result.answer)

    section("场景 B · 重复乱查会被拦")
    for day in range(1, 4):
        result = retriever.retrieve(
            "LangGraph 还是跑不通，一直报错",
            profile={"level": 0.2},
            trace=False,
            memory=memory,
        )
        print(
            f"第 {day} 次: 命中 {len(result.results)} 条 | "
            f"新增碎片 {result.memory['fragmentsAdded']} | "
            f"去重 {result.memory['fragmentsDeduped']} | "
            f"主题次数 {result.memory['themeCount']}"
        )
        for alert in result.memory["alerts"]:
            print("  ⚠", alert)

    section("场景 C · 模糊提问先澄清，不检索")
    vague = retriever.retrieve(
        "那个 LangGraph 的东西", profile={"level": 0.3}, trace=True, memory=memory
    )
    print("路由结果  :", vague.trace["routing"])
    print("停止原因  :", vague.trace.get("stopped"))
    for index, question in enumerate(vague.clarification, start=1):
        print(f"  澄清 {index}: {question}")
    print("\n答法：", vague.answer)

    section("记忆分层快照")
    data = memory.data
    print("L1 原始输入:", len(data["L1_raw"]))
    print("L3 碎片收件箱:", len(data["L3_fragments"]))
    for fragment in data["L3_fragments"][:5]:
        print(
            " -", fragment["theme"], fragment["docId"], fragment["sourceType"],
            "weight=", fragment["weight"], "status=", fragment["status"],
        )
    print("L4 画像理解档:", data["L4_profile"]["level"])
    print("L5 主题计数:", {key: value["count"] for key, value in data["L5_themes"].items()})


if __name__ == "__main__":
    main()
