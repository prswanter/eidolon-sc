"""票 04 的对照稿：同一套固定对话在改动前后各跑一遍，回复左右对照。

先在本地起后端（.env 里的对话模型是 deepseek-flash，开发登录开着），再在 backend/ 下运行：

    uv run python ../.scratch/prompt-caching/compare.py run before   # 改动前的代码上
    uv run python ../.scratch/prompt-caching/compare.py run after    # 改动后的代码上
    uv run python ../.scratch/prompt-caching/compare.py report       # 写 compare.md

每个场景用一个新的开发登录用户，跑完删掉它。回复写进 compare-data/<before|after>.json。
"""

import asyncio
import json
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx

ORIGIN = "http://localhost:8000"
HERE = Path(__file__).parent
DATA = HERE / "compare-data"
DB = HERE.parent.parent / "backend" / "data" / "eidolon.db"
CHARACTER = "mano"
TIMEZONE = "Asia/Shanghai"

SCENARIOS: list[dict[str, Any]] = [
    {"name": "时间", "turns": ["你好呀，真乃", "现在几点了？", "这个点你一般在做什么？"]},
    {
        "name": "记忆",
        "earlier": ["跟你说，我上周开始学弹吉他了，左手指尖都磨出茧了。", "老师说我节奏感还行，就是换和弦太慢。"],
        "turns": ["真乃，又见面啦", "还记得我之前跟你说我在学什么吗？练得怎么样你猜？"],
    },
    {"name": "原作剧情", "turns": ["真乃，早上好", "还记得我们第一次见面的时候吗？那时候你是怎么想的？", "W.I.N.G. 的决赛前一天你紧张吗？"]},
    {"name": "低好感度", "affinity": 25, "turns": ["早上好，真乃", "今天中午一起去吃饭吧？", "最近怎么都不太理我？"]},
    {"name": "生日当天", "birthday": True, "turns": ["早上好，真乃", "今天有什么安排吗？"]},
    {"name": "送礼", "gift": "cake", "turns": ["真乃，今天辛苦了", "希望你喜欢！", "明天的拍摄也加油哦"]},
]


async def sign_in(client: httpx.AsyncClient, name: str) -> str:
    headers = {"origin": ORIGIN}
    (await client.post("/api/auth/dev-login", json={"name": name}, headers=headers)).raise_for_status()
    await client.post(
        "/api/account/consent", json={"agree_to_terms": True, "at_least_13": True}, headers=headers
    )
    return (await client.get("/api/account")).json()["id"]


async def turn(client: httpx.AsyncClient, conversation: str, text: str) -> str:
    said: list[str] = []
    async with client.stream(
        "POST", f"/api/conversations/{conversation}/turns", json={"text": text},
        headers={"origin": ORIGIN, "x-timezone": TIMEZONE}, timeout=180,
    ) as res:
        res.raise_for_status()
        async for line in res.aiter_lines():
            if not line.startswith("data: "):
                continue
            event = json.loads(line[6:])
            if event["type"] == "done":
                m = event["message"]
                said.append(f"{m.get('ja') or ''}\n{m.get('zh') or ''}".strip())
            elif event["type"] == "error":
                said.append(f"（出错：{event['message']}）")
    return "\n".join(said)


async def new_conversation(client: httpx.AsyncClient) -> str:
    res = await client.post("/api/conversations", json={"character_id": CHARACTER},
                            headers={"origin": ORIGIN})
    res.raise_for_status()
    return res.json()["id"]


async def scenario(s: dict[str, Any], tag: str) -> list[dict[str, str]]:
    async with httpx.AsyncClient(base_url=ORIGIN, timeout=60) as client:
        user = await sign_in(client, f"cmp-{tag}-{SCENARIOS.index(s)}")
        transcript: list[dict[str, str]] = []
        try:
            if s.get("birthday"):
                today = datetime.now(ZoneInfo(TIMEZONE))
                await client.put("/api/profile", headers={"origin": ORIGIN}, json={
                    "form_of_address": None, "gender": None, "timezone": TIMEZONE,
                    "birthday": {"month": today.month, "day": today.day},
                })
            if "earlier" in s:
                earlier = await new_conversation(client)
                for text in s["earlier"]:
                    await turn(client, earlier, text)
                for _ in range(90):  # 等记忆写下
                    if (await client.get("/api/memories")).json():
                        break
                    await asyncio.sleep(2)
                memories = [m["text"] for m in (await client.get("/api/memories")).json()]
                transcript.append({"user": "（之前的对话里说过）" + " / ".join(s["earlier"]),
                                   "reply": "（记下的记忆）" + " / ".join(memories)})
            await client.get("/api/gifts")  # 建好好感度和礼物的行
            if "affinity" in s:
                with sqlite3.connect(DB) as db:
                    db.execute(
                        "INSERT OR REPLACE INTO affinities (user_id, character_id, value, updated_at, cooling)"
                        " VALUES (?, ?, ?, ?, 0)",
                        (user, CHARACTER, s["affinity"], datetime.now(UTC).isoformat()),
                    )
            conversation = await new_conversation(client)
            for i, text in enumerate(s["turns"]):
                if "gift" in s and i == 1:
                    with sqlite3.connect(DB) as db:
                        db.execute("INSERT OR REPLACE INTO gift_backpacks VALUES (?, ?, 1)",
                                   (user, s["gift"]))
                    res = await client.post(
                        f"/api/characters/{CHARACTER}/gifts", headers={"origin": ORIGIN},
                        json={"gift_id": s["gift"], "conversation_id": conversation},
                    )
                    res.raise_for_status()
                    transcript.append({"user": f"（送出礼物 {s['gift']}）", "reply": ""})
                transcript.append({"user": text, "reply": await turn(client, conversation, text)})
        finally:
            await client.post("/api/account/delete", json={"confirm": True},
                              headers={"origin": ORIGIN})
        return transcript


async def run(tag: str) -> None:
    DATA.mkdir(exist_ok=True)
    results = {}
    for s in SCENARIOS:
        print(f"{tag}: {s['name']}", flush=True)
        results[s["name"]] = await scenario(s, tag)
    (DATA / f"{tag}.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
    )


def cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", "<br>")


def report() -> None:
    before = json.loads((DATA / "before.json").read_text(encoding="utf-8"))
    after = json.loads((DATA / "after.json").read_text(encoding="utf-8"))
    lines = [
        "# 对照稿：每回合变的内容挪到历史后面前后，真乃的回复",
        "",
        "票 04。本地后端接真实 `deepseek-flash`，同一套固定对话在改动前（动态内容在开头的系统提示词里）"
        "和改动后（动态内容是历史后面、这句话前面的一条系统消息）各跑一遍。每个场景一个新用户、一个新对话；"
        "用户的话两边相同，回复不同是正常的（每次生成都会不同），要看的是语气、人设、"
        "以及该知道的事（时间、记忆、剧情、好感度档位、生日、礼物）知不知道。",
        "",
    ]
    for name, rows in before.items():
        lines += [f"## {name}", "", "| 制作人 | 改动前 | 改动后 |", "|---|---|---|"]
        for b, a in zip(rows, after[name], strict=False):
            lines.append(f"| {cell(b['user'])} | {cell(b['reply'])} | {cell(a['reply'])} |")
        lines.append("")
    (HERE / "compare.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")


HITS_TURNS = [
    "真乃，早上好", "今天天气不错呢", "你早饭吃了什么？", "我今天吃了包子", "最近在练什么歌？",
    "还记得我们第一次见面的时候吗？", "那时候你紧张吗？", "灯织和めぐる最近怎么样？",
    "周末有什么打算？", "我想去公园散步", "要一起去吗？", "那就这么说定了",
]


async def hits(tag: str) -> None:
    """连发 HITS_TURNS，每回合对话模型的总输入和命中从 service_calls 读出来。"""
    async with httpx.AsyncClient(base_url=ORIGIN, timeout=60) as client:
        await sign_in(client, f"cmp-hits-{tag}")
        conversation = await new_conversation(client)
        start = datetime.now(UTC).timestamp()
        try:
            for text in HITS_TURNS:
                await turn(client, conversation, text)
        finally:
            await client.post("/api/account/delete", json={"confirm": True},
                              headers={"origin": ORIGIN})
    with sqlite3.connect(DB) as db:
        rows = db.execute(
            "SELECT usage_input, usage_cached FROM service_calls"
            " WHERE service = 'chat_llm' AND at >= ? ORDER BY at", (start,),
        ).fetchall()
    DATA.mkdir(exist_ok=True)
    (DATA / f"hits-{tag}.json").write_text(json.dumps(rows), encoding="utf-8", newline="\n")
    total, cached = sum(r[0] for r in rows), sum(r[1] or 0 for r in rows)
    rest = rows[1:]
    print(f"{tag}: {len(rows)} 次请求，命中 {cached:.0f} / {total:.0f} = {cached / total:.1%}；"
          f"去掉第 1 回合 {sum(r[1] or 0 for r in rest) / sum(r[0] for r in rest):.1%}")
    for i, (total_in, hit) in enumerate(rows, 1):
        print(f"  {i:2} 输入 {total_in:6.0f} 命中 {hit or 0:6.0f} 未命中 {total_in - (hit or 0):5.0f}")


if __name__ == "__main__":
    if sys.argv[1] == "run":
        asyncio.run(run(sys.argv[2]))
    elif sys.argv[1] == "hits":
        asyncio.run(hits(sys.argv[2]))
    else:
        report()
