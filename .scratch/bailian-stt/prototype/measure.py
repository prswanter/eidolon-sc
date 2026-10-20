"""一次性测量脚本（ticket 01）：把录音按实时速度推给百炼实时识别，记下每条事件到达的时刻。

用法（在 backend/ 下，借用后端的 websockets）：

    uv run python ../.scratch/bailian-stt/prototype/measure.py <场景名> [<场景名> ...]
    uv run python ../.scratch/bailian-stt/prototype/measure.py --list

每个场景的事件写进 results/<场景名>.jsonl，一行一条：
`t` 是事件到达时距第一包音频发出的秒数，因为按实时速度发，它就是「录音时刻」。
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
import uuid
import wave
from pathlib import Path

import websockets

HERE = Path(__file__).resolve().parent
AUDIO = HERE / "audio"
RESULTS = HERE / "results"
ROOT = HERE.parents[2]

BEIJING = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
MODEL = "qwen-audio-3.1-asr-flash-streaming"
CHUNK_MS = 100
RATE = 16000
CHUNK_BYTES = RATE * 2 * CHUNK_MS // 1000


def api_key() -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("DASHSCOPE_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("DASHSCOPE_API_KEY 不在 .env 里")


def pcm(name: str) -> bytes:
    with wave.open(str(AUDIO / name), "rb") as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2
        return w.readframes(w.getnframes())


def silence(seconds: float) -> bytes:
    return b"\x00\x00" * int(RATE * seconds)


# 场景名 -> (音频, run-task 的额外参数, 说明)
# 音频后面都补一段数字静音，让最后一句有机会出终稿。
NEAR = {"vad_model": "near_meeting_16k"}
FAR = {"vad_model": "far_field_meeting_16k"}
ZHJA = {"language_hints": ["zh", "ja"]}


def scenarios() -> dict[str, tuple[bytes, dict, str]]:
    return {
        # 问题 1、2、4、7：出终稿多快、开口多快、中日混说、中间结果形态
        "01-near-zhja": (pcm("01.wav") + silence(8), NEAR | ZHJA, "01 四句话，near，zh+ja"),
        "01-far-zhja": (pcm("01.wav") + silence(8), FAR | ZHJA, "01 四句话，far，zh+ja"),
        "01-near-nohints": (pcm("01.wav") + silence(8), NEAR, "01 四句话，near，不填 language_hints"),
        "01-near-ja": (pcm("01.wav") + silence(8), NEAR | {"language_hints": ["ja"]}, "01 四句话，near，只填 ja"),
        "02-near-zhja": (pcm("02.wav") + silence(8), NEAR | ZHJA, "02 两句停 1 秒，near"),
        "02-far-zhja": (pcm("02.wav") + silence(8), FAR | ZHJA, "02 两句停 1 秒，far"),
        # spec 允许的另外两个模型，用同一组参数（vad_model 文档说只有 3.1 支持）
        "01-v30-near-zhja": (pcm("01.wav") + silence(8), NEAR | ZHJA | {"_model": "qwen-audio-3.0-asr-flash-streaming"}, "01，3.0，near，zh+ja"),
        "01-fun-near-zhja": (pcm("01.wav") + silence(8), NEAR | ZHJA | {"_model": "fun-asr-realtime"}, "01，fun-asr-realtime，near，zh+ja"),
        "03-v30-near-zhja": (pcm("03.wav") + silence(8), NEAR | ZHJA | {"_model": "qwen-audio-3.0-asr-flash-streaming"}, "03，3.0，near，zh+ja"),
        "03-fun-near-zhja": (pcm("03.wav") + silence(8), NEAR | ZHJA | {"_model": "fun-asr-realtime"}, "03，fun-asr-realtime，near，zh+ja"),
        # 问题 1：max_sentence_silence 对 3.1 是否生效
        "02-near-mss500": (pcm("02.wav") + silence(8), NEAR | ZHJA | {"max_sentence_silence": 500}, "02，near，max_sentence_silence=500"),
        "02-near-mss3000": (pcm("02.wav") + silence(8), NEAR | ZHJA | {"max_sentence_silence": 3000}, "02，near，max_sentence_silence=3000"),
        "02-far-mss500": (pcm("02.wav") + silence(8), FAR | ZHJA | {"max_sentence_silence": 500}, "02，far，max_sentence_silence=500"),
        # 问题 3：没听到词时出不出稿
        "03-near-zhja": (pcm("03.wav") + silence(8), NEAR | ZHJA, "03 咳嗽清嗓嗯，near"),
        "03-far-zhja": (pcm("03.wav") + silence(8), FAR | ZHJA, "03 咳嗽清嗓嗯，far"),
        # 问题 5：静音保活。先一句话再长时间静音，看会不会被断开
        "04-silence-60": (pcm("02.wav") + silence(60), NEAR | ZHJA, "说两句后纯零 60 秒，不开 heartbeat"),
        "05-noise-60": (pcm("02.wav") + (pcm("05-room-noise.wav") * 2)[: RATE * 2 * 60], NEAR | ZHJA, "说两句后底噪 60 秒，不开 heartbeat"),
        "04-silence-60-hb": (pcm("02.wav") + silence(60), NEAR | ZHJA | {"heartbeat": True}, "说两句后纯零 60 秒，开 heartbeat"),
        "05-noise-60-hb": (pcm("02.wav") + (pcm("05-room-noise.wav") * 2)[: RATE * 2 * 60], NEAR | ZHJA | {"heartbeat": True}, "说两句后底噪 60 秒，开 heartbeat"),
        "04-silence-300": (pcm("02.wav") + silence(300), NEAR | ZHJA, "说两句后纯零 5 分钟，不开 heartbeat"),
        "04-silence-300-hb": (pcm("02.wav") + silence(300), NEAR | ZHJA | {"heartbeat": True}, "说两句后纯零 5 分钟，开 heartbeat"),
        # 问题 5：完全不发数据多久被断开
        "nodata": (b"", NEAR | ZHJA, "task-started 后一包都不发，等服务端断开"),
        # 问题 6：只握手不发音频
        "handshake": (b"", NEAR | ZHJA | {"_finish_now": True}, "run-task → task-started → finish-task，不发音频"),
    }


def run_task(task_id: str, extra: dict) -> str:
    params = {"format": "pcm", "sample_rate": RATE} | {k: v for k, v in extra.items() if not k.startswith("_")}
    return json.dumps({
        "header": {"action": "run-task", "task_id": task_id, "streaming": "duplex"},
        "payload": {
            "task_group": "audio", "task": "asr", "function": "recognition",
            "model": extra.get("_model", MODEL), "parameters": params, "input": {},
        },
    })


def finish_task(task_id: str) -> str:
    return json.dumps({"header": {"action": "finish-task", "task_id": task_id, "streaming": "duplex"}, "payload": {"input": {}}})


async def measure(name: str, audio: bytes, extra: dict, note: str) -> None:
    RESULTS.mkdir(exist_ok=True)
    out = (RESULTS / f"{name}.jsonl").open("w", encoding="utf-8")
    task_id = uuid.uuid4().hex
    t0: float | None = None
    connect_at = time.monotonic()

    def log(kind: str, **fields) -> None:
        now = time.monotonic()
        rec = {"t": None if t0 is None else round(now - t0, 3), "since_connect": round(now - connect_at, 3), "kind": kind} | fields
        out.write(json.dumps(rec, ensure_ascii=False) + "\n")
        out.flush()
        brief = fields.get("sentence") or fields.get("header") or fields
        print(f"[{name}] t={rec['t']} {kind} {json.dumps(brief, ensure_ascii=False)[:200]}")

    log("note", note=note, params=extra)
    async with websockets.connect(BEIJING, additional_headers={"Authorization": f"bearer {api_key()}"}, max_size=None) as ws:
        await ws.send(run_task(task_id, extra))
        started = asyncio.Event()
        done = asyncio.Event()

        async def receive() -> None:
            try:
                async for raw in ws:
                    msg = json.loads(raw)
                    event = msg["header"]["event"]
                    if event == "result-generated":
                        log(event, sentence=msg["payload"]["output"]["sentence"], usage=msg["payload"].get("usage"))
                    else:
                        log(event, header=msg["header"], payload=msg.get("payload"))
                    if event == "task-started":
                        started.set()
                    if event in ("task-finished", "task-failed"):
                        done.set()
                        return
            except websockets.ConnectionClosed as e:
                log("closed", code=e.code, reason=e.reason)
            done.set()

        receiver = asyncio.create_task(receive())
        await asyncio.wait_for(started.wait(), 10)
        if extra.get("_finish_now"):
            await ws.send(finish_task(task_id))
        elif not audio:
            t0 = time.monotonic()
            await asyncio.wait_for(done.wait(), 120)
        else:
            t0 = time.monotonic()
            for i in range(0, len(audio), CHUNK_BYTES):
                if done.is_set():
                    break
                await asyncio.sleep(max(0.0, t0 + i / (RATE * 2) - time.monotonic()))
                try:
                    await ws.send(audio[i : i + CHUNK_BYTES])
                except websockets.ConnectionClosed:
                    break
            log("audio-done", seconds=len(audio) / (RATE * 2))
            if not done.is_set():
                await ws.send(finish_task(task_id))
        await asyncio.wait_for(done.wait(), 30)
        await receiver
    out.close()


async def main(names: list[str]) -> None:
    table = scenarios()
    if not names or names == ["--list"]:
        for k, (_, _, note) in table.items():
            print(f"{k:20} {note}")
        return
    for name in names:
        audio, extra, note = table[name]
        await measure(name, audio, extra, note)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
