# 调研：pipecat 怎么知道每段语音什么时候开始播放

对应 ticket：`.scratch/spine-stand/issues/10-segment-playback-timing.md`。调研日期 2026-09-30。

依据的版本（都读安装好的源码，不看网上文档）：

- 后端 `pipecat-ai` **1.11.0**（`backend/uv.lock` 锁定；源码在 `backend/.venv/Lib/site-packages/pipecat/`，下文路径都相对这里）。
- 前端 `@pipecat-ai/client-js` **1.13.1**、`@pipecat-ai/small-webrtc-transport` **1.10.8**（`frontend/package-lock.json`）。
- Fish Audio 实时接口：pipecat 连的是 `wss://api.fish.audio/v1/tts/live`，协议以官方 AsyncAPI 为准：<https://docs.fish.audio/api-reference/endpoint/websocket/tts-live>。

本文只读了源码和文档，**没有用真实 Fish/通话实测**；下面的毫秒数是从代码推出来的量级，秒级的数字引用自 ticket 02 的实测（Fish 首个音频 p50 0.59s，一段合成完约 3.5s）。

---

## 结论先说

1. **现成的事件都不能标出「第 N 段开始播放」**。`bot-tts-started` 一条回复只发一次，而且在合成开始时发；`bot-started-speaking` 一条回复通常也只发一次；`bot-tts-text` 按句发，但发出的时刻是「这句文本**送进 Fish** 之前已经收到的音频播完了」，不是「这句开始播」，段首那一句往往**早 1～4 秒**（见 §2、§3）。纯前端计数也不行（§5）。
2. **能做到准确的机制**：在 TTS 的音频流里、第 N 段第一块音频之前，插一个**不是系统帧的标记帧**（最简单就是 `OutputTransportMessageFrame`，内容是 RTVI `server-message`，带段号）。输出传输层把它和音频放在同一个队列里，按实际写进 WebRTC 音轨的节奏往外送，所以它会在「上一段最后一块音频交给编码器」时从数据通道发出（§4.1）。服务器端误差 ≤ 40ms；到了浏览器，消息比声音**早约 50～150ms**（接收端抖动缓冲 + 音频输出延迟；蓝牙耳机可能 200ms 以上），立绘 0.3s 的 mix 可以盖住。
3. **难点在 Fish**：标记帧要插在「上一段音频全部收到之后」，但 Fish v1 WebSocket 只有 `audio` 和 `finish` 两种服务端事件，`flush` 没有回执，音频也不带段号或时间戳（§1.3）。唯一确定的边界是 `stop` → `finish`（会话结束）。所以要**每段一个 Fish 会话**（§4.2）：
   - 简单版：段边界处对当前 socket 发 `stop`，等 `finish`，插标记，重连，再送下一段。准确，但每个段边界可能多出「重连 + Fish 首音 0.59s − 上一段剩余播放时长」的停顿，要实测。
   - 完整版：每段开一个 Fish 会话、各自一个 pipecat 音频上下文（audio context），下一段提前并行合成，pipecat 按顺序播放。不会多出停顿，但要重写 Fish 服务的收发部分，还要确认 Fish 账号允许同时开两个会话。
4. 顺带发现：pipecat 默认按句聚合送 TTS，句末标点要等**下一个非空白字符**才确认（§1.2）。所以现在**每段最后一句要等下一段日语的第一个字到了才送 Fish**（中间隔着这段中文字幕的生成）。在段边界主动 flush 一次聚合器，这个等待就没了，上面两种方案都要这样做。

---

## 1. 现在的数据流（后端）

管线（`backend/src/eidolon/call.py` 的 `_LiveCall.__init__`）：

```
transport.input() → Soniox STT → UserTurnProcessor → CallTurns → FishTTS → transport.output()
```

`PipelineWorker` 默认 `enable_rtvi=True`，会在最前面自动加 `RTVIProcessor`，并挂一个 `RTVIObserver`（`pipeline/worker.py:517-520`）。

- `CallTurns._reply_to` 收到引擎的 `SpeechDelta`（带 `segment` 段号的日语片段，带语气提示）时，经 `TurnTaking.reply_delta` 得到 `Voice(text)`，然后 `push_frame(TextFrame(text))` 送给 TTS。**段号到这里就丢了**，`Voice` 里没有段号（`turn_taking.py` 的 `Voice`、`call.py:724`）。
- 字幕 `delta`（`SegmentDelta`，带 `segment`）用 `RTVIServerMessageFrame` 推出去。这是 `SystemFrame`（`processors/frameworks/rtvi/frames.py:38`），`RTVIObserver` 第一次看到它就转成 `OutputTransportMessageUrgentFrame` 立刻发（`observer.py:578-580`，`processor.py:172-177`），所以字幕比声音早。

### 1.1 一条回复只有一个 TTS 上下文

- `LLMFullResponseStartFrame` 到达时，TTS 建一个 turn context id，整条回复的所有句子共用（`services/tts_service.py:779-789`；`reuse_context_id_within_turn=True` 是默认值，`create_context_id` 见 `:528-536`）。
- `TTSStartedFrame` 只在这个上下文**第一次**创建时放进去（`:1278-1284`）。所以 `TTSStartedFrame` 一条回复只有一个，不能用来分段。

### 1.2 按句聚合，句末要等下一个字

- `TTSService` 默认 `TextAggregationMode.SENTENCE`（`:298-299`），用 `SimpleTextAggregator`。
- 看到句末标点（包括「。」「！」，`utils/string.py:82-84`）后，要等**下一个非空白字符**才确认断句（`utils/text/simple_text_aggregator.py:98-119`）。
- 引擎在一段日语之后先生成这段的中文字幕（不送 TTS），然后才是下一段的日语。所以**每段最后一句要等下一段的第一个日语字**（或整条回复结束时的 `LLMFullResponseEndFrame` flush，`:790-804`）才送 Fish。这一条是读源码得出的，没有实测停顿有多长。

### 1.3 Fish 服务：发文本和收音频是两条路

`services/fish/tts.py`：

- `run_tts` 把一句文本和一个 `flush` 发出去，**马上返回**（`yield None`），不等音频（`:388-424` 附近）。
- 另有一个接收任务 `_receive_messages`：每收到一块 `audio` 就 `append_to_audio_context(get_active_audio_context_id(), TTSAudioRawFrame)`。`finish` 只记日志。
- `push_text_frames` 用默认值 True（Fish 没有逐词时间戳），所以基类在 `run_tts` 返回后，马上把这句的 `TTSTextFrame` 放进**同一个**音频上下文队列（`tts_service.py:1325-1344`；注释写着 “we send the original text after the TTS generation has completed”，但对 WebSocket 服务来说，这时只是**发送**完了，音频还没回来）。
- Fish v1 协议的服务端事件只有 `audio`（二进制音频）和 `finish`（`reason` 为 `stop` 或 `error`）。客户端 `stop` 之后，服务端合成完剩下的文本，发 `finish`，然后关连接。`flush` 没有回执，音频不带段号或时间戳（官方 AsyncAPI，上面的链接）。

  另外：docs.fishaudio.org 上有 `wss://realtime.fishaudio.org/v2|v3/tts/live`，`audio` 带 `segment_id`，还有 `segment_completed` 事件，正好能解决边界问题。但那是另一个域名、另一套协议，pipecat 1.11.0 不支持，和 api.fish.audio 的关系（同一账号和 key 能不能用）**没有核实**。只作为以后的选项。

结果：在一条回复的上下文队列里，`TTSTextFrame(第 k 句)` 排在「发出第 k 句时已经收到的音频」后面，**排在第 k−1 句（甚至更早的句子）还没到的音频前面**。

### 1.4 TTS 把上下文队列按顺序推下去

`_audio_context_task_handler` / `_handle_audio_context`（`tts_service.py:1627-1784`）按入队顺序把上下文里的每一帧 push 下游，**任意 Frame 都行**（`append_to_audio_context` 接受任意 `Frame`，`:1509-1540`）。

不在上下文里、从上游来的普通下游帧，会进 `_serialization_queue`（`:904-911`），要等**整个当前上下文**（整条回复）排空才出去。所以在 `CallTurns` 里直接往下推一个普通帧当标记是不行的，它会等到整条回复说完。

## 2. 输出传输层：播放的时刻从哪来

`transports/base_output.py`：

- 音频帧被切成 40ms 的块（`audio_out_10ms_chunks=4`，`transports/base_transport.py:72`）放进 `_audio_queue`（`:601-627`）。**不带 pts 的非系统帧**（`TTSTextFrame`、`TTSStartedFrame`、`OutputTransportMessageFrame`…）走 `handle_sync_frame`，放进**同一个** `_audio_queue`（`:396-401`、`:657-663`）。
- `_audio_task_handler` 依次取出：音频块调用 `write_audio_frame`，其他帧先处理（`OutputTransportMessageFrame` 在这里 `send_message`，`:841-842`），再 push 下游（`:921-948`）。
- SmallWebRTC 的 `write_audio_frame` 会 `await` `RawAudioTrack.add_audio_bytes` 返回的 future。这个 future 在这块的**最后 10ms 被 aiortc 的 `recv()` 取走**时才完成，而 `recv()` 按实时节奏取（`transports/smallwebrtc/transport.py:101-162`、`:446-458`）。所以 `_audio_queue` 是按**真实播放节奏**往前走的：队列里的一个非音频帧，恰好在它前面那块音频交给编码器时被处理。
- `BotStartedSpeakingFrame`：第一块 TTS 音频写出前发（`:818-824` → `:705-726`），然后一直算在说话，直到收到 `TTSStoppedFrame`（上下文结束，也就是整条回复的音频收完、空闲 `stop_frame_timeout_s=3.0` 秒后，`tts_service.py:159`、`:1769-1780`），或者音频队列空了 `BOT_VAD_STOP_FALLBACK_SECS = 3` 秒（`base_output.py:57`、`:861-871`）。**一条回复里段与段之间一般不会停 3 秒，所以 `bot-started-speaking` 通常每条回复只有一次。**
- 被打断时 `handle_interruptions` 会清空 `_audio_queue`（`:572-589`），排在里面还没播的标记帧也一起丢掉。这正是需要的：没播到的段不会发「开始播放」。

## 3. 前端能收到的现成事件，各在什么时候发

`RTVIObserver.on_push_frame`（`processors/frameworks/rtvi/observer.py:423-619`）：

| RTVI 事件 | 来源帧 | observer 在哪一跳处理 | 实际时刻 | 能不能用来分段 |
|---|---|---|---|---|
| `bot-tts-started` | `TTSStartedFrame` | 第一次 push，也就是 TTS 推出来时（`:498-499`） | 合成开始，每条回复一次 | 不能 |
| `bot-started-speaking` / `bot-stopped-speaking` | `BotStarted/StoppedSpeakingFrame`（系统帧，输出层发） | `:465-469`、`:654-667` | 第一块音频写出前；停止见 §2 | 只能标出第 0 段 |
| `bot-tts-text` | `TTSTextFrame` | **只在来源是 `BaseOutputTransport` 时**处理（`:509-517`），也就是它从输出层的 `_audio_queue` 出来以后；如果 bot 还没开始说话，要先排队等 `BotStartedSpeaking`（`:669-676`） | 发出这句文本前已经收到的音频播完的时刻（§1.3） | 不能，段首句通常偏早 |
| `server-message` | `RTVIServerMessageFrame`（系统帧） | 第一次 push（`:578-580`） | 立即 | 字幕用的就是它 |

**`TTSTextFrame` / `bot-tts-text` 为什么偏早**：以第 N 段第一句 `s` 为例。按 §1.2，第 N−1 段最后一句要等 `s` 的第一个字到了才送 Fish，紧接着 `s` 句完整后也送出，两次发送只隔几十到几百毫秒。Fish 首个音频要 p50 0.59s（ticket 02 实测），所以 `TTSTextFrame(s)` 几乎一定排在「第 N−1 段最后一句的全部音频」前面。结果 `bot-tts-text(s)` 在第 N−1 段最后一句**开始**播时就发了，早了**整整一句的时长（约 1～4 秒）**。即使在段边界先 flush，只要 Fish 合成速度接近实时（一段合成完约 3.5s，和一段的播放时长同一量级），误差仍然可能到秒级。

client-js 这边：small-webrtc-transport 把数据通道消息里 `label === "rtvi-ai"` 的交给 client（`small-webrtc-transport/dist/index.js` `handleMessage`），`server-message` 走 `onServerMessage`（项目已用于 `delta` 等事件，`frontend/src/lib/call.ts`），`bot-tts-text` 走 `onBotTtsText`（`client-js/dist/index.js:1778-1780`、`:2418`）。前端从 client-js 拿不到比上表更准的时间点。

## 4. 可行方案

### 4.1 标记怎么送到前端（各方案共用，准确）

在 TTS 的音频上下文里、第 N 段第一块音频之前，`append_to_audio_context(ctx, 标记帧)`。标记帧用：

```python
OutputTransportMessageFrame(
    message=RTVI.ServerMessage(data={"type": "segment-playing", "reply": r, "segment": n}).model_dump()
)
```

- 它是 `DataFrame`，不是系统帧（`frames/frames.py:891`），所以 TTS 按上下文顺序推出（§1.4），输出层放进 `_audio_queue`（§2），轮到它时 `send_message`。消息格式和现在的 `delta` 一样，前端 `onServerMessage` 直接收到，不用改 client-js。
- 服务器端误差：它在「前面那块 40ms 音频的最后 10ms 被取走」时发出。第 N−1 段最后不足 40ms 的零头会和第 N 段开头拼成同一块（`handle_audio_frame` 的缓冲），所以最多**早 40ms**。
- 到浏览器：数据通道（SCTP）和 RTP 走同一条 ICE 路径，网络延迟相同。但声音还要经过 Opus 20ms 帧、接收端抖动缓冲（一般 20～100ms）、音频输出设备（有线 10～50ms，蓝牙 150～300ms）。所以消息**比听到的声音早约 50～150ms**（蓝牙更多）。这是按 WebRTC 常见值估的，没有实测。要补偿的话，前端可以用 `RTCRtpReceiver.getStats()` 的 `inbound-rtp` `jitterBufferDelay / jitterBufferEmittedCount` 估计延迟后再切换；考虑到 mix 0.3s，可以先不补偿。
- 加上回复序号 `reply`：上一条回复的标记可能在下一条回复的字幕已经开始到达后才发（上一条还在播）。段号每条回复从 0 开始，没有序号就会对错段。

### 4.2 标记放在哪：要知道 Fish 音频里段与段的边界

**A. 每段一个 Fish 会话，串行（改动较小）**

在 `FishTTS` 上再加一个 mixin（和 `InterruptsFirst` 同样的写法）：

1. `CallTurns` 在第 N 段第一次 `Voice` 之前推一个自定义的 `SegmentStartFrame(reply, segment)`（普通 `DataFrame`）。段号可以放在 `Voice` 命令里，由 `TurnTaking.reply_delta` 带出来。「只看文字」时 `TurnTaking` 不发 `Voice`，也就没有标记，这和 ticket 07「只看文字时情绪随字幕切换」一致。
2. mixin 的 `process_frame` 拦下 `SegmentStartFrame`：
   - flush 句子聚合器，把上一段剩下的文本送出（照抄 `LLMFullResponseEndFrame` 分支的写法，`tts_service.py:790-804`）；
   - 如果上一段送过文本：对当前 socket 发 `stop`，等接收任务看到 `finish`（改写 `_receive_messages`，收到 `finish` 时 set 一个 event）；这时上一段的音频已经全部 append 进上下文；
   - `append_to_audio_context(turn_ctx, 标记帧)`；
   - 重连（`_disconnect` / `_connect`）。之后第 N 段的文本照常经 `run_tts` 发出。第 0 段直接插标记，不用 stop。
3. 等 `finish` 的过程中要能被打断：`InterruptionFrame` 是系统帧（`frames/frames.py:1204`），不在普通帧队列里排队。它到达时，`FrameProcessor._start_interruption` 会取消并重建正在处理普通帧的任务（`processors/frame_processor.py:1130-1150`），卡在等 `finish` 的 `process_frame` 也就跟着取消了。前提是 `SegmentStartFrame` 不能是 `UninterruptibleFrame`。被取消后的收尾交给 `InterruptsFirst` 现有的重连逻辑。
4. 注意等待和重连的时间里，上下文可能空闲超过 `stop_frame_timeout_s = 3.0`，被当成结束，推出 `TTSStoppedFrame`（嘴会闭上）。之后的音频会按 `_turn_context_id` 自动重建上下文（`tts_service.py:1532-1538`），但 `TTSStartedFrame` 不会再发。所以这段等待必须明显短于 3 秒；如果做不到，把 `stop_frame_timeout_s` 调大。

误差：标记位置是精确的，所以只剩 §4.1 的误差（服务器端 ≤ 40ms，浏览器上早约 50～150ms）。

代价：第 N 段的合成要等第 N−1 段合成完、再重连之后才开始。第 N 段开口前可能出现一段停顿：约等于「重连（几十到几百毫秒）+ Fish 首音 0.59s」减去「第 N−1 段在合成完时还剩多少没播」。Fish 合成接近实时的话，剩下的很少，这段停顿会听得出来。**上线前要实测**。

**B. 每段一个 Fish 会话，并行（不会多出停顿，改动大）**

和 A 一样按段切会话，但下一段不等上一段结束：

- 第 N 段一开始就用一个新的（最好提前连好的）socket 发文本，同时对第 N−1 段的 socket 发 `stop`，让它自己收完。
- 每段一个 pipecat 音频上下文（覆盖 `create_context_id`，按段返回），每个 socket 的接收任务把音频 append 到自己那段的上下文，收到 `finish` 就 `remove_audio_context`。pipecat 本来就按上下文顺序播放：前一个排空了才播下一个（`_audio_context_task_handler`，§1.4），所以第 N 段并行合成出来的音频会缓存在自己的上下文里，等第 N−1 段放完。
- 每个上下文开头放标记帧。注意 `TTSStartedFrame`/`TTSStoppedFrame` 也会变成每段一个，`TTSStoppedFrame` 到输出层时会触发 `BotStoppedSpeaking`（`base_output.py:845-850`），口型会在段间闭嘴一下。要么保留这个效果，要么只让最后一段推 `TTSStoppedFrame`（`push_stop_frames` 按段控制）。
- 要重写 Fish 服务的连接和接收逻辑，还要和 `InterruptsFirst` 的重连合并。**要确认 Fish 账号允许同时开两个 WebSocket 会话**（没有查到公开说明）。

误差和 A 一样；多出的停顿只剩「新 socket 如果没提前连好，建连的时间」，而这段时间和上一段的播放是重叠的。

**C. 不改 Fish 会话，发送时插标记（不推荐，只适合临时凑合）**

段边界先 flush，然后在「第 N 段第一句发出时」把标记 append 进当前上下文。标记前面只有已经收到的音频，所以会**提前**「第 N−1 段还没收到的音频时长」：Fish 合成快时接近 0，接近实时时可达数秒。和直接用 `bot-tts-text` 差不多。

**D. Fish HTTP 流式接口（`POST /v1/tts`）逐段请求**

每个请求天然就是一段，边界清楚。但 pipecat 1.11.0 没有 Fish 的 HTTP 服务，要自己写。HTTP 服务的 `run_tts` 会把音频同步地一块块 yield 出来，TTS 在这期间不处理下一帧，所以段与段之间的合成也是串行的，停顿问题和 A 一样；一段内部也不能边写边合成。没有比 A 更好的地方。

### 推荐

先做 **A**：标记机制（§4.1）加上串行的每段会话，改动集中在一个 Fish mixin 和 `CallTurns`/`TurnTaking` 传段号这两处。实测段边界的停顿：听不出来就到此为止；听得出来再升级到 **B**。无论哪种，段边界主动 flush 聚合器都会让每段最后一句提早送出（§1.2）。

## 5. 纯前端方案为什么不行

- **按 `bot-started-speaking` 计数**：一条回复里段间几乎不会有 3 秒空档，`BotStartedSpeaking` 通常只来一次（§2），只能标出第 0 段。
- **按 `bot-tts-text` 对段**：可以按文字把句子对回段（`TTSTextFrame.text` 是带语气提示的日语句子，前端从 `delta` 里有这段的日语），但时刻偏早，段首句通常早 1～4 秒（§3）。
- **按收到的字幕和音频时长推算**：前端不知道每段合成出来多长，WebRTC 音轨里也没有段边界。用音量找静音只能碰巧对上句间停顿，靠不住。
- 字幕 `delta` 本来就比声音早，这是 ticket 07 不用它的原因。

## 6. 要改哪些代码（方案 A）

- `backend/src/eidolon/turn_taking.py`：`reply_delta` 收段号，`Voice` 带上段号（或者新增一个「开始第 N 段」命令）。加相应单测。
- `backend/src/eidolon/call.py`：
  - `CallTurns`：每条回复一个序号；第 N 段第一次 `Voice` 前推 `SegmentStartFrame(reply, segment)`。
  - 新增 Fish mixin（放在 `InterruptsFirst` 旁边，`class FishTTS(SegmentMarks, InterruptsFirst, FishAudioTTSService)`）：拦截 `SegmentStartFrame`，按 §4.2 A 的步骤 flush、`stop`、等 `finish`、插 `OutputTransportMessageFrame`、重连；接收任务在收到 `finish` 时 set event。
- `frontend/src/lib/api.ts`（`CallEvent` 加 `segment-playing`）以及立绘的状态管理：收到 `{type: "segment-playing", reply, segment}` 时，把这段的情绪和点头切上去（情绪来自 Jev 的逐段结果，按 ticket 05/07 的规则）。
- 测试：后端可以用 pipecat 的测试工具在 FishTTS mixin 上模拟 `audio`/`finish` 消息，检查标记帧在上下文队列里的位置；端到端的时间差要在真实通话里测（在前端记下 `segment-playing` 到达的时刻，和用 `AnalyserNode` 在音轨上测到的开口时刻对比）。
