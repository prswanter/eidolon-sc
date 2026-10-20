"""一次性实测脚本（票 04）：同一批中文录音在百炼实时识别里开、关热词时识别成什么，断句多快。

用法（在 backend/ 下，借用后端的依赖和词表）：

    uv run python ../.scratch/retrieval-and-hotwords/prototype/measure.py synth
    uv run python ../.scratch/retrieval-and-hotwords/prototype/measure.py measure
    uv run python ../.scratch/retrieval-and-hotwords/prototype/measure.py table
    uv run python ../.scratch/retrieval-and-hotwords/prototype/measure.py soniox

- synth：用 Fish Audio 的中文声音把 SENTENCES 合成成 16 kHz 单声道 PCM，存到 audio/NN.wav（不进仓库）。
- measure：每句一个任务，录音后补 3 秒静音，按实时速度推给百炼 `qwen-audio-3.1-asr-flash-streaming`，
  每种条件（CONDITIONS）各跑一遍，几种条件并发；每条事件和到达时刻写进 results/<条件>.jsonl。
  参数和后端一样（bailian.PARAMETERS），开词表时加 `vocabulary`，词表就是后端启动时生成的那份
  （hot_words.hot_words，读仓库里的读音表、角色配置和世界设定），权重 4。
- table：从 results/ 汇总成 Markdown 表：每句的识别结果，以及「录音里最后一个字 → 终稿到达」的秒数。
- soniox：用 Soniox 的默认模型 stt-rt-v5，以对象形式的 context（terms 为同一份词表）识别第一句，
  确认服务接受 Pipecat 发出的配置（context 里不填的字段是 null）。

密钥从仓库根目录（主仓库）的 .env 读，不打印。
"""

from __future__ import annotations

import asyncio
import audioop
import json
import sys
import time
import uuid
import wave
from pathlib import Path

import httpx
import websockets

from eidolon.bailian import PARAMETERS
from eidolon.characters import load_characters
from eidolon.hot_words import hot_words
from eidolon.readings import load_readings, readings_path
from eidolon.world import load_world, world_path

HERE = Path(__file__).resolve().parent
AUDIO = HERE / "audio"
RESULTS = HERE / "results"
REPO = HERE.parents[2]
ENV = Path(r"E:\Download\others\agent-test\eidolon-sc\.env")
"""主仓库的 .env（worktree 里没有）。"""

BEIJING = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
MODEL = "qwen-audio-3.1-asr-flash-streaming"
RATE = 16000
CHUNK_BYTES = RATE * 2 // 10  # 100 ms
TAIL_SILENCE = 3.0

VOICES = {
    "f": "7f92f8afb8ec43bf81429cc1c9199cb1",  # Fish Audio 公共声音「AD学姐」，中文女声
    "m": "59cb5986671546eaa6ca8ae6f29f6d22",  # 「央视配音」，中文男声
}

SENTENCES: list[tuple[str, str]] = [  # (声音, 句子)
    ("f", "我今天和灯织一起去练习了。"),
    ("m", "恋钟昨天在后台又迷路了。"),
    ("f", "夏叶说她明天要去健身房。"),
    ("m", "真乃最近是不是在拍写真集？"),
    ("f", "你觉得樱木真乃和风野灯织谁更可爱？"),
    ("m", "L'Antica的新歌我听了好多遍。"),
    ("f", "illumination STARS的三个人感情真好。"),
    ("m", "Straylight和noctchill的风格完全不一样。"),
    ("f", "283事务所今天放假吗？"),
    ("m", "冬优子在镜头前和私下完全是两个人。"),
    ("f", "摩美美又在恶作剧了。"),
    ("m", "小糸和雏菜是青梅竹马。"),
    ("f", "甜花和甘奈是双胞胎姐妹。"),
    ("m", "咲耶今天穿得特别帅气。"),
    ("f", "圆香对制作人总是很冷淡。"),
    ("m", "我跟田中先生约了下午三点见面。"),
    ("f", "下午我去公园巡逻了一圈。"),
    ("m", "朝日的阳光照进了房间。"),
]

CONDITIONS: dict[str, dict] = {
    "off": {},
    "on": {"_vocabulary": True},
    "on-en": {"_vocabulary": True, "language_hints": ["zh", "ja", "en"]},
    "on-50": {"_vocabulary": True, "_ascii_weight": 50},
    "off-b": {},
    "on-b": {"_vocabulary": True},
}
"""关词表（和现在线上一样）；开词表；开词表并在 language_hints 里加上英文，看英文写法的热词会不会因此生效；
开词表并把纯 ASCII 的词设成超级热词（权重 50，最多 50 个）；off-b、on-b 是 off、on 的重跑，看断句时间的波动。"""


def env(name: str) -> str:
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"{name} 不在 .env 里")


def vocabulary() -> tuple[str, ...]:
    path = REPO / "characters" / "characters.toml"
    return hot_words(
        load_readings(readings_path(path)), load_characters(path).values(), load_world(world_path(path))
    )


def wav_path(n: int) -> Path:
    return AUDIO / f"{n:02d}.wav"


def pcm(n: int) -> bytes:
    with wave.open(str(wav_path(n)), "rb") as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2
        return w.readframes(w.getnframes())


def speech_end(audio: bytes) -> float:
    """录音里最后一段有声音的 10 ms 结束在第几秒。"""
    frame = RATE * 2 // 100
    last = 0
    for i in range(0, len(audio), frame):
        if audioop.rms(audio[i : i + frame], 2) > 300:
            last = i + frame
    return last / (RATE * 2)


# ---- synth ----


async def synth() -> None:
    AUDIO.mkdir(exist_ok=True)
    key = env("FISH_AUDIO_API_KEY")
    async with httpx.AsyncClient(timeout=120) as client:
        for n, (voice, text) in enumerate(SENTENCES, 1):
            if wav_path(n).exists():
                continue
            res = await client.post(
                "https://api.fish.audio/v1/tts",
                headers={"Authorization": f"Bearer {key}", "model": "s2.1-pro-free"},
                json={"text": text, "reference_id": VOICES[voice], "format": "pcm", "sample_rate": RATE},
            )
            res.raise_for_status()
            with wave.open(str(wav_path(n)), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(RATE)
                w.writeframes(res.content)
            print(f"{n:02d} {len(res.content) / (RATE * 2):.1f}s {text}")


# ---- measure ----


def run_task(task_id: str, condition: dict, words: tuple[str, ...]) -> str:
    params = dict(PARAMETERS) | {k: v for k, v in condition.items() if not k.startswith("_")}
    if condition.get("_vocabulary"):
        params["vocabulary"] = {
            w: condition.get("_ascii_weight", 4) if w.isascii() else 4 for w in words
        }
    return json.dumps({
        "header": {"action": "run-task", "task_id": task_id, "streaming": "duplex"},
        "payload": {
            "task_group": "audio", "task": "asr", "function": "recognition",
            "model": MODEL, "parameters": params, "input": {},
        },
    })


async def recognize(n: int, name: str, condition: dict, words: tuple[str, ...], key: str) -> list[dict]:
    """第 n 句在一种条件下的全部事件，t 是距第一包音频发出的秒数。"""
    audio = pcm(n) + b"\0\0" * int(RATE * TAIL_SILENCE)
    task_id = uuid.uuid4().hex
    events: list[dict] = []
    t0: float | None = None
    async with websockets.connect(
        BEIJING, additional_headers={"Authorization": f"bearer {key}"}, max_size=None
    ) as ws:
        await ws.send(run_task(task_id, condition, words))
        started, done = asyncio.Event(), asyncio.Event()

        async def receive() -> None:
            async for raw in ws:
                msg = json.loads(raw)
                event = msg["header"]["event"]
                rec = {"t": None if t0 is None else round(time.monotonic() - t0, 3), "event": event}
                if event == "result-generated":
                    rec["sentence"] = msg["payload"]["output"]["sentence"]
                elif event != "task-started":
                    rec["header"] = msg["header"]
                events.append(rec)
                if event == "task-started":
                    started.set()
                if event in ("task-finished", "task-failed"):
                    done.set()
                    return

        receiver = asyncio.create_task(receive())
        await asyncio.wait_for(started.wait(), 10)
        t0 = time.monotonic()
        for i in range(0, len(audio), CHUNK_BYTES):
            if done.is_set():
                break
            await asyncio.sleep(max(0.0, t0 + i / (RATE * 2) - time.monotonic()))
            await ws.send(audio[i : i + CHUNK_BYTES])
        if not done.is_set():
            await ws.send(json.dumps({
                "header": {"action": "finish-task", "task_id": task_id, "streaming": "duplex"},
                "payload": {"input": {}},
            }))
        await asyncio.wait_for(done.wait(), 30)
        await receiver
    print(f"[{name}] {n:02d} {final_text(events)!r}")
    return events


async def measure(names: list[str]) -> None:
    RESULTS.mkdir(exist_ok=True)
    key, words = env("DASHSCOPE_API_KEY"), vocabulary()
    print(f"词表 {len(words)} 个词")
    names = names or list(CONDITIONS)
    out = {name: (RESULTS / f"{name}.jsonl").open("w", encoding="utf-8") for name in names}
    for n in range(1, len(SENTENCES) + 1):
        results = await asyncio.gather(
            *(recognize(n, name, CONDITIONS[name], words, key) for name in names)
        )
        for name, events in zip(names, results):
            out[name].write(json.dumps({"n": n, "events": events}, ensure_ascii=False) + "\n")
            out[name].flush()
    for f in out.values():
        f.close()


# ---- table ----


def final_text(events: list[dict]) -> str:
    return "".join(
        e["sentence"]["text"] for e in events
        if e["event"] == "result-generated" and e["sentence"].get("sentence_end")
        and not e["sentence"].get("heartbeat")
    )


def finals(events: list[dict]) -> list[float]:
    return [
        e["t"] for e in events
        if e["event"] == "result-generated" and e["sentence"].get("sentence_end")
        and (e["sentence"].get("text") or "").strip()
    ]


def table() -> None:
    runs = {}
    for name in CONDITIONS:
        path = RESULTS / f"{name}.jsonl"
        if path.exists():
            runs[name] = {r["n"]: r["events"] for r in map(json.loads, path.read_text(encoding="utf-8").splitlines())}
    names = list(runs)
    head = ["#", "句子"] + [f"{n} 识别" for n in names] + [f"{n} 断句 s" for n in names]
    print("| " + " | ".join(head) + " |")
    print("|" + "---|" * len(head))
    delays: dict[str, list[float]] = {n: [] for n in names}
    for n, (_, text) in enumerate(SENTENCES, 1):
        end = speech_end(pcm(n))
        cells = [f"{n:02d}", text]
        cells += [final_text(runs[name].get(n, [])) or "（无）" for name in names]
        for name in names:
            ts = finals(runs[name].get(n, []))
            if ts:
                delays[name].append(ts[-1] - end)
                cells.append(f"{ts[-1] - end:.2f}" + (f"（{len(ts)} 句）" if len(ts) > 1 else ""))
            else:
                cells.append("—")
        print("| " + " | ".join(cells) + " |")
    for name, ds in delays.items():
        if ds:
            ds.sort()
            print(f"{name}: 断句 中位数 {ds[len(ds) // 2]:.2f}s，最长 {ds[-1]:.2f}s，最短 {ds[0]:.2f}s")


# ---- soniox ----


async def soniox_one(n: int, context: dict | None) -> str:
    """第 n 句在 Soniox 上识别成什么；服务拒绝配置时抛错。"""
    audio = pcm(n) + bytes(2 * int(RATE * TAIL_SILENCE))
    async with websockets.connect("wss://stt-rt.soniox.com/transcribe-websocket") as ws:
        await ws.send(json.dumps({
            "api_key": env("SONIOX_API_KEY"), "model": "stt-rt-v5", "audio_format": "pcm_s16le",
            "num_channels": 1, "sample_rate": RATE, "enable_endpoint_detection": True,
            "language_hints": ["zh", "ja"], "context": context,
        }))

        async def send() -> None:
            for i in range(0, len(audio), CHUNK_BYTES):
                await ws.send(audio[i : i + CHUNK_BYTES])
                await asyncio.sleep(0.1)
            await ws.send("")

        sender = asyncio.create_task(send())
        text = []
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("error_code"):
                sender.cancel()
                raise RuntimeError(f"Soniox 拒绝了：{msg.get('error_code')} {msg.get('error_message')}")
            text += [t["text"] for t in msg.get("tokens", []) if t.get("is_final")]
            if msg.get("finished"):
                break
        await sender
    return "".join(text).replace("<end>", "")


async def soniox_retrying(n: int, context: dict | None) -> str:
    """连不上（本机网络偶尔握手超时）就再试，最多三次。"""
    for attempt in range(3):
        try:
            return await soniox_one(n, context)
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
    raise AssertionError


async def soniox(start: int = 1) -> None:
    """每句开、关词表各识别一次（并发），打印 Markdown 表；从第 start 句开始。"""
    from pipecat.services.soniox.stt import SonioxContextObject

    context = SonioxContextObject(terms=list(vocabulary())).model_dump()  # 和 Pipecat 发的一样
    print("| # | 句子 | 关词表 | 开词表 |")
    print("|---|---|---|---|")
    for n, (_, text) in enumerate(SENTENCES, 1):
        if n < start:
            continue
        off, on = await asyncio.gather(soniox_retrying(n, None), soniox_retrying(n, context))
        print(f"| {n:02d} | {text} | {off} | {on} |")


if __name__ == "__main__":
    command, *rest = sys.argv[1:] or ["table"]
    if command == "synth":
        asyncio.run(synth())
    elif command == "measure":
        asyncio.run(measure(rest))
    elif command == "soniox":
        asyncio.run(soniox(int(rest[0]) if rest else 1))
    else:
        table()
