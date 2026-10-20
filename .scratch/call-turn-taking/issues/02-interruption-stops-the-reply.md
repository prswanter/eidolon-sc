# 02: 打断时停止生成，只记下已经完整的几段

**What to build:** 通话中，当前回合已经可以被打断（判定方法见 01）时，用户开口就是打断。现在的做法是只停止发声，回复继续生成完、整条记下，新的话要等它生成完才开始。改成：打断时**立刻停止生成**，只记下已经完整的段落，半截的丢掉；之后照常写记忆，照常算一个回合，新说的话**马上**开始处理。规则见 `../spec.md` 和 `CONTEXT.md`「打断」。

**Blocked by:** 01

**Status:** resolved

- [x] engine 能让一个进行中的回合**提前收尾**：
  - 停掉 LLM 流（包括工具调用那一轮），只保留完整的段落；
  - 用这些段落 `add_turn`，照常 `memory.write_down`，再 `yield TurnDone`。
  - 这和「取消」不同：取消不留任何痕迹，是 01 的补充。
  - 收尾的方式由实现决定，比如给 `turn()` 传一个停止信号。
  - `ReplyParser` 要能给出「只含完整段落」的结果。按 01 的判定，能被打断的回合至少有一段是完整的，所以这里不会出现空回复。
- [x] 文字对话（非通话）的回合不受影响，也用不到提前收尾。
- [x] `CallTurns` 在当前回合可以被打断时收到 `InterruptionFrame`：
  - 停止发声（现有行为）；
  - 让回合提前收尾；
  - 收到 `TurnDone` 后计入 `recorded`。
  - 这句话定稿且非空时，马上开始新回合，不再排队等旧回复生成完。
  - 定稿为空时，什么都不做。
- [x] 打字仍然不打断：可以被打断之后打的字，排在这条回复**正常生成完**之后，行为和现在一样。
- [x] 浏览器照常收到 `done`，里面是截断后的消息。前端用它替换进行中的回复，预计不用改代码，只补一个测试：`done` 里的段落比已经显示的少时，以 `done` 为准。
- [x] 测试：
  - 打断后记下的段落只包含完整的几段；
  - 半截的一段被丢掉；
  - 在工具调用那一轮打断也能正常收尾；
  - 打断后照常写记忆；
  - 被打断的回合计入 `recorded`；
  - 打断后新的话马上开始处理，不必等旧回复的 LLM 流结束（用一个永不结束的假流来验证）；
  - 打断时定稿为空，不开新回合。
- [ ] 真实通话验证：在角色说完第一段、后面还在生成时插话。确认声音立刻停下；记录里只有完整的段落；新的一句在定稿后几百毫秒内就开始生成（`user` 事件到达）。在 Comments 里记下时间线。`uv run pytest`、`uv run pyright`、`npm test`、`npm run typecheck` 全部通过。

## Comments

2026-09-27 实现完成：

- **提前收尾**：`ConversationEngine.turn()` 新增 `stop: asyncio.Event | None` 参数。
  - 模型流的每次读取、每次工具调用，都和 `stop` 赛跑（`engine._unless_stopped`）。`stop` 一旦被置位，正在等的读取或工具调用就被取消，这一轮流也会被关掉。
  - 然后用 `ReplyParser.complete`（只含已经发过 `SegmentComplete` 的段）`add_turn`，照常 `write_down`，再 `yield TurnDone`。
  - 流正常结束时，`finish()` 已经把所有段都标为完整，所以 `complete` 和原来的 `segments` 一样。
  - 文字对话不传 `stop`，走的是直接 `await`，行为不变。
- **`CallTurns`**：每次回复都新建一个 `stop` 事件。收到 `InterruptionFrame` 时，如果回合已经可以被打断，就停止发声，再把这次回复的 `stop` 置位。
  - 回复在几十毫秒内收尾，`TurnDone` 计入 `recorded`。
  - 新的转写照常进队列。工作协程在旧回复收尾后立刻取到它，不用等旧的 LLM 流。
  - 定稿为空的，仍然在 `_take_up` 里被丢掉。
  - 打字不置位 `stop`。
  - 旧回复的 `stop` 不会漏到新回复：新事件是在 `create_task` 之前、中间没有 await 的地方建的。
- **测试**：
  - `test_turns.py`：
    - 模型流挂着时收尾，只留完整段；
    - 工具调用那一轮的第二次流挂着时收尾；
    - 工具本身挂着时收尾（`HangingEmbedder`）。
  - `test_call_turns.py`：
    - 打断后只记完整段，写记忆，计入回合数；
    - 用永不结束的假流（`fakes.HANG`）验证新的话马上被处理；
    - 打断后定稿为空，不开新回合；
    - 可以被打断之后打的字，等回复正常生成完。
  - 原来的 `test_interrupted_reply_stops_being_voiced_but_is_still_recorded` 按新规则改写，成了上面第一条。
  - 前端 `conversationLog` 补了「`done` 的段落比已显示的少时，以 `done` 为准」，代码没改。

真实通话验证（2026-09-27）：

- 方法同 01：aiortc 客户端的麦克风播放 Windows 语音合成的两句话，其余全部用真实服务。数据库是临时的，脚本是一次性的，没有提交。一共打了 4 次：
  - run1、run4 在生成途中插话成功；
  - run3 的打断刚好落在第 1 段结束时，所以没有半截可丢；
  - run2 的回复在打断到达前就已经生成完。
- run1 的时间线，时间单位为秒：

```
 8.28  麦克风：A「真乃，给我详细讲讲你今天都做了些什么吧，多说几句。」开始
14.89  TranscriptionFrame（Soniox 把「真乃」听成「珍奶」）
14.97  浏览器 user → 开始回复
25.70  浏览器收到第 0 段日语（模型首字约 10.7 秒）
26.33  BotStartedSpeakingFrame（UPSTREAM）
26.42  SegmentComplete 0；26.86 SegmentComplete 1；27.44 SegmentComplete 2
27.91  麦克风：B「等一下，我想问别的。」开始
28.44  SegmentComplete 3；28.45–28.72 第 4 段日语 delta
28.78  InterruptionFrame（已开口，且有完整的段 → 打断）
28.80  engine：stop 生效 → 写记忆 → TurnDone（4 段）
28.79  Fish TTS：断开 websocket；30.16 重连完成
30.17  BotStoppedSpeakingFrame（打断后约 1.39 秒）
30.19  浏览器 done：记录的 4 段，半截的第 4 段日语不在其中
31.08  TranscriptionFrame「等一下，我想问别的。」
31.08  浏览器 user「等一下，我想问别的。」（0 ms）→ 新回复，34.42 done
```

- **只记下完整的段落：成立。**
  - run1：浏览器收到日语 5 段、中文 4 段，记录了 4 段，逐字一致，半截的第 5 段被丢掉。
  - run4：浏览器收到日语 4 段、中文 3 段，记录了 3 段。
- **新的一句马上开始处理：成立。** 4 次里，`TranscriptionFrame` 到浏览器收到 `user` 都在 0–20 ms 以内（run3：23.73 → 23.75；run4：43.47 → 43.49）。
- **声音立刻停下：不成立。** 生成在 `InterruptionFrame` 之后约 20 ms 就停了，但声音还要再播 0.9–1.4 秒：
  - run1：28.78 → 30.17；
  - run3：21.44 → 22.52，客户端实测声音 22.56 才停；
  - run4：41.33 → 42.19，客户端 42.31 才停。

  原因在 Pipecat 1.11，是原有行为，不是这次引入的：
  - `InterruptibleTTSService._handle_interruption` 在角色说话时，会先断开再重连 Fish 的 websocket；
  - 而 `TTSService.process_frame` 要等它做完，才把 `InterruptionFrame` 往下游推；
  - 所以输出端要等重连结束才收到打断，这期间会把已缓冲的音频继续播出去。
  
  同样的原因，打断前已经发出的 delta 和 `done`（服务端消息也要经过 TTS）也会晚到约 1 秒。已另开 `04-voice-stops-at-once.md` 处理。所以这一项的真实通话验证没有打勾，其余几点都已确认。
- 空回复、闪烁、打断没生效的情况都没有出现。Soniox 在用户开口后约 0.8–1.2 秒才判定开始说话。
- `uv run pytest`：513 通过，另有 1 个失败，是 `test_characters.py::test_missing_character_sheet_is_reported_with_its_path`。它在 Windows 上因为路径分隔符失败，和本次改动无关。`uv run pyright` 0 错误。`npm test` 60 通过，`npm run typecheck` 通过。
