"""票 03 的一次性实验：几种排法、几种禁止调用的方式，每回合各命中多少缓存。

在 backend/ 下运行（要用 eidolon 包里真的人设、世界设定、格式说明和回忆工具）：

    uv run python ../.scratch/prompt-caching/experiment.py deepseek layout-A layout-B layout-C
    uv run python ../.scratch/prompt-caching/experiment.py deepseek tools-drop tools-none tools-auto --layout C
    uv run python ../.scratch/prompt-caching/experiment.py deepseek toolcall-none toolcall-auto --layout C --trials 3
    uv run python ../.scratch/prompt-caching/experiment.py deepseek report

每次请求一行，追加到 experiment-data/<服务>.jsonl；report 把它们汇总成 Markdown 表。
key 从仓库根目录的 .env 读：DeepSeek 用 CHAT_LLM_API_KEY，第三方用 EXPERIMENT_THIRD_PARTY_API_KEY。
"""

import argparse
import asyncio
import json
import random
import secrets
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

from eidolon.affinity import affinity_prompt
from eidolon.characters import load_characters
from eidolon.corpus import Episode, Line
from eidolon.engine import LAST_ROUND_NOTE
from eidolon.facts import CharacterFacts
from eidolon.llm import ChatMessage, Reasoning, ToolCall
from eidolon.llm.openai_compat import _messages
from eidolon.llm.sse import parse_arguments
from eidolon.producer import Birthday, ProducerProfile, producer_prompt
from eidolon.reply_format import FORMAT_INSTRUCTIONS, ReplyParser, format_reply
from eidolon.retrieval import RECALL_STORY_TOOL, StoryReferences, recall_prompt
from eidolon.work_facts import WorkFacts
from eidolon.world import load_world, world_path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DATA = HERE / "experiment-data"
CHARACTER = "meguru"
TZ = "Asia/Shanghai"
GAP_SECONDS = 6  # 两次请求之间等这么久，缓存要几秒才建好
BUDGET_USD = 0.2

SERVICES = {
    "deepseek": {
        "url": "https://api.deepseek.com/v1/chat/completions",
        "model": "deepseek-flash",
        "key": "CHAT_LLM_API_KEY",
        # 闲时价，美元 / 百万 token：未命中、命中、输出
        "prices": (0.15, 0.003, 0.6),
    },
    "third": {
        "url": "https://magpie-api.hmhnk.top/v1/chat/completions",
        "model": "antigravity/gemini-3.8-flash",
        "key": "EXPERIMENT_THIRD_PARTY_API_KEY",
        "prices": None,
    },
    # 同一家第三方换个模型：Gemini 那边命中时有时无，用户怀疑是模型的问题
    "mimo": {
        "url": "https://magpie-api.hmhnk.top/v1/chat/completions",
        "model": "clinepass/cline-free/mimo-v2.6-flash",
        "key": "EXPERIMENT_THIRD_PARTY_API_KEY",
        "prices": None,
    },
    "qoder": {
        "url": "https://magpie-api.hmhnk.top/v1/chat/completions",
        "model": "qoder-cn/qfmodel",
        "key": "EXPERIMENT_THIRD_PARTY_API_KEY",
        "prices": None,
    },
    "qwen": {
        "url": "https://magpie-api.hmhnk.top/v1/chat/completions",
        "model": "qwen-cn/qwen3.8-flash",
        "key": "EXPERIMENT_THIRD_PARTY_API_KEY",
        "prices": None,
    },
}

# 一段 10 回合的闲聊。工具那组把第 4、7 回合换成问往事、并带上预先回忆的剧情。
CHAT = [
    "早上好呀，今天起得有点晚，差点迟到。",
    "昨天加班到很晚，现在还有点困。",
    "你最近有没有在练新歌？",
    "中午想吃点什么好呢，有推荐吗？",
    "下周末好像要下雨，本来想去公园走走的。",
    "你觉得我该不该换个新手机？现在这个用了四年了。",
    "最近在看一部推理剧，挺上头的。",
    "真乃和灯织最近还好吗？",
    "说起来，你最喜欢哪个季节？",
    "好啦，我得去开会了，晚点再聊。",
]
RECALLED = {
    3: "还记得W.I.N.G.决赛那次吗？当时你是什么心情？",
    6: "之前拍写真那次，后来是怎么回事来着？",
}
TOOL_CALL_TURN = "说起来，你们第一次在大舞台上开演唱会那次，是怎么回事来着？我有点记不清了。"

MEMORIES = [
    "制作人养了一只叫团子的橘猫", "制作人不太能吃辣", "制作人老家在仙台",
    "制作人最近在学吉他", "制作人每天早上都要喝黑咖啡", "制作人周末喜欢去河边跑步",
    "制作人有个上高中的妹妹", "制作人说想去北海道看雪", "制作人最近在戒甜食",
    "制作人上个月扭伤了脚踝", "制作人喜欢看推理小说", "制作人的手机屏幕裂了还没修",
    "制作人说小时候学过三年游泳", "制作人最怕打雷", "制作人在考驾照",
    "制作人说最喜欢的饭是咖喱饭", "制作人家楼下新开了一家面包店", "制作人最近总是失眠",
    "制作人说想养一盆多肉", "制作人前几天去看了牙医", "制作人想学做蛋包饭",
    "制作人是棒球队的球迷", "制作人上周把伞忘在了电车上", "制作人说夏天最喜欢吃西瓜",
    "制作人在攒钱买一台新相机", "制作人说大学时参加过合唱团", "制作人很少看电视",
    "制作人说自己方向感很差", "制作人想在年底前读完十本书", "制作人对花粉过敏",
]
FEELINGS = [
    "制作人这句话让你有点开心。", "你觉得制作人有点累，想关心一下。",
    "制作人的话让你觉得很亲切。", "你被制作人逗笑了。", "你有点担心制作人。",
    "制作人愿意跟你聊这些，你很高兴。",
]


def env(name: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip()
    sys.exit(f".env 里没有 {name}")


@dataclass
class Dynamic:
    """一个回合变的内容：当前时间、好感度、记忆、参考资料或预先回忆的剧情。"""

    now: datetime
    affinity: list[str]
    memories: str
    references: str | None
    recall: str | None

    def time_line(self) -> str:
        return producer_prompt(ProducerProfile(), self.now, TZ).splitlines()[-1]

    def sections(self) -> list[str]:
        """记忆和参考资料（或剧情），引擎里跟在制作人那段后面的那些。"""
        return [s for s in (self.memories, self.recall or self.references) if s]

    def message(self) -> str:
        """B、C 里靠后的那条系统消息。"""
        head = "\n".join(["# 此刻", self.time_line(), *self.affinity])
        return "\n\n".join([head, *self.sections()])


class Material:
    """真的人设、世界设定、剧情；假的记忆。同一个回合号在每种情况里都拿到同一份动态内容。"""

    def __init__(self) -> None:
        characters_path = ROOT / "characters" / "characters.toml"
        self.character = load_characters(characters_path)[CHARACTER]
        world = load_world(world_path(characters_path))
        self.start = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        self.world = world.prompt(self.character.name, self.start.astimezone().date()) if world else ""
        self.profile = ProducerProfile(birthday=Birthday(3, 8))
        db = sqlite3.connect(f"file:{ROOT / 'backend' / 'data' / 'eidolon.db'}?mode=ro", uri=True)
        ids = [r[0] for r in db.execute(
            "SELECT episode_id FROM episode_cast WHERE character_id = ? ORDER BY episode_id",
            (CHARACTER,),
        )]
        rng = random.Random(3)
        self.passages = [
            r[0] for r in db.execute(
                f"SELECT text FROM episode_passages WHERE episode_id IN ({','.join('?' * 60)})",
                rng.sample(ids, 60),
            )
        ]
        self.episodes = [self._episode(db, i) for i in rng.sample(ids, 12)]
        self.facts = [
            p.strip() for p in (ROOT / "characters" / "facts" / f"{CHARACTER}.md")
            .read_text(encoding="utf-8").split("\n\n") if len(p.strip()) > 80
        ]

    @staticmethod
    def _episode(db: sqlite3.Connection, episode_id: str) -> Episode:
        category, source, title = db.execute(
            "SELECT category, source, title FROM episodes WHERE id = ?", (episode_id,)
        ).fetchone()
        lines = tuple(
            Line(s, ja, zh) for s, ja, zh in db.execute(
                "SELECT speaker, ja, zh FROM episode_lines WHERE episode_id = ? ORDER BY seq",
                (episode_id,),
            )
        )
        return Episode(episode_id, category, source, title, frozenset({CHARACTER}), lines)

    def dynamic(self, turn: int, recalled: str | None = None) -> Dynamic:
        rng = random.Random(1000 + turn)
        memories = "\n".join([
            "# 关于制作人的记忆",
            "下面是制作人以前说过的、和这句话可能有关的事，按相关程度排列，和话题无关的可以忽略。"
            "像平时记得这些事一样自然地提起，不要逐条复述。",
            *(f"- {m}（2026年{rng.randint(6, 9)}月{rng.randint(1, 28)}日，制作人对你说的）"
              for m in rng.sample(MEMORIES, 3)),
        ])
        references = None
        if rng.random() < 0.6:  # 线上大约这么多回合要检索
            lines = [
                "# 回忆与资料",
                "下面是和制作人这句话可能有关的内容，按相关程度排列，和话题无关的可以忽略。",
                f"- {StoryReferences.guide}", f"- {CharacterFacts.guide}", f"- {WorkFacts.guide}",
            ]
            for text in rng.sample(self.passages, 2):
                lines += ["", f"## {StoryReferences.heading}", text]
            lines += ["", f"## {CharacterFacts.heading}", rng.choice(self.facts)]
            references = "\n".join(lines)
        recall = None
        if recalled is not None:
            recall = recall_prompt(recalled, [rng.choice(self.episodes)], [])
        affinity = [*affinity_prompt("close", None), rng.choice(FEELINGS)]
        return Dynamic(self.start + timedelta(minutes=2 * turn), affinity, memories,
                       references, recall)

    def recall_result(self, query: str, turn: int) -> str:
        return recall_prompt(query, [random.Random(2000 + turn).choice(self.episodes)], [])

    def shared(self, nonce: str, with_format: bool) -> str:
        parts = [f"（会话编号 {nonce}）", self.character.sheet]
        if self.world:
            parts.append(self.world)
        if with_format:
            parts.append(FORMAT_INSTRUCTIONS)
        return "\n\n".join(parts)

    def producer_fixed(self) -> str:
        """制作人那段去掉当前时间：称呼、性别、生日日期。"""
        return "\n".join(producer_prompt(self.profile, self.start, TZ).splitlines()[:-1])


@dataclass
class Past:
    user: str
    reply: str
    dynamic: Dynamic


def prompt(layout: str, m: Material, nonce: str, past: list[Past], dyn: Dynamic,
           text: str) -> list[ChatMessage]:
    if layout == "A":  # 现在的：动态内容在开头的系统提示词中间
        producer = "\n".join([*m.producer_fixed().splitlines(), dyn.time_line(), *dyn.affinity])
        sent = [
            ChatMessage("system", m.shared(nonce, with_format=False)),
            ChatMessage("system", "\n\n".join([producer, *dyn.sections(), FORMAT_INSTRUCTIONS])),
        ]
        for p in past:
            sent += [ChatMessage("user", p.user), ChatMessage("assistant", p.reply)]
        return [*sent, ChatMessage("user", text)]
    sent = [
        ChatMessage("system", m.shared(nonce, with_format=True)),
        ChatMessage("system", m.producer_fixed()),
    ]
    for p in past:
        if layout == "C":  # 只追加：之前回合的动态内容留在历史里
            sent.append(ChatMessage("system", p.dynamic.message()))
        sent += [ChatMessage("user", p.user), ChatMessage("assistant", p.reply)]
    return [*sent, ChatMessage("system", dyn.message()), ChatMessage("user", text)]


@dataclass
class Service:
    name: str
    url: str
    model: str
    key: str
    prices: tuple[float, float, float] | None
    gap: float = GAP_SECONDS
    client: httpx.AsyncClient = field(default_factory=lambda: httpx.AsyncClient(
        timeout=httpx.Timeout(180, connect=15)))

    def log(self, record: dict[str, Any]) -> None:
        DATA.mkdir(exist_ok=True)
        with (DATA / f"{self.name}.jsonl").open("a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def spent(self) -> float:
        if self.prices is None:
            return 0.0
        return sum(cost(r, self.prices) for r in read(self.name))

    async def request(self, messages: list[ChatMessage], tools: str, record: dict[str, Any]
                      ) -> tuple[str, list[ToolCall], Reasoning | None]:
        """tools：drop 不提供，none 提供但 tool_choice: none，auto 照常允许。"""
        if self.prices is not None and (spent := self.spent()) > BUDGET_USD:
            sys.exit(f"已经花了 ${spent:.4f}，超过 ${BUDGET_USD}，先停下")
        body: dict[str, Any] = {
            "model": self.model,
            "stream": True,
            "stream_options": {"include_usage": True},
            "messages": _messages(messages),
        }
        if tools != "drop":
            body["tools"] = [{"type": "function", "function": {
                "name": RECALL_STORY_TOOL.name,
                "description": RECALL_STORY_TOOL.description,
                "parameters": RECALL_STORY_TOOL.parameters,
            }}]
            if tools == "none":
                body["tool_choice"] = "none"
        record = {
            **record, "tools": tools, "sent_at": datetime.now(timezone.utc).isoformat(),
            "messages": len(body["messages"]),
            "prompt_chars": sum(len(m.get("content") or "") for m in body["messages"]),
        }
        started = time.monotonic()
        text, reasoning, usage, error = "", "", None, None
        calls: dict[int, dict[str, Any]] = {}
        headers = {"Authorization": f"Bearer {self.key}"}
        try:
            async with self.client.stream("POST", self.url, json=body, headers=headers) as res:
                if res.status_code >= 400:
                    await res.aread()
                    error = f"{res.status_code}: {res.text[:800]}"
                else:
                    async for line in res.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line.removeprefix("data:").strip()
                        if not data or data == "[DONE]":
                            continue
                        event = json.loads(data)
                        if event.get("error"):
                            error = json.dumps(event["error"], ensure_ascii=False)
                        if isinstance(event.get("usage"), dict):
                            usage = event["usage"]
                        for choice in event.get("choices") or []:
                            delta = choice.get("delta") or {}
                            text += delta.get("content") or ""
                            reasoning += delta.get("reasoning_content") or ""
                            for fragment in delta.get("tool_calls") or []:
                                call = calls.setdefault(fragment.get("index", 0),
                                                        {"id": "", "name": "", "arguments": ""})
                                call["id"] = fragment.get("id") or call["id"]
                                function = fragment.get("function") or {}
                                call["name"] = function.get("name") or call["name"]
                                arguments = function.get("arguments") or ""
                                if not isinstance(arguments, str):
                                    arguments = json.dumps(arguments, ensure_ascii=False)
                                call["arguments"] += arguments
                                # Gemini 的思维签名，产品的适配器会随调用发回去
                                if isinstance(extra := fragment.get("extra_content"), dict):
                                    call["extra_content"] = extra
        except httpx.HTTPError as e:
            error = repr(e)
        assembled = [(c["id"] or f"call_{i}", c) for i, c in sorted(calls.items())]
        tool_calls = [ToolCall(i, c["name"], parse_arguments(c["arguments"])) for i, c in assembled]
        sent_back: dict[str, Any] = {}
        if reasoning:
            sent_back["reasoning_content"] = reasoning
        if extras := {i: c["extra_content"] for i, c in assembled if "extra_content" in c}:
            sent_back["extra_content"] = extras  # 和产品一样按调用 id 存
        record.update(
            seconds=round(time.monotonic() - started, 2), error=error, usage=usage,
            total=usage.get("prompt_tokens") if usage else None,
            hit=hits(usage) if usage else None,
            output=usage.get("completion_tokens") if usage else None,
            reply=text, reasoning_chars=len(reasoning), signed=bool(extras),
            calls=[{"name": c.name, "arguments": c.arguments} for c in tool_calls],
        )
        self.log(record)
        shown = f"命中 {record['hit']} / {record['total']}" if usage else f"错误 {error}"
        print(f"  {record['case']} 回合 {record['turn']} 第 {record['round']} 轮 [{tools}]: "
              f"{shown}，回复 {len(text)} 字，调用 {len(tool_calls)} 次"
              f"{'（带思维签名）' if extras else ''}", flush=True)
        await asyncio.sleep(self.gap)
        return text, tool_calls, Reasoning(sent_back) if sent_back else None


def hits(usage: dict[str, Any]) -> int | None:
    """和票 01 的适配器一样，依次看三个候选字段；都没有就是没报。"""
    details = usage.get("prompt_tokens_details")
    for told in (
        details.get("cached_tokens") if isinstance(details, dict) else None,
        usage.get("prompt_cache_hit_tokens"),
        usage.get("cached_tokens"),
    ):
        if isinstance(told, int):
            return told
    return None


async def take_turn(s: Service, case: str, turn: int, messages: list[ChatMessage],
                    first: str, second: str, recalled_query: str | None, m: Material,
                    extra: dict[str, Any] | None = None) -> str | None:
    """像引擎那样走完一个回合：第一轮按 `first` 处理工具；调了工具就答上，第二轮按 `second`。
    返回记进历史的回复（按 format_reply 重排过的），失败时 None。"""
    parser = ReplyParser()
    record = {"case": case, "turn": turn + 1, **(extra or {})}
    text, calls, reasoning = await s.request(messages, first, {**record, "round": 1})
    parser.feed(text)
    if calls and first == "auto":
        messages = [*messages, ChatMessage("assistant", text, tuple(calls),
                                           reasoning=(reasoning,) if reasoning else ())]
        for call in calls:
            query = (call.arguments or {}).get("query") or recalled_query or "那次"
            result = f"{m.recall_result(str(query), turn)}\n\n{LAST_ROUND_NOTE}"
            messages.append(ChatMessage("tool", result, tool_call_id=call.id))
        text, _, _ = await s.request(messages, second, {**record, "round": 2})
        parser.feed(text)
    parser.finish()
    return format_reply(parser.complete) if parser.complete else None


async def conversation(s: Service, case: str, layout: str, m: Material,
                       recalled_tools: str | None, second: str) -> list[Past]:
    """10 回合。`recalled_tools` 不为 None 时，第 4、7 回合预先回忆过剧情，工具按它处理。"""
    nonce = secrets.token_hex(6)
    past: list[Past] = []
    for turn, line in enumerate(CHAT):
        recalled = RECALLED.get(turn) if recalled_tools else None
        text = recalled or line
        dyn = m.dynamic(turn, recalled)
        first = recalled_tools if recalled_tools and recalled else "auto"
        reply = await take_turn(
            s, case, turn, prompt(layout, m, nonce, past, dyn, text), first, second, recalled, m,
            {"recalled": recalled is not None, "nonce": nonce, "layout": layout},
        )
        if reply is None:
            print(f"  {case} 回合 {turn + 1} 没有回复，停下")
            break
        past.append(Past(text, reply, dyn))
    return past


async def tool_call_trial(s: Service, case: str, layout: str, m: Material, second: str,
                          trial: int) -> None:
    """取 layout-<layout> 那段对话的前 5 回合（真实回复）作历史，第 6 回合问往事、不预先回忆，
    让模型自己调工具；第二轮按 `second` 处理。"""
    done = [r for r in read(s.name) if r["case"] == f"layout-{layout}" and r["round"] == 1]
    if len(done) < 5:
        sys.exit(f"先跑 layout-{layout}")
    nonce = secrets.token_hex(6)
    past = []
    for turn, line in enumerate(CHAT[:5]):
        reply = next(r for r in done if r["turn"] == turn + 1)["reply"]
        parser = ReplyParser()
        parser.feed(reply)
        parser.finish()
        past.append(Past(line, format_reply(parser.complete), m.dynamic(turn)))
    turn = 5
    messages = prompt(layout, m, nonce, past, m.dynamic(turn), TOOL_CALL_TURN)
    for attempt in range(3):  # 没调工具就换个编号再来
        record = {"case": case, "turn": turn + 1, "trial": trial, "attempt": attempt,
                  "nonce": nonce, "layout": layout}
        text, calls, reasoning = await s.request(messages, "auto", {**record, "round": 1})
        if calls:
            break
        nonce = secrets.token_hex(6)
        messages = prompt(layout, m, nonce, past, m.dynamic(turn), TOOL_CALL_TURN)
    else:
        return
    messages = [*messages, ChatMessage("assistant", text, tuple(calls),
                                       reasoning=(reasoning,) if reasoning else ())]
    for call in calls:
        query = str((call.arguments or {}).get("query") or "第一次演唱会")
        messages.append(ChatMessage(
            "tool", f"{m.recall_result(query, turn)}\n\n{LAST_ROUND_NOTE}", tool_call_id=call.id))
    await s.request(messages, second, {**record, "round": 2})


def read(name: str) -> list[dict[str, Any]]:
    path = DATA / f"{name}.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def input_cost(r: dict[str, Any], prices: tuple[float, float, float]) -> float:
    """按闲时价算的输入花费（美元）；没报命中的按全部未命中。"""
    hit = r.get("hit") or 0
    return (((r.get("total") or 0) - hit) * prices[0] + hit * prices[1]) / 1e6


def cost(r: dict[str, Any], prices: tuple[float, float, float]) -> float:
    """按闲时价算的花费（美元），含输出。"""
    miss_price, hit_price, out_price = prices
    total, hit, out = r.get("total") or 0, r.get("hit") or 0, r.get("output") or 0
    return ((total - hit) * miss_price + hit * hit_price + out * out_price) / 1e6


def report(name: str, prices: tuple[float, float, float] | None) -> None:
    records = read(name)
    cases: dict[str, list[dict[str, Any]]] = {}
    for r in records:
        cases.setdefault(r["case"], []).append(r)
    print(f"## {name}\n")
    print("| 情况 | 请求数 | 总输入 | 命中 | 命中率 | 去掉第 1 回合的命中率 | 输入花费（闲时价） | 平均提示词字数 |")
    print("|---|---|---|---|---|---|---|---|")
    for case, rs in cases.items():
        ok = [r for r in rs if r.get("usage")]
        total = sum(r["total"] or 0 for r in ok)
        hit = sum(r["hit"] or 0 for r in ok)
        later = [r for r in ok if r["turn"] != 1]
        later_total = sum(r["total"] or 0 for r in later)
        later_hit = sum(r["hit"] or 0 for r in later)
        spend = f"${sum(input_cost(r, prices) for r in ok):.5f}" if prices else "—"
        chars = sum(r["prompt_chars"] for r in ok) // max(len(ok), 1)
        rate = f"{hit / total:.1%}" if total else "—"
        later_rate = f"{later_hit / later_total:.1%}" if later_total else "—"
        print(f"| {case} | {len(ok)} | {total} | {hit} | {rate} | {later_rate} | {spend} | {chars} |")
    seconds = [r for r in records if r["round"] == 2 and r.get("usage")]
    if seconds:
        print("\n工具回合的第二轮（调过工具、答上之后那次请求）：\n")
        print("| 情况 | 第二轮次数 | 命中 / 总输入 | 命中率 | 又调了工具 | 其中一个字没说 |")
        print("|---|---|---|---|---|---|")
        for case in cases:
            rs = [r for r in seconds if r["case"] == case]
            if not rs:
                continue
            total = sum(r["total"] for r in rs)
            hit = sum(r["hit"] or 0 for r in rs)
            again = [r for r in rs if r["calls"]]
            print(f"| {case} | {len(rs)} | {hit} / {total} | {hit / total:.1%} | {len(again)} | "
                  f"{sum(1 for r in again if not r['reply'].strip())} |")
    for case, rs in cases.items():
        print(f"\n### {case}\n")
        print("| 回合 | 轮 | 工具 | 发出（UTC） | 总输入 | 命中 | 未命中 | 输出 | 回复字数 | 调用 | 备注 |")
        print("|---|---|---|---|---|---|---|---|---|---|---|")
        for r in rs:
            notes = []
            if r.get("recalled"):
                notes.append("预先回忆过")
            if r.get("trial") is not None:
                notes.append(f"第 {r['trial']} 次")
            if r.get("attempt"):
                notes.append(f"重试 {r['attempt']}")
            if r.get("error"):
                notes.append(f"错误：{r['error'][:120]}")
            hit = r.get("hit")
            miss = (r["total"] - hit) if r.get("total") is not None and hit is not None else None
            calls = "、".join(str((c.get("arguments") or {}).get("query")) for c in r["calls"])
            print(f"| {r['turn']} | {r['round']} | {r['tools']} | {r['sent_at'][11:19]} | "
                  f"{r.get('total')} | {'没报' if hit is None and r.get('usage') else hit} | {miss} | "
                  f"{r.get('output')} | {len(r['reply'])} | {calls} | {'；'.join(notes)} |")
    upstream = [
        r["usage"]["cost_details"]["upstream_inference_cost"] for r in records
        if isinstance((r.get("usage") or {}).get("cost_details"), dict)
        and isinstance(r["usage"]["cost_details"].get("upstream_inference_cost"), (int, float))
    ]
    if upstream:
        charged = sum(r["usage"]["cost"] for r in records
                      if isinstance((r.get("usage") or {}).get("cost"), (int, float)))
        print(f"\n服务报的花费：上游推理 ${sum(upstream):.5f}（{len(upstream)} 次请求），"
              f"`cost` 合计 ${charged:.5f}")
    if prices:
        print(f"\n实际花费（闲时价，含输出）：${sum(cost(r, prices) for r in records):.5f}，"
              f"{len(records)} 次请求")


async def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    parser = argparse.ArgumentParser()
    parser.add_argument("service", choices=SERVICES)
    parser.add_argument("cases", nargs="+")
    parser.add_argument("--layout", default="C", choices=["A", "B", "C"])
    parser.add_argument("--trials", type=int, default=3)
    parser.add_argument("--first-trial", type=int, default=1)
    parser.add_argument("--gap", type=float, default=GAP_SECONDS)
    parser.add_argument("--tag", default="", help="加在情况名后面，区分重跑")
    args = parser.parse_args()
    conf = SERVICES[args.service]
    if args.cases == ["report"]:
        report(args.service, conf["prices"])
        return
    s = Service(args.service, conf["url"], conf["model"], env(conf["key"]), conf["prices"],
                args.gap)
    m = Material()
    for case in args.cases:
        print(case, flush=True)
        kind, _, variant = case.partition("-")
        if (kind == "layout" and variant not in ("A", "B", "C")) or (
            kind in ("tools", "toolcall") and variant not in ("drop", "none", "auto")
        ):
            sys.exit(f"不认识 {case}")
        if kind == "layout":
            await conversation(s, case + args.tag, variant, m, None, "none")
        elif kind == "tools":
            # 一致的禁止调用方式：预先回忆过的回合、调过工具后的第二轮都用它
            await conversation(s, f"{case}-{args.layout}{args.tag}", args.layout, m, variant,
                               variant)
        elif kind == "toolcall":
            for trial in range(args.first_trial, args.first_trial + args.trials):
                await tool_call_trial(s, f"{case}-{args.layout}{args.tag}", args.layout, m, variant,
                                      trial)
        elif kind == "probe":  # 第三方：先跑两个回合看报不报命中、接不接受中途系统消息
            nonce = secrets.token_hex(6)
            past: list[Past] = []
            for turn in range(2):
                dyn = m.dynamic(turn)
                reply = await take_turn(s, case, turn, prompt(variant or "B", m, nonce, past, dyn,
                                                               CHAT[turn]), "auto", "none", None, m)
                past.append(Past(CHAT[turn], reply or "", dyn))
            dyn = m.dynamic(2)
            await s.request(prompt(variant or "B", m, nonce, past, dyn, CHAT[2]), "none",
                            {"case": case, "turn": 3, "round": 1})
        elif kind == "repeat":  # 同一个请求原样发三次：服务到底缓不缓存
            messages = prompt("B", m, secrets.token_hex(6), [], m.dynamic(0), CHAT[0])
            for attempt in range(3):
                await s.request(messages, "auto",
                                {"case": case, "turn": 1, "round": 1, "attempt": attempt})
                await asyncio.sleep(20)
        else:
            sys.exit(f"不认识 {case}")
    await s.client.aclose()
    if s.prices:
        print(f"累计花费（闲时价）：${s.spent():.5f}")


if __name__ == "__main__":
    asyncio.run(main())
