"""从 results/*.jsonl 算出每句话的时延（ticket 01）。

    python analyze.py <场景名> [<场景名> ...]

每句（sentence_id）给出：sentence_begin、第一条有字的中间结果、最后一条中间结果、终稿的到达时刻，
以及「最后一条中间结果 → 终稿」的间隔（这就是 FOLLOW_ON_TIMEOUT 要盖住的那段）。
"""

import json
import sys
from pathlib import Path

RESULTS = Path(__file__).resolve().parent / "results"

for name in sys.argv[1:]:
    print(f"== {name}")
    sentences: dict[int, dict] = {}
    for line in (RESULTS / f"{name}.jsonl").read_text(encoding="utf-8").splitlines():
        rec = json.loads(line)
        s = rec.get("sentence")
        if rec["kind"] != "result-generated" or s.get("heartbeat"):
            continue
        row = sentences.setdefault(s["sentence_id"], {})
        if s.get("sentence_begin"):
            row["begin"] = rec["t"]
        if s["sentence_end"]:
            row["final"] = rec["t"]
            row["text"] = s["text"]
            row["audio_end"] = s["end_time"] / 1000
        else:
            row["last_interim"] = rec["t"]
            if s["text"] and "first_text" not in row:
                row["first_text"] = rec["t"]
                row["first_text_audio"] = s["begin_time"] / 1000
    for sid, r in sentences.items():
        gap = None if "last_interim" not in r or "final" not in r else round(r["final"] - r["last_interim"], 3)
        print(
            f"  #{sid} begin={r.get('begin')} first_text={r.get('first_text')} "
            f"last_interim={r.get('last_interim')} final={r.get('final')} "
            f"(服务端 end_time={r.get('audio_end')}) 最后中间→终稿={gap} {r.get('text')!r}"
        )
