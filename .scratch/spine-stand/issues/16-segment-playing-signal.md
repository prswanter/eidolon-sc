# 16: 每段声音开始播放时，前端会收到标记

**What to build:** 通话中，角色的每段话一开始播放，前端就收到一条 `segment-playing {reply, segment}` 消息，时机跟着真实播放走。为此 Fish 改成每段一个会话，并预先开好下一个连接，段落之间不能多出听得出来的停顿。段落边界主动 flush，顺带修掉「每段最后一句日语要等下一段的中文字幕生成后才送去合成」。前端先把这条消息解析成事件，这一张不影响画面。规则见 `../spec.md`「Fish 分段合成」一节；依据和实测见「调研：pipecat 怎么知道每段语音什么时候开始播放」和「拍板：每段语音开始播放的信号怎么做」（`10-segment-playback-timing.md`、`11-segment-start-signal.md`）。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **回复编号**：`CallTurns` 给每条回复编号，一次通话里递增。发给 TTS 的日语要带上回复编号和段号，现在的 `Voice` 命令要能表达这一点。
- [x] **每段一个 Fish 会话**：
  - 当前这段在合成时，就把下一段要用的连接打开等着。
  - 当前段结束时，发 `stop` 并等到 `finish`，然后立即在备用连接上开始下一段。
  - 一条回复的最后一段结束后，不再多开备用连接。开着闲置的连接，下一条回复开始时可以直接用；Fish 空等约 7 秒不会断开。连接要不要设一个空闲超时，由你定，在 Comments 里说明。
- [x] **段落开始的标记**：在第 N 段第一块音频之前，往音频队列里插一条 `OutputTransportMessageFrame`，内容是 RTVI server message `{type: "segment-playing", reply, segment}`，由输出传输层按播放节奏发出。
- [x] **段落边界 flush**：一段的日语在段落完整时（`SegmentComplete`）立即 flush 给 Fish，不再等下一段的文字。
- [x] **打断**：行为和现在的 `InterruptsFirst` 一致，立即放行打断、在后台重建连接；备用连接一起作废。已经排进队列、还没发出的 `segment-playing` 随音频一起清掉。
- [x] **只看文字**：不合成，也不发 `segment-playing`。
- [x] **前端**：把 `segment-playing` 解析成一种新的 `CallEvent`，`LiveConversation` 记下「现在播到哪条回复的第几段」，暂时不影响画面。
- [x] **测试**：
  - 后端，照语音打断测试的做法，用一个假的 Fish WebSocket：每段一个会话；下一个连接预先打开；段落完整时 flush；`segment-playing` 正好排在这段第一块音频之前，回复编号和段号都正确；打断时立即停止，备用连接作废。
  - 后端帧级测试（`CallUnderTest`）：多段回复时，每段的日语带着正确的回复编号和段号送给 TTS。
  - 前端：`segment-playing` 事件正确更新快照。
- [x] **真实通话验证**：打一通电话，听三段以上的回复，确认段落之间没有多出停顿；在浏览器开发者工具里看 `segment-playing` 的到达时间和听到声音的时间是否对得上。在 Comments 里记下结果。
- [x] `uv run pytest`、`uv run pyright`、`npm test`、`npm run typecheck` 全部通过。

## Comments

### 2026-10-01 实现记录（agent）

**做了什么**

- **回复编号怎么流动**：编号由 `TurnTaking` 在发出 `Reply` 命令时给出（`Reply(text, voiced, number)`，一次通话里从 1 开始递增，补充后重新回复也算新的一条），`CallTurns._start_reply` 把 `number` 传给 `_reply_to`。`reply_delta(lang, text, segment)` 对日语返回 `Voice(text, reply, segment)`；`segment_complete(segment)` 在这条回复在出声、这段送过日语时返回新命令 `FlushVoice(reply, segment)`。`CallTurns` 把它们分别变成 `SegmentTextFrame(text, reply, segment)`（`TextFrame` 的子类）和 `SegmentCompleteFrame(reply, segment)` 推给 TTS。「只看文字」和被打断后的回复不出 `Voice`/`FlushVoice`，所以既不合成也没有 `segment-playing`。ticket 17 发 `emotion` 时，回复编号在 `_reply_to` 的 `number` 参数里，段号在 `SegmentComplete.segment`。
- **Fish 分段合成**（`backend/src/eidolon/call.py` 的 `FishTTS`）：每段一个 Fish 会话。某段第一句要送出时，先结束上一段（`stop` 后等 `finish`，最多 `FINISH_TIMEOUT` = 10 秒，超时就丢掉剩下的），再在备用连接上开会话，同时开下一个备用连接。收到 `SegmentCompleteFrame` 时先把句子聚合器里压着的最后一句送出去，再 `stop` 并等 `finish`，这样修掉了「每段最后一句要等下一段文字」。`segment-playing` 用 `OutputTransportMessageFrame`（RTVI server message，`{type: "segment-playing", reply, segment}`）排进这条回复的音频队列，位置在这段第一块音频之前；只有这段真的开上了会话才排，连不上的段不发。每个会话的音频只进开会话时的那个音频上下文，旧会话晚到的音频不会混进新回复。
- **打断**：仍然走 `InterruptsFirst`（立即放行、后台重连）。`_holds_speech` 在还有会话时也算需要重连；重连时当前会话和备用连接一起关掉，再开一个新的备用连接。队列里还没发的 `segment-playing` 由 pipecat 随音频一起清掉。
- **空闲超时：不设**。理由：原来的实现整通电话都开着一个 Fish 连接，空着也没问题；实测空等 7 秒也没断。再加超时只会让长时间停顿后的第一句多等一次建连。websockets 自带的 keepalive ping（20 秒）会发现断掉的连接，回复开始（`LLMFullResponseStartFrame`）时如果备用连接已经关了就重开一个，这时 LLM 还在生成第一句，建连时间基本被盖住。
- **前端**：`api.ts` 新增 `SegmentPlaying = {type: "segment-playing"; reply; segment}` 并加进 `CallEvent`；`LiveConversation` 快照新增 `playing: {reply, segment} | null`，收到这条消息就更新，拨号、挂断、掉线时清空。画面没有变化。
- **测试**：`tests/test_fish_segments.py` 用假的 Fish WebSocket（msgpack 协议，按句合成、`stop` 后 `finish` 再关）覆盖：每段一个会话、下一段的连接在上一段 finish 前就开好、段落完整时立即 flush、`segment-playing` 正好在这段第一块音频之前且编号正确、回复结束后留一个空闲连接给下一条回复、空闲连接被 Fish 关掉后在回复开始时换一个、连不上时不发标记、打断时立即停止且备用连接作废、挂断时全部关闭。`test_call_turns.py` 用 `CallUnderTest` 验证多段回复每段日语带正确的回复编号和段号、补充后的回复用新编号；`test_turn_taking.py` 覆盖编号和 `FlushVoice` 规则；前端 `liveConversation.test.ts` 覆盖快照。

**检查**：`uv run pytest` 779 passed，`uv run pyright` 0 errors，`npm test` 239 passed，`npm run typecheck` 通过。

**已知的小问题**

- 「只看文字」时回复开始也会检查备用连接，如果它已经被关掉会重开一个（不合成，只是多一个空闲连接）。
- 打断时如果角色没在说话、也没有会话，按 `InterruptsFirst` 原来的规则不重连，空闲的备用连接会留着继续用（它没送过任何文字，所以没关系）。
- `test_voice_interruption.py` 按真实时间计时，本地和其他测试一起跑时偶尔失败过一次，单独重跑都通过，这次没有改它的行为。

**留给人工验证**（需要真人听，agent 做不了）

- 打一通电话，听三段以上的回复，确认段落之间没有多出停顿，每段最后一句也不再拖延。
- 在浏览器开发者工具里看 `segment-playing` 的到达时间，和听到这段声音的时间比一比，预计早 50–150ms。
- 在她说话时打断，确认声音立刻停下，接下来的回复正常出声。

### 2026-10-01 真实通话验收（用户）

用户在本地打了真实电话，按上面「留给人工验证」的三项验收，结果正常：多段回复之间没有多出停顿，`segment-playing` 的到达时间和听到声音对得上，打断时声音立刻停下、接下来的回复正常出声。
