# 03: 补充、打断、开口的规则抽成纯状态机 TurnTaking

**What to build:** 新建 `backend/src/eidolon/turn_taking.py`，里面是 `TurnTaking` 类：一个纯同步的状态机，负责通话中「当前回合」的轮替规则。`CallTurns`（`backend/src/eidolon/call.py:581-847`）改成 adapter，只做三件事：把 Pipecat 帧和回复任务的进展翻译成事件交给 `TurnTaking`，执行它返回的指令，以及管理它原本就负责、但不属于轮替规则的部分。

**行为不变是硬约束。** 规则的依据是 `CONTEXT.md` 的「回合」「补充」「打断」三条，以及 `.scratch/call-turn-taking/spec.md` 的 Decisions。背景见 `../spec.md`（这是 2026-09-28 架构审查的候选 2，这张 ticket 的设计在同一天的 grilling 中定下）。

**Blocked by:** None (can start immediately)（01 已合入 main）

**Status:** resolved

## Problem

轮替规则现在散落在三处：

- 12 个标志位：`_spoken`、`_sent_to_tts`、`_complete`、`_following_on`、`_voicing`、`_bot_speaking`、`_muted`、`_ended` 等；
- 两个 `asyncio.Event`：`_stop`、`_heard`；
- 回复任务自身的状态：`_reply.done()` / `cancelled()`。

判断逻辑分布在 `process_frame` 的分支、`_take_up`、`_open_to_follow_ons`、`_reply_to` 和 `_on_its_way_to_tts` 里。call-turn-taking 的 01–05 五张票每张都在改这些标志位。测试只能通过 Pipecat 的 `run_test` 跑，还要用 `SleepFrame(0.05)` 把帧隔开，免得前后顺序乱掉。

## 已定的设计（2026-09-28 grilling）

- **范围（C）**：`TurnTaking` 只管当前回合的轮替规则：
  - 补充和打断的判定；
  - 开口：出声时看声音开始播放，只看文字时看第一句出现，已经记下的也算开口；
  - 完整的一段；
  - 迟到的声音不算下一条回复开口；上一条的声音还在播时，下一条回复送出第一批字就算开口；
  - 补充落空后按原文重新回复；
  - 只看文字；
  - 挂断以后说的话都不再处理。

  **留在 `CallTurns`（adapter）的**：
  - 输入队列和工作协程；
  - 时长计时和回合上限；
  - 向 `CallOutcome` 报事件；
  - 管道启停（`StartFrame` / `EndFrame` / `CancelFrame`）；
  - 调用 `engine.turn()`、创建和取消回复任务；
  - 推帧、发 RTVI 消息。
- **纯同步，不碰时钟和 asyncio（A）**：`turn_taking.py` 不导入 asyncio、Pipecat 和 engine。每个事件方法都是同步的，返回一串指令。
  - 补充的转写超时（`FOLLOW_ON_TIMEOUT`）由 adapter 计时：`TurnTaking` 发出"开始等补充"的指令，adapter 到点后报"补充落空"事件。
  - 常量 `FOLLOW_ON_TIMEOUT` 可以留在 `call.py`。
- **只看文字的开关由 `TurnTaking` 持有**：`mute` 消息作为事件报给它。每条回复开始时由它决定出不出声，并写进"回复"指令里（`voiced`）。打断之后这条回复不再出声，这条规则也在它里面。
- **"通话正在结束"是一个事件**：adapter 在 `_end` 时报给 `TurnTaking`，之后的输入一律不响应，也不打断角色最后那段声音。
- **事件**（名字由实现者决定），至少要能表达：
  - 用户开口（`InterruptionFrame`）；
  - 听到了一点（`InterimTranscriptionFrame`，用来延长补充的等待）；
  - 转写定稿（可能为空）；
  - 发出打好的字；
  - 只看文字的开关变化；
  - 一个回合开始（带文字）；
  - 回复送出第一批日语给 TTS；
  - 回复的第一句显示（不出声时）；
  - 一段完整（`SegmentComplete`）；
  - 回复已记下（`TurnDone`）；
  - 回复结束（记下、失败或被拒）；
  - 回复被放下（任务取消完成）；
  - 声音开始播放 / 停止播放（`BotStarted` / `BotStoppedSpeakingFrame`）；
  - 补充落空；
  - 通话正在结束。
- **指令**：每种一个冻结的 dataclass，事件方法返回 `list[...]`，adapter 用 `match` 逐条执行。名字由实现者决定，至少要能表达：
  - 放下当前回复（取消任务，不留痕迹）；
  - 停止当前回复（设置 stop，只记完整的段）；
  - 清掉已送去 TTS 但还没播出的声音（往下游推 `InterruptionFrame`）；
  - 用某段文字（重新）回复，带 `voiced`；
  - 开始等补充；
  - 把某句话排成下一个回合。
- **时序**：现在 `_take_up` 靠"先改状态、再 await 取消"避免竞态。改成同步状态机后，状态在事件方法里就已经改完，指令之后才执行，所以这一点由结构本身保证。adapter 执行指令时不能破坏这一点，例如不能在执行指令之前 await。
- **名字**：`TurnTaking`，文件 `turn_taking.py`。**CONTEXT.md 不改**。
- **不碰的**：`CallOutcome`、`_LiveCall`、`Calls`、`InterruptsFirst` / `FishTTS`、engine、前端、`mute` 消息在线上的格式。

## 验收

- [x] **先证明行为不变**：`backend/tests/test_call_turns.py` 一行不改，在新实现上全部通过（25 个左右）。在 Comments 里记下这一步的结果。
- [x] 新建 `backend/tests/test_turn_taking.py`：表格测试，每条都是"事件序列 → 指令序列（和必要的状态）"，不用 sleep，也不用事件循环。`.scratch/call-turn-taking/spec.md` 的 Decisions 里，属于本 module 范围的每一条至少对应一个测试，包括：
  - 开口前说的话是补充：放下回复，合并后重新回复，文字用换行连接；
  - 开口前打的字是补充，还要清掉 TTS 里没播完的部分；
  - 补充次数不设上限；
  - 已经开口但还没有完整一段时，仍然算补充；只看文字时，已显示第一句但还没有完整一段时，也仍然算补充；
  - 已开口并有完整一段后，说话算打断：停止回复，这句话排成下一个回合；
  - 打字的打断同样要清掉没播完的声音；
  - 回复记下后、声音还在播时打字，会让声音立刻停下，这句话排成新回合；
  - 连着快速发两条：第一条打断，第二条按补充处理；
  - 补充落空后按原文重新回复；
  - 被放下的回复的声音迟到开始，不算下一条回复开口；
  - 上一条声音还在播时，下一条回复送出第一批字就算开口；
  - 只看文字的开关只影响之后的回复；
  - 通话正在结束后，说话和打字都不响应，也不打断最后那段声音。
- [x] 然后按"替换而不是叠加"拆分 `test_call_turns.py`：
  - 断言某条**规则**的测试，搬进 `test_turn_taking.py` 后删掉；
  - 断言**帧接线**的测试留下。例如：打字会往下游推 `InterruptionFrame`；只看文字时不往 TTS 送字；每条回复就是一次 TTS 回复；空输入被忽略；到上限就挂断；时长从接通算起；只用自带密钥的通话说不计入；失败和被拒的回合不计入、通话继续；补充落空后用真实计时按原文重新回复。

  在 Comments 里列一张表：每条原有测试是"留下"还是"移到哪条表格测试"。拿不准的就留下。
- [x] `CallTurns` 里不再有这些轮替标志位：`_spoken`、`_sent_to_tts`、`_complete`、`_following_on`、`_voicing`、`_bot_speaking`、`_muted`、`_ended`、`_stop` / `_heard` 的判定用途。adapter 需要的 `asyncio.Event`（例如传给 `engine.turn` 的 stop、等补充的计时）可以保留，但它们何时 set，要由指令决定。
- [x] `CallTurns` 的 docstring 改为指向 `TurnTaking`，规则的叙述搬到 `TurnTaking` 的 docstring。
- [x] `backend/` 下 `uv run pytest` 和 `uv run pyright` 都通过。`test_characters.py::test_missing_character_sheet_is_reported_with_its_path` 在 Windows 上本来就失败（路径是反斜杠），不算在内。
- [x] 按 TDD：先写 `test_turn_taking.py` 并看到它失败，再实现。

## Comments

### 实现（2026-09-28）

**做成的样子**

- `backend/src/eidolon/turn_taking.py`：`TurnTaking(text_only)`，纯同步，只导入 `dataclasses`、`typing`，以及 `reply_format` 的 `Lang`（review 后加的）。原来 `CallTurns` docstring 里的规则叙述搬到了它的 docstring。
- **事件**（方法，全部返回指令列表）：
  - 用户：`user_started_talking()`（`InterruptionFrame`）、`user_heard()`（`InterimTranscriptionFrame`）、`user_said(text)`（转写定稿，可以为空）、`user_typed(text)`、`text_only_switched(on)`（`mute` 消息）。
  - 回复：`turn_started(text)`、`reply_delta(lang, text)`、`segment_complete()`、`reply_recorded()`（`TurnDone`）、`reply_ended()`（记下、失败或被拒）、`reply_dropped()`（取消完成）、`follow_on_missed()`。
  - 声音和通话：`voice_started()` / `voice_stopped()`、`call_ending()`。另有只读属性 `ending`：工作协程用它跳过挂断后排队的输入和迟到的「时间到」。
- **指令**（冻结 dataclass，`Command` 是它们的联合）：`DropReply`、`StopReply`、`ClearVoice`、`Reply(text, voiced)`、`Voice(text)`、`WaitForFollowOn`、`QueueTurn(text)`。
- 回复的进度在 `TurnTaking` 里是 `None / "replying" / "dropping" / "dropped"` 四态。原来要靠 `_reply.done()` / `cancelled()` 和 `_following_on` 拼出这个判断，现在由它取代。`"dropped"` 就是「已放下、在等补充」。
- `CallTurns` 只剩以下几样：
  - 输入队列和工作协程；
  - 时长计时和回合上限；
  - `CallOutcome`；
  - 管道启停；
  - `engine.turn()` 和回复任务；
  - 推帧和 RTVI 消息；
  - 补充的计时任务 `_waiting`：`WaitForFollowOn` 重新计时，`Reply` 结束计时。

  `_stop` 仍然是传给 `engine.turn` 的 stop，只在收到 `StopReply` 时 set。`_heard`、`_muted`、`_ended` 和其余轮替标志位都没了。新增的 `_turn_over` 只是工作协程等「这个回合的回复结束了」用的 `asyncio.Event`，在报完 `reply_ended()` 的同一步里 set。

**和工单字面不同的地方**

- **多了一个指令 `Voice(text)`**：`reply_delta` 在这段日语要送 TTS 时返回它。「打断之后这条回复不再出声」这条规则在 `TurnTaking` 里，adapter 自己不知道当前回复还出不出声，所以每段 delta 送不送 TTS 都由它决定。`Reply.voiced` 仍然记下回复开始时的决定。
- 工单列的「回复送出第一批日语给 TTS」和「回复的第一句显示（不出声时）」合成了一个事件 `reply_delta(lang, text)`。要不要送 TTS 本来就是 `TurnTaking` 的决定，分成两个事件的话，adapter 得先知道答案。
- **行为变化（用户已确认接受，视为顺带修掉的旧 bug）**：
  - 场景：回复已经送了 TTS、有完整的一段，但声音还没播。这时用户开口，回复被放下；被放下那条回复的 `BotStartedSpeakingFrame` 迟到，然后转写定稿。
  - 旧代码：`_voicing and _sent_to_tts` 仍然成立，`_spoken` 被置真，这句就被排成下一个回合。4 秒后按原文重新回复，然后再单独回复这句。
  - 新代码：放下期间的回复一律可以接受补充，所以马上合并后重新回复。这符合 spec「被放下的回复的声音迟到开始，不算下一条回复开口」。
  - 锁定测试：`test_when_the_character_starts_speaking[the voice of a reply being dropped starting late does not make it spoken]`。
- `StopReply` 只在有回复进行中时发出。旧代码没有回复时也会 set 一个已经没人看的 stop，并清掉 `_voicing`，这两件事都没有可观察的效果。
- 挂断以后用户开口：`TurnTaking` 不返回任何指令，但 adapter 仍然把这个 `InterruptionFrame` 往下传，和原来一样。这是 Pipecat 自己的帧，不是 `ClearVoice`。「不打断最后那段声音」和原来一样，指的是打字不再推 `ClearVoice`。

**时序（review 时请重点看 `CallTurns._carry_out` / `_drop_reply`）**

- 事件方法同步改完状态，adapter 马上执行返回的指令，执行之前没有 await。所以「先改状态、再 await 取消」由结构保证。`TurnDone` 在发出 `done` 之前就报给 `reply_recorded()`。`reply_delta` 和原来一样，在发出 `delta` 之后再报。
- **`reply_dropped` 由执行 `DropReply` 的一方在取消完成后报。**
  - 几方同时在放下同一条回复时，谁先醒谁报。之后 `_reply` 已经换了，或者状态已经不是 `"dropping"`，其余几方就什么都不做。
  - 执行者自己被取消的情况也考虑过：Pipecat 处理打断时，会取消处理非系统帧的 process 任务。这只会由 `InterruptionFrame` 引起，而它的 `user_started_talking()` 在 `"dropping"` 时会再发一次 `DropReply`，所以总有一方报上去。
- **由此重新开始的回复，要等放下它的那一方做完余下的指令，才推出开头的帧**（`_start_reply(after=cut_off)`；如果是 `InterruptionFrame`，还要等这个帧往下传完）。
  - 这是没改动的旧测试逼出来的：`test_what_is_typed_before_the_character_speaks_joins_the_turn_and_stops_its_voice` 要求顺序是旧回复的 `LLMFullResponseEndFrame` → `InterruptionFrame` → 新回复的 `LLMFullResponseStartFrame`。
  - 旧代码能得到这个顺序，只是因为工作协程经 `asyncio.wait` 醒来要多隔几轮事件循环，碰巧排在后面。
  - 第一版实现用 done-callback 报 `reply_dropped`，新回复就抢到了 `InterruptionFrame` 前面，这条测试失败了。现在这个顺序由结构保证，不再靠事件循环的先后。
- 回复任务正常结束时（包括失败、被拒），在任务的最后一步同步报 `reply_ended()`。这和原来 `_open_to_follow_ons` 看 `reply.done()` 是同一个时刻，中间没有 await。
- 回复里出现意外异常时，记日志，照常结束这个回合。旧代码里这种异常由 Pipecat 的任务包装吞掉，工作协程照样往下走。新代码保留同样的效果，不让通话卡在这个回合里。

**先证明行为不变**：`test_call_turns.py` 一行没改（`git diff` 为空），在新实现上跑了 3 次，28 个全部通过；连同新的表格测试，一共 54 个通过。

**拆分 `test_call_turns.py`**（28 → 14；表格测试 26 条）：

| 原测试 | 处理 |
|---|---|
| `test_each_reply_is_one_tts_response` | 留下 |
| `test_muted_call_sends_subtitles_but_nothing_to_voice` | 留下 |
| `test_blank_input_is_ignored` | 留下（表格里另有 `test_blank_input_is_not_taken_up`） |
| `test_an_interruption_stops_the_reply_which_is_recorded_with_its_complete_segments` | 留下（stop → engine 收尾、写记忆、计入回合数） |
| `test_what_interrupts_the_character_is_taken_up_at_once` | 留下（用 HANG 验证不等旧的流） |
| `test_an_interruption_that_comes_to_nothing_takes_no_turn` | 移到 `test_interruptions[an interruption that comes to nothing takes no turn]` |
| `test_what_is_typed_once_the_reply_can_be_interrupted_interrupts_the_character` | 留下（打字往下游推 `InterruptionFrame`） |
| `test_what_is_typed_while_a_recorded_reply_is_still_heard_stops_her_voice` | 移到 `test_interruptions[what is typed while a recorded reply is still heard stops her voice]` |
| `test_what_is_typed_straight_after_interrupting_follows_on_the_new_turn` | 移到 `test_interruptions[of two sent straight after each other the first interrupts, the second follows on]` |
| `test_what_is_typed_once_the_call_has_ended_leaves_her_last_reply_voiced` | 移到 `test_once_the_call_is_ending_nothing_is_taken_up_and_her_last_reply_stays_voiced`。`_end` 报 `call_ending` 这条接线由两条挂断测试覆盖：不报的话，挂断后说的那句会被当成新回合 |
| `test_what_is_said_before_the_character_speaks_joins_the_turn` | 留下（被放下的回复不写记录、不写记忆，模型收到合并后的文本） |
| `test_what_is_typed_before_the_character_speaks_joins_the_turn_and_stops_its_voice` | 留下（帧的顺序） |
| `test_any_number_of_follow_ons_join_the_turn` | 移到 `test_follow_ons[any number of follow-ons join the turn]` |
| `test_until_the_character_has_spoken_a_complete_segment_the_user_follows_on[speaking]` | 移到 `test_follow_ons[speaking but with nothing complete yet she is followed on]` |
| 同上 `[muted]` | 移到 `test_text_only_a_reply_is_spoken_once_its_first_line_is_shown[its first line shown but nothing complete yet]` |
| 同上 `[not heard yet]` | 移到 `test_follow_ons[with a complete segment shown but not heard yet she is followed on]` |
| `test_once_the_character_has_spoken_a_complete_segment_what_is_said_is_a_new_turn[speaking]` | 移到 `test_interruptions[what is said stops the reply, which is voiced no further, and is the next turn]` |
| 同上 `[muted]` | 移到 `test_text_only_a_reply_is_spoken_once_its_first_line_is_shown[its first line shown and a segment complete]` |
| `test_once_the_reply_is_recorded_what_is_said_is_a_new_turn` | 移到 `test_interruptions[once the reply is recorded she has spoken]` |
| `test_a_reply_voiced_straight_after_the_last_one_has_been_spoken_once_it_is_on_its_way` | 移到 `test_when_the_character_starts_speaking[a reply voiced while the last one is still heard is spoken once it is on its way]`，另加一条反例：声音已经停了，下一条回复要等开口 |
| `test_the_voice_of_a_dropped_reply_starting_late_does_not_count_for_the_next` | 移到 `test_when_the_character_starts_speaking[the voice of a dropped reply starting late does not count for the next]` |
| `test_a_follow_on_that_comes_to_nothing_has_the_turn_replied_to_again[blank transcription]` | 移到 `test_follow_ons[a follow-on transcribed blank has the turn replied to again as it was]` |
| 同上 `[nothing at all]` | 留下，改名为 `test_a_follow_on_never_transcribed_has_the_turn_replied_to_again_in_time`（用真实计时） |
| `test_call_hangs_up_after_its_last_allowed_turn` | 留下 |
| `test_call_hangs_up_when_time_is_up_once_the_reply_in_progress_is_done` | 留下 |
| `test_a_calls_time_is_counted_from_when_it_connects` | 留下 |
| `test_a_call_on_the_users_own_keys_alone_says_it_does_not_count_when_it_ends` | 留下 |
| `test_turns_that_fail_or_are_rejected_do_not_count_and_the_call_goes_on` | 留下 |

表格测试里另有几条，是旧文件没有单独测过的：
- 回复还没放下完，转写就到了；
- 听到一点就重新计时；
- 等补充时打的字就是补充；
- 放下途中用户再次开口；
- 只看文字的开关只影响之后的回复；
- 声音已经停了，下一条回复要等开口。

**最终结果**：
- `uv run pytest`：575 通过，1 个失败，是已知的 `test_characters.py::test_missing_character_sheet_is_reported_with_its_path`（Windows 路径）。加上表格测试、拆分之前一共 590 个，拆分后 576 个。
- `uv run pyright`：0 错误。
- 拆分前那次全量测试里，`test_voice_interruption.py::test_interrupting_her_while_she_speaks_is_passed_on_before_reconnecting` 失败过一次。这条测试不经过 `CallTurns`，单独重跑 5 次都通过，拆分后的全量也通过，所以按已知的时序偶发失败处理。
- `ruff` 在 `call.py` 里报了两个没用到的 import（`SERVICE_LABELS`、`CallsUnavailable`）。改动之前就有，这次没动。

### 审查后的修改（2026-09-28）

- 「放下期间迟到的声音不算开口」的行为变化，用户已确认接受。补了一条表格测试来锁定它（TALKS → VOICE_STARTS → DROPPED → says → 合并后重新回复），并写进上面「和工单字面不同的地方」。
- `reply_delta` 的 `lang` 参数改用 `reply_format.Lang`，不再手写 `Literal`。
- `TurnTaking` 里回复进度的类型和字段改名为 `_ReplyState` / `_reply_state`，免得和指令 `Reply`、`CallTurns._reply` 同名。
- 执行指令只剩 `_carry_out` 一处：
  - `_drop_reply` 不再自己 `match`，改为返回 `reply_dropped()` 给出的指令；
  - `_carry_out` 新增参数 `after`，由它递归执行这些指令，新回复要等放下它的那一方做完（`cut_off`）才开始；
  - 时序保证和之前一样。`test_call_turns.py` 连跑 3 次，14 个都通过。
- 补了几处 docstring：`user_heard` 注明对应 `InterimTranscriptionFrame`；`_follow_on_timeout`、`_stop_waiting` 和测试里的 `text_only()` 各补了一句。
- 不处理：打字补充放下期间，又来一条前面没有 `InterruptionFrame` 的转写，这个竞态只是理论上可能。旧代码同样存在。
- 结果：
  - `uv run pytest`：576 通过，1 个失败，是已知的 Windows 路径那条；表格测试 27 条；
  - `uv run pyright`：0 错误。
