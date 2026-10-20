# 10: 调研：pipecat 怎么知道每段语音什么时候开始播放

Type: research
Status: resolved
Blocked by: none

## Question

通话中，后端（`backend/src/eidolon/call.py` 的通话处理器，位于 TTS 之前，把每段日语作为文本推给 pipecat 的 `FishAudioTTSService`）怎样才能知道「第 N 段的声音开始在用户那边播放了」，并告诉前端（例如 RTVI server message 带上段号）？候选：TTS 之后的 processor 或 RTVI observer 观察 `TTSStartedFrame`、`TTSTextFrame`、`BotStartedSpeakingFrame`、输出传输层的播放时刻；Fish Audio 没有逐词时间戳时，`TTSTextFrame` 什么时候发出（生成完还是播放时）；前端 `@pipecat-ai/client-js` 能收到的 `bot-tts-started`、`bot-tts-text`、`bot-started-speaking` 等事件与实际播放的时间差。给出可行的方案和误差量级，写明依据的 pipecat 版本（看 `backend` 的依赖锁定版本）。

## Research

调研在分支 `research/segment-playback-timing` 上进行，结论写在 [`research/segment-playback-timing.md`](../research/segment-playback-timing.md)（2026-10-01 从该分支挪进 main，分支已删除）。

## Answer

详细结论见 [`research/segment-playback-timing.md`](../research/segment-playback-timing.md)。依据 pipecat-ai 1.11.0（`uv.lock`）、client-js 1.13.1、small-webrtc-transport 1.10.8 的源码；没有跑真实通话，毫秒级的数字是从代码推算的。

- **现有事件都不能标出「第 N 段开始播放」**：`bot-tts-started` 每条回复只发一次（开始合成时）；`bot-started-speaking` 通常每条回复也只发一次（静音 3 秒才重置）；`bot-tts-text` 逐句发，但一段的第一句通常早到 1–4 秒；前端自己数只能认出第 0 段。
- **推荐的机制**：TTS 服务在第 N 段第一块音频之前，往音频队列里插一个 `OutputTransportMessageFrame`，内容是 RTVI server-message，例如 `{type: "segment-playing", reply, segment}`。输出传输层把它和音频放在同一个队列里，等它前面那块音频发出去才发送，所以时机跟着真实播放走。后端最多早 40ms 发出；到浏览器大约比听到声音早 50–150ms（蓝牙耳机更多），0.3 秒的动画过渡可以盖住。
- **难点在 Fish**：Fish v1 WebSocket 不告诉我们一段音频在哪里结束、下一段从哪里开始，唯一确定的边界是一次会话结束，所以每段要单独开一次 Fish 会话：
  - **简单版**：每到段落边界就结束当前会话，等 Fish 确认，插入标记，再重新连接。时机准确，但每段开头前可能多出一段听得出来的停顿（重连时间加上 Fish 约 0.59s 的首个音频延迟），需要实测。
  - **完整版**：各段的会话并行进行，每段一个音频上下文。没有额外停顿，但改动大，还要确认 Fish 是否允许同时开两个会话。
- **要改的代码**：`turn_taking.py` 的 `Voice` 带上段号；`call.py` 的 `CallTurns` 加回复编号并发出段落开始的帧；在 `InterruptsFirst` 旁边加一个处理段落边界的 Fish mixin；前端加一种新的 `CallEvent` 和立绘的状态。
- **顺带发现**：现在每段最后一句日语，要等下一段的第一个字到了（也就是下一段的中文字幕生成之后）才送给 Fish。在段落边界主动 flush 就能解决。

**需要拍板**：简单版的停顿能不能接受，要不要改做完整版，或者放宽「情绪在这段声音开始播放时切换」的要求。已另开 ticket。
