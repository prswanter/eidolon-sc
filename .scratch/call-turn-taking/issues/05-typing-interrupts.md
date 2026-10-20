# 05: 通话中打字也会打断角色

**What to build:** 通话中回复已经可以被打断时，用户发出打好的字要和开口说话一样打断角色。规则见 `../spec.md` 的 Decisions（「打断」下 2026-09-27 追加的几条），以及 `CONTEXT.md`「打断」一条（已更新）。

**Blocked by:** 04

**Status:** resolved

## 背景

2026-09-27 用户实测：先说一句话，角色的回复已经生成完、记下了，但声音还在播，这时打字发送，旧的声音不会停，新回复的声音排在后面。原因在 `CallTurns._take_up`（`backend/src/eidolon/call.py`）：回复不能再接受补充时，打的字只 `put_nowait` 进队列，不停掉回复，也不推 `InterruptionFrame`。回复还在生成时，打的字要等它生成完才处理。这原本是有意的设计（01–03 定的「打字不会打断角色」），现在改了。

## Agent Brief

**Category:** enhancement
**Summary:** 通话中发出打好的字，与用户开口说话走同一条打断路径

**Current behavior:**
回复已经可以被打断时（角色已开口，回复也有完整的一段；已经记下的也算），打的字排进队列，等这条回复生成完才开新回合。发声不停，新回复的声音排在旧声音后面播。

**Desired behavior:**
- 回复还在生成：声音立刻停，生成也停；这条回复只记下已经完整的几段，照常算一个回合；打的字马上开新回合。
- 回复已经记下、声音还在播：声音立刻停（经过 04 的 `InterruptsFirst`，同样要在几百毫秒内静音），记下的回复不变，打的字马上开新回合。
- 没有回复在进行，声音也没在播：和现在一样，直接开新回合。
- 静音通话：只停生成。
- 回复还不能被打断时：仍是补充，行为不变。连着快速发两条时，第一条打断，第二条是新回合的补充。
- 通话到上限、已经发出 `ended` 后：打的字不接收，也不打断最后那段声音（保持现状）。
- 以发出的那一刻（`user-text` 客户端消息）为准。前端不用改。

**Key interfaces:**
- `CallTurns._take_up(text, spoken=False)`：回复不能接受补充时，改为走和 `InterruptionFrame` 的「打断」分支相同的处理（`_voicing = False`、`_stop.set()`），再往下游推一个 `InterruptionFrame`，让声音停下，然后把文字放进队列。
- 注意：自己推出去的 `InterruptionFrame` 不会回到 `CallTurns.process_frame`，所以打断分支的逻辑要在 `_take_up` 里直接调用。最好抽成一个共用的方法，而不是复制一份。
- `CallTurns` 的 docstring 里「What the user types does not interrupt her and waits for the reply to finish.」要改掉。

**Acceptance criteria:**
- [x] `test_call_turns.py` 里原来的 `test_what_is_typed_once_the_reply_can_be_interrupted_waits_for_it_to_finish` 改成新行为：打的字停止生成，回复只记下完整的段，下游收到 `InterruptionFrame`，新回合马上开始。
- [x] 测试：回复已经记下、角色还在说话（`BotStartedSpeakingFrame` 之后，`BotStoppedSpeakingFrame` 之前）时打字，下游收到 `InterruptionFrame`，记下的回复不变，新回合开始。
- [x] ~~测试：没有回复在进行、角色也没在说话时打字，不推 `InterruptionFrame`。~~ 改为总是推，见 Comments。
- [x] 测试：`ended` 之后打字，不接收，也不推 `InterruptionFrame`。
- [x] 测试：打断后马上又打一条，并入新回合作为补充。
- [x] 真实通话验证：先说一句，在角色回复记下后、声音还在播时打字发送，声音在几百毫秒内停下，新回复正常出声。在 Comments 里记下时间线。
- [x] `uv run pytest`、`uv run pyright`、`npm test`、`npm run typecheck` 全部通过（`test_characters.py` 里那个 Windows 路径分隔符的已知失败除外）。

**Out of scope:**
- 通话外的文字对话（回复完成后声音还在播时再发消息）。
- 在输入框里打字（还没发出）就打断。
- 附和或噪音过滤。

**Docs:** `CONTEXT.md`、`../spec.md` 和三份 README 在分诊时已经改成新规则，实现时只需要改 `CallTurns` 的 docstring。

## Comments

### 实现（2026-09-27）

- `CallTurns._interrupt()`：把原来 `InterruptionFrame` 分支里的打断（`_voicing = False`、`_stop.set()`）抽出来，说话打断和打字打断共用。
- `_take_up`：回复不能再接受补充时，打的字先 `_interrupt()`，再往下游推一个 `InterruptionFrame`，然后排进队列。`_ended` 的检查在前面，所以通话结束后打的字既不接收，也不打断。
- **和工单不同的一点**：没有回复在进行时打字，也**总是**推 `InterruptionFrame`，不看 `_bot_speaking`。原因是回复记下之后，它的声音可能还在 Fish 那边合成，`BotStartedSpeakingFrame` 还没来，`CallTurns` 分不出来；这时不推，就又是背景里的那个问题。说话打断本来也总是推。什么都没在播时推一个打断是无害的：`InterruptsFirst` 只在 `_bot_speaking or _tts_started` 时重连，输出端只是清一个空缓冲。
- 测试（`test_call_turns.py`）：
  - 原来的「打的字等回复生成完」改为 `test_what_is_typed_once_the_reply_can_be_interrupted_interrupts_the_character`；
  - `test_what_is_typed_while_a_recorded_reply_is_still_heard_stops_her_voice`（用户报的场景）；
  - `test_what_is_typed_straight_after_interrupting_follows_on_the_new_turn`；
  - `test_what_is_typed_once_the_call_has_ended_leaves_her_last_reply_voiced`。
  - 静音通话没有另写测试：打字走的是和说话打断同一个 `_interrupt()`，静音时的打断已有测试。
- code review：
  - Standards 没有硬性违规；按建议把测试里的时序抽成 `INTERRUPTIBLE`，加了 `frame_types`。「停止回复再推打断」在 `_take_up` 里补充和打断两处各有一次，保留。
  - Spec 指出一个竞态：打断后旧回复还在收尾（写数据库，约几十毫秒）时又打一条，它会被当作又一次打断、单独排成一个回合，而不是并入新回合。说话也有同样的窗口，这次不处理。
- `uv run pytest`：522 通过，1 个失败是已知的 Windows 路径分隔符问题（`test_characters.py`）。`uv run pyright` 0 错误。`npm test` 60 通过，`npm run typecheck` 通过。

真实通话验证（2026-09-27）：

- 方法：一次性脚本（没有提交），进程内起后端，数据库是临时的，LLM、Soniox、Fish 都用真实服务；aiortc 客户端只打字，按收到的音频音量判断声音什么时候停（静下来 0.4 秒以上才算停，时刻记为开始静下来的那一刻）。Jev 返回 403（Vercel 免费额度），判断失败时回合照常进行，不影响本次验证。本机没有 `punkt_tab`，脚本里换成「不分句」，和测试一样。
- 回复已经记下、声音还在播时打字（两次）：

```
11.81  浏览器 done（A 已记下）
12.41  客户端还听得到 A 的声音 → 打字 B
12.42  bot-interrupted、浏览器 user「等一下，我想问别的。」、bot-stopped-speaking
12.56  客户端声音停下（打字后 0.16 秒；另一次 0.17 秒）
18.41  B 的回复出声
```

  A 的回复按原样完整记下。
- 回复还在生成时打字：打字后 0.01 秒浏览器收到 A 的 `done`（只含完整的段），0.11 秒声音停下，B 马上开始。
