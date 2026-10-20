# 01: 语气提示的通路

**What to build:** 回复里的语气提示送得到合成、存得进记录，但用户看不到，写错的也不会被念出来。背景见 `../spec.md`，术语见 `CONTEXT.md` 的「语气提示」，理由见 ADR-0007。这张 ticket 不改回复格式说明，模型还不会主动写语气提示；用 fake 模型输出带提示的回复来测。

**Blocked by:** None (can start immediately)

**Status:** resolved

## 规则

按用途分成三种文本，每个用途只取它该看的那种：

| 用途 | 看到的文本 |
| --- | --- |
| 存进对话记录（`segments`、`ja`），以及喂回扮演角色模型的对话历史（`engine._prompt` 里的 `format_reply`） | 模型写的原样，一个字不动（包括写错的提示，ADR-0007） |
| 送去 TTS（`turn_taking.reply_delta` → `Voice`） | 保留规范的语气提示，删掉其他像提示的写法 |
| 给用户看：流式的 `SegmentDelta`（文字对话 SSE、通话 RTVI 消息）、`GET /api/conversations/{id}/messages`、对话列表的 `last_message`；以及内部用途：记忆提炼（`memory.py` 里拼上文的地方）、判断要不要回忆剧情（`retrieval.py` 的 `judge`） | 所有提示都删掉 |

- 流式时，语气提示可能被切在两个 chunk 之间（`[shy` + `ly] えへへ`）。还没闭合的 `[`、`(`、`（`、`【` 先压住，闭合后再按规则放行或删掉；压住的内容一直等不到闭合、流就结束了，按原文放出（它不是提示）。浏览器不能看到提示闪一下再消失。
- 删掉提示后多出来的首尾空白要收掉，不要让字幕以空格开头。
- 一段的日语删完提示后变成空的（整段只有提示）：给用户看的这段日语就是空的，TTS 什么也不送；这段照常算一段。
- 中文字幕里出现的任何提示写法也一并删掉（给用户看、给记忆提炼的都删）。
- 前端不改：后端给出去的已经是干净的文本。
- 「补充」「打断」的判定（`turn_taking.py` 里「完整的一段」「开口」）不受影响：它们看的是段有没有完整、声音有没有开始播放，不看文本内容。

## 实现提示

- 规范与删除的判断做成一个纯函数的小 module（例如 `delivery_cues.py`），给出「给 TTS 的」「给人看的」两种文本，单测覆盖各种写法。流式的压住与放行可以放在 `ReplyParser` 里，也可以在它下游包一层，自己权衡；`ReplyParser.segments` 要继续保存原样文本，因为 `store.add_turn` 存的就是它。
- `SegmentDelta` 目前只有一份 `text`，同时流向浏览器和 TTS（见 `call.py` 的 `_carry_out(self._turns.reply_delta(...))` 与 `_send(asdict(event))`）。需要让 TTS 拿到带提示的版本、浏览器拿到干净的版本；怎么分（给事件加字段、或者分成两种事件）自己定，但不要把带提示的文本发给浏览器。
- 对话记录的读接口：`store.Message` 原样保存，API 输出时再清理，或者在 store 读出时提供清理后的视图，二选一，保证上表每个用途都走到正确的一种。

## 验收

- [x] 单测：规范提示保留给 TTS、从展示中删除；`(happy)`、`（小声で）`、`【嬉しそうに】`、`[嬉しそうに]`、`（笑）` 在两边都删除；跨 chunk 切开的提示不会在浏览器事件里露出片段；未闭合的括号在流结束时按原文放出。
- [x] 集成测试（用 `backend/tests/fakes.py` 的 fake 模型输出带提示的回复）：存库的 `segments` 是原样；messages API、对话列表、SSE 事件里没有提示；通话里送给 TTS 的文本带规范提示、不带写错的提示；下一回合喂给模型的历史里提示还在；记忆提炼和回忆判断收到的文本没有提示。
- [x] `uv run pytest`、lint、类型检查通过。

## Comments

- 规则在 `backend/src/eidolon/delivery_cues.py`：`CueFilter` 流式地把一行拆成「给人看的」和「给 TTS 的」，`without_cues` 给已存的文本用。`ReplyParser` 每个 `<ja>`/`<zh>` 标签配一个 `CueFilter`，标签闭合时收尾；`segments` 仍是原样。
- 给 TTS 的文本走新事件 `SpeechDelta`（和 `SegmentComplete` 一样只留在服务端，SSE 和通话都不发给浏览器）。它只跟着非空的 `SegmentDelta` 一起出现，所以只看文字模式下「开口」的判定不变；`call.py` 里日语改由它驱动 `reply_delta`，中文仍由 `SegmentDelta` 驱动。
- 已存的回复用 `Message.without_cues()` 清理，用在：messages API、对话列表、`TurnDone`（浏览器收到的 `done`）、记忆提炼、Jev 判断。喂回模型的历史（`format_reply(message.segments)`）不清理。
- 超出 ticket 的一处取舍：开括号 40 个字符内没闭合就当作台词放出，免得一个真正的括号把整句 TTS 卡到标签结束。
- 给 TTS 的是 `[shyly]えへへ`（提示后的空白被收掉了），Fish 应该不在意；02 试听时留意一下。
- 验证：新增 `tests/test_delivery_cues.py` 11 个；全量 587 过，唯一失败 `test_characters.py::test_missing_character_sheet_is_reported_with_its_path` 在改动前就失败；pyright 0 错误；ruff 的 8 个问题都是改动前就有的。
