# 01: 通话中的补充：放下当前回复，合并后重新回复

**What to build:** 通话中，当前回合还不能被打断时，用户又说的话或打的字作为补充并入当前回合：立刻放下正在进行的回复，不留任何痕迹，再对合并后的整段话重新回复。已经可以被打断时，行为暂时保持现状（停止发声，新的话排队），改动放在 02。规则和定义见 `../spec.md`。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `CallTurns`（`backend/src/eidolon/call.py:500-624`）从「队列 + 单工作协程」改为能取消当前回合的结构，并记住当前回合的用户文本（若干句）。
- [x] 判定当前回合**能否被打断**，需要同时满足下面两条：
  - **已开口**，满足任一即可：
    - 发声时，收到输出端上行的 `BotStartedSpeakingFrame`（`CallTurns` 在 TTS 上游，能收到上行的这一份，需实测确认）；
    - 不发声时（静音，或 `_voicing` 为假），第一个 `delta` 已经发给浏览器；
    - 已经收到 `TurnDone`。
  - **已有完整的一段**：某段的 `</zh>` 已闭合；或者下一段已经开始（模型跳过了字幕）；或者这段所在的那一轮流已经结束。
  - 实现提示：`SegmentDelta` 现在看不出一段是否完整，需要由 `ReplyParser` 或 engine 给出信号。如果新增了事件，这个事件不发给浏览器。
- [x] 竞态提示：`TurnDone` 的 `add_turn` 与 `yield` 之间没有 await。`CallTurns` 收到 `TurnDone` 时，应先把回合标记为已开口，再做任何 await。这样一来，只要回合已经记下，就不会再被当作补充取消。
- [x] 补充的触发和处理：
  - 当前回合还不能被打断时，收到 `InterruptionFrame`（用户开口）就立刻取消当前回复，进入「等这句话」状态。
  - 取消的是整次 `engine.turn()`，包括检索和工具调用。被取消的那次不写记录、不写记忆，`recorded` 不加一。
  - 这句话定稿且非空时，把它接到当前回合的用户文本后面（用 `\n` 连接），然后用合并后的文本重新开始这个回合。
  - 打字（`user-text`）在当前回合还不能被打断时也走这条路。打字没有 `InterruptionFrame`，所以要由 `CallTurns` 自己清掉已经送去 TTS、还没播出的日语，比如发出一次打断。
- [x] 如果取消后这句话最终是空的，就用原来的用户文本重新开始这个回合。
  - 需要实测 Soniox 在这种情况下送来什么：空的 `TranscriptionFrame`、`UserStoppedSpeakingFrame`，还是什么都没有。
  - 如果可能什么都没有，就要加一个兜底超时，数值写成常量，并在 Comments 里说明依据。
- [x] 浏览器只需要照常收到事件：重新开始的回合会先发一个带合并后全文的 `user` 事件。
  - 前端 `conversationLog` 收到新的 `user` 事件时，已经会移除进行中的回合（用户气泡和已显示的字幕），再开一个新的（`frontend/src/lib/conversationLog.ts:37-40`）。预计前端不用改代码，只补测试。
  - 如果实测有闪烁或其他问题，再在 Comments 里记下来、做调整。
- [x] 通话限额行为保持不变：
  - 到时间了，等进行中的回合结束再挂断。
  - 回合数到上限就挂断。
  - 挂断以后说的话都不再处理。
  - 被取消的尝试不计入回合数。
- [x] 后端测试（`backend/tests/test_call_turns.py`），覆盖：
  - 开口前说出的补充会被合并：store 里只有一个回合，用户文本是 `A\nB`。
  - 打字补充同样合并。
  - 连续补充三次也合并成一个回合。
  - 回合已经可以被打断后，再说的话不合并。
  - 以下三种情况下再说的话，仍然算补充：
    - 已开口但还没有完整一段；
    - 静音时已出现第一句、但还没有完整一段；
    - 发声时字幕已出现、但还没有播出声音。
  - 已经收到 `TurnDone` 后再说的话，不再合并。
  - 补充定稿为空时，用原文重新生成。
  - 被取消的那次不计入 `recorded`，也不写记忆。
- [x] 现有测试 `test_interrupted_reply_stops_being_voiced_but_is_still_recorded` 要按新规则调整：让那条回复先开口、先有完整的一段，再触发打断。
- [x] 前端测试（`conversationLog`）：通话中第二个 `user` 事件会替换进行中的回合，包括已经显示的部分字幕，气泡显示合并后的全文。
- [x] 真实通话验证：按 spec 里 LAPLACE 的场景 2 做一次，也就是说半句、停 2 秒左右、在角色开口前说后半句。确认只有一个气泡、一条回复，而且回复同时回应了两句。在 Comments 里记下时间线。`uv run pytest`、`uv run pyright`、`npm test`、`npm run typecheck` 全部通过。

## Comments

2026-09-27 实现完成：

- 「完整的一段」由 `ReplyParser` 给出信号：新增 `SegmentComplete(segment)` 事件（`reply_format.py`）。`</zh>` 闭合、下一段开始、这一轮流结束（`finish()`）三种情况都会发出，每段只发一次。engine 把它和 delta 一起 yield，`TurnEvent` 也包含它。SSE（`app.py`）和 `CallTurns` 都不把它发给浏览器。
- `CallTurns` 仍然是「队列 + 一个工作协程」。不同的是，每次回复都在一个单独的任务里跑（`_reply`），可以单独取消。当前回合的用户文本记在 `_said` 里。能否被打断看 `_spoken and _complete` 两个标记。
  - 收到 `InterruptionFrame`：先把 `_following_on` 置位，再取消回复。
  - 收到补充的文字：先接到 `_said` 后面，再取消回复。
  - 两种情况都是先改状态、再 await 取消，这样工作协程醒来时看到的一定是新状态，不会拿旧文本重新开始。
  - 收到 `TurnDone` 时，在任何 await 之前就把回复标记为已开口，而且这时 `finish()` 已经发过 `SegmentComplete`。所以回复一旦记下，就不会再被当作补充取消。
- 打字的补充由 `CallTurns` 自己往下游推一个 `InterruptionFrame`，把 TTS 里还没播出的日语清掉。被取消的回复也照样推 `LLMFullResponseEndFrame`，让 LLM 回复的开始、结束帧成对；这个结束帧后面紧跟着打断，TTS 里残留的文字会一并被清掉。
- **兜底超时 `FOLLOW_ON_TIMEOUT = 4.0` 秒**，从最后一次听到用户（打断或中间转写）开始计时。依据：
  - 读 Pipecat 1.11 的源码：
    - Soniox 只有在端点时收到了 final token，才会发 `TranscriptionFrame`，不会发空的。端点时它总会提议结束这轮发言（`ProposedUserStoppedSpeakingFrame`）。
    - 但是 `ExternalUserTurnStopStrategy` 在没有文字的情况下不会结束这轮发言，要等 `UserTurnController` 的 5 秒超时，才广播 `UserStoppedSpeakingFrame`。
    - 而且 `UserStoppedSpeakingFrame` 是系统帧，会越过还在队列里的 `TranscriptionFrame`，所以不能拿它当「这句话是空的」的信号。
  - Soniox 的 `max_endpoint_delay_ms` 取值范围是 500–3000，也就是最后一个字之后最多 3 秒就会定稿。4 秒留了余量；用户还在说话时，中间转写会不断重新计时。
- 真实通话里 `BotStartedSpeakingFrame` 确实会**向上游**到达 `CallTurns`（见下面的时间线）。code review 指出了两个竞态，已经修复，并各加了测试：
  - **被取消的回复的声音晚到**：它的开口信号可能在新回复开始后才到。现在只有在本条回复的第一段日语已经送去 TTS 之后，收到的开口信号才算数。这之前总要等模型出字，而晚到的信号只会晚几毫秒。
  - **上一条的声音还在播，下一条接着播**：这时输出端不会再发开口信号。现在如果本条回复的第一段日语送去 TTS 时角色还在说话，就直接算已开口。
- 已知的空隙：`TurnDone` 之后、回复任务结束之前，还有发送 `done` 和 `LLMFullResponseEndFrame` 两次 await。这时的补充会因为「已开口 + 有完整的一段」被当作新回合，这是对的。只是这个窗口太短，测试无法稳定地落在里面，所以只测了回复任务已结束的情况。
- 前端没改代码。`conversationLog` 原来那个「新的一句替换未完成的回合」的测试，改写成了补充的情形：字幕已显示，再来 `user`，气泡显示合并后的全文，然后 `done`。

真实通话验证（2026-09-27）：

- 方法：aiortc 客户端的麦克风播放 Windows 语音合成的两句中文，其余全部用真实服务：Soniox、Fish Audio、对话模型。数据库是临时的。脚本是一次性的，没有提交。
- 本机要先下载 NLTK 的 `punkt_tab`（Dockerfile 里有这一步，本机没有，缺了 TTS 会报错），还要关掉 Jev（本机的 AI Gateway 是免费层，返回 403）。
- 场景 2，时间单位为秒：

```
 7.69  麦克风：A「哎，我今天有点累了。」开始
 9.36  UserStartedSpeaking → InterruptionFrame（没有进行中的回复，不算补充）
10.73  麦克风：A 结束，停 2 秒
10.89  TranscriptionFrame「哎，我今天有点累了。」
10.92  浏览器 user「哎，我今天有点累了。」 → 开始回复
12.72  麦克风：B「你能陪我随便聊聊天吗？」开始
12.92  浏览器收到第一条回复的第 0 段日语，13.06 收到它的字幕（还没有声音）
13.44  InterruptionFrame → 回复还没开口，取消，等这句话
15.83  TranscriptionFrame「你能陪我随便聊聊天吗？」
15.84  浏览器 user「哎，我今天有点累了。\n你能陪我随便聊聊天吗？」 → 重新回复，前一条的字幕被替换掉
17.98  重新回复的第 0 段日语
18.58  BotStartedSpeakingFrame（UPSTREAM）
19.25  浏览器 done：「プロデューサーさん、お疲れさまですっ。……えっと、今日はたくさん頑張ったんですね。ほわっ、わたしで……」
```

- 结果：记录里只有一个回合，用户文本是 `A\nB`，一条回复同时回应了两句。第一条回复已经显示了字幕，但因为还没有播出声音，仍然算补充。
- 回复一般分 3 段。第一段日语在 `user` 之后约 2 秒出现，声音在约 2.7 秒后开始播放。
- 空补充：用白噪声、140 Hz 的嗡声、截短到 0.12 秒的半个音节各试了一次，Soniox 都没有产生任何 token。没有打断，也没有转写，回复照常完成。所以「开口了但定稿为空」只会出现在 Soniox 先给出 token、之后又撤回的时候，用合成音频复现不了，由上面的 4 秒兜底超时处理，测试里也覆盖了。
- 浏览器端没有实际看过闪烁。按 `conversationLog` 的规则，被取消的那条回复已经显示的字幕，会在合并后的 `user` 到达时整体换掉。
- `uv run pytest`：507 通过，另有 1 个失败，是 `test_characters.py::test_missing_character_sheet_is_reported_with_its_path`。它在 Windows 上因为路径分隔符失败，改动前的 HEAD 上同样失败，和这次改动无关。`uv run pyright` 0 错误。`npm test` 59 通过，`npm run typecheck` 通过。
